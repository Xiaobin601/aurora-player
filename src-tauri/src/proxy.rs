use axum::{
    extract::Query,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::Deserialize;
use tower_http::cors::CorsLayer;

#[derive(Deserialize)]
pub struct StreamQuery {
    pub url: String,
    pub referer: Option<String>,
    pub user_agent: Option<String>,
}

/// 启动本地微型流媒体代理服务（解决跨域、注入防盗链请求头、清洗切片伪装头）
pub async fn start_local_proxy() -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let app = Router::new()
        .route("/stream", get(handle_stream_proxy))
        .route("/health", get(|| async { "ok" }))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[Proxy] Server error: {}", e);
        }
    });

    Ok(port)
}

async fn handle_stream_proxy(Query(query): Query<StreamQuery>) -> impl IntoResponse {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Client init error").into_response(),
    };

    let mut req = client.get(&query.url);

    let ua = query.user_agent.unwrap_or_else(|| {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string()
    });
    req = req.header("User-Agent", ua);

    let referer = query.referer.unwrap_or_else(|| {
        if let Some(pos) = query.url.find("://") {
            let after_scheme = &query.url[pos + 3..];
            if let Some(slash_pos) = after_scheme.find('/') {
                format!("{}/", &query.url[..pos + 3 + slash_pos])
            } else {
                format!("{}/", query.url)
            }
        } else {
            "https://www.google.com/".to_string()
        }
    });
    req = req.header("Referer", referer);

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[Proxy] Upstream request failed for {}: {}", query.url, e);
            return (StatusCode::BAD_GATEWAY, format!("Upstream fetch failed: {}", e)).into_response();
        }
    };

    let status = resp.status();
    let content_type = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, format!("Read body failed: {}", e)).into_response();
        }
    };

    let mut data = bytes.to_vec();

    // 1. 如果是 M3U8 播放列表，解析并重写所有 TS 切片地址及解密 Key 地址
    let is_m3u8 = query.url.contains(".m3u8") || content_type.contains("mpegurl");
    if is_m3u8 {
        if let Ok(text) = String::from_utf8(data.clone()) {
            let base_url = query.url.rsplit_once('/').map(|(b, _)| format!("{}/", b)).unwrap_or_default();
            
            let rewritten_lines: Vec<String> = text
                .lines()
                .map(|line| {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && !trimmed.starts_with('#') {
                        let full_url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                            trimmed.to_string()
                        } else {
                            format!("{}{}", base_url, trimmed)
                        };
                        format!("/stream?url={}", urlencoding::encode(&full_url))
                    } else if trimmed.starts_with('#') && trimmed.contains("URI=\"") {
                        // 重写 #EXT-X-KEY:METHOD=AES-128,URI="enc.key" 等行中的加密密钥地址
                        let mut rewritten = trimmed.to_string();
                        if let Some(start_idx) = trimmed.find("URI=\"") {
                            let after_uri = &trimmed[start_idx + 5..];
                            if let Some(end_idx) = after_uri.find('"') {
                                let uri_val = &after_uri[..end_idx];
                                let full_key_url = if uri_val.starts_with("http://") || uri_val.starts_with("https://") {
                                    uri_val.to_string()
                                } else {
                                    format!("{}{}", base_url, uri_val)
                                };
                                let proxy_key_url = format!("/stream?url={}", urlencoding::encode(&full_key_url));
                                rewritten = format!("{}URI=\"{}\"{}", &trimmed[..start_idx], proxy_key_url, &after_uri[end_idx + 1..]);
                            }
                        }
                        rewritten
                    } else {
                        line.to_string()
                    }
                })
                .collect();

            let rewritten_body = rewritten_lines.join("\n");
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/vnd.apple.mpegurl"));
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));

            return (StatusCode::OK, headers, rewritten_body.into_bytes()).into_response();
        }
    }

    // 2. 如果是 TS 视频切片，检查并剥离“图片伪装头” (PNG / GIF / JPEG 填充)
    // MPEG-TS 数据包长度固定为 188 字节，包头同步字节为 0x47
    if data.len() > 188 && data[0] != 0x47 {
        if let Some(sync_pos) = data.iter().position(|&b| b == 0x47) {
            // 验证接下来是否符合 TS 分片特征 (连续若干个 188 字节步长也为 0x47)
            let is_ts = (sync_pos + 188 < data.len() && data[sync_pos + 188] == 0x47)
                || (sync_pos + 376 < data.len() && data[sync_pos + 376] == 0x47);
            
            if is_ts && sync_pos < 2048 {
                // 成功剥离伪装图片头
                data.drain(0..sync_pos);
            }
        }
    }

    let mut headers = HeaderMap::new();
    if let Ok(val) = HeaderValue::from_str(&content_type) {
        headers.insert(header::CONTENT_TYPE, val);
    }

    (status, headers, data).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_local_proxy_health_and_stream() {
        let port = start_local_proxy().await.expect("Failed to start proxy");
        assert!(port > 0);

        let client = reqwest::Client::new();
        let health_url = format!("http://127.0.0.1:{}/health", port);
        let resp = client.get(&health_url).send().await.expect("Health request failed");
        assert_eq!(resp.status(), 200);
        let text = resp.text().await.unwrap();
        assert_eq!(text, "ok");

        // 测试 M3U8 代理与切片重写
        let stream_proxy_url = format!(
            "http://127.0.0.1:{}/stream?url={}",
            port,
            urlencoding::encode("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8")
        );
        let stream_resp = client.get(&stream_proxy_url).send().await.expect("Stream fetch failed");
        assert_eq!(stream_resp.status(), 200);
        let m3u8_body = stream_resp.text().await.unwrap();
        assert!(m3u8_body.contains("#EXTM3U"));
        assert!(m3u8_body.contains("/stream?url="));
        println!("[Test] M3U8 rewriting verified successfully!");
    }
}
