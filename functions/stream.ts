// Cloudflare Pages Functions: /stream
// 优化版：支持切片智能直连（Smart Direct）与解密密钥代理中转，消除跨洋延迟

interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get("url");
  const forceProxyAll = url.searchParams.get("proxy_all") === "1";

  if (!targetUrl) {
    return new Response("Missing ?url parameter", { status: 400 });
  }

  try {
    let referer = "https://www.google.com/";
    try {
      const u = new URL(targetUrl);
      referer = `${u.protocol}//${u.host}/`;
    } catch {}

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Referer: referer,
      },
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const isM3u8 = targetUrl.includes(".m3u8") || contentType.includes("mpegurl");

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    if (isM3u8) {
      const text = await upstream.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("#") && trimmed.length > 0) {
            const fullUrl = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
            // 如果是二级子 m3u8，或者强制全局代理，走代理中转
            if (forceProxyAll || fullUrl.includes(".m3u8")) {
              return `/stream?url=${encodeURIComponent(fullUrl)}`;
            }
            // 默认模式：切片走国内 CDN 原始直连，彻底消除海外中转延迟与限速！
            return fullUrl;
          } else if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
            // 解密密钥必须通过代理中转以确保获取和注入 CORS
            const startIdx = trimmed.indexOf('URI="');
            const after = trimmed.substring(startIdx + 5);
            const endIdx = after.indexOf('"');
            if (endIdx !== -1) {
              const keyUrl = after.substring(0, endIdx);
              const fullKeyUrl = keyUrl.startsWith("http") ? keyUrl : baseUrl + keyUrl;
              return `${trimmed.substring(0, startIdx)}URI="/stream?url=${encodeURIComponent(fullKeyUrl)}"${after.substring(endIdx + 1)}`;
            }
          }
          return line;
        })
        .join("\n");

      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      responseHeaders.set("Cache-Control", "no-cache");
      return new Response(rewritten, { headers: responseHeaders });
    }

    // TS 视频切片处理 (当启用全局代理时使用)：剥离伪装图片头
    const arrayBuffer = await upstream.arrayBuffer();
    let bytes = new Uint8Array(arrayBuffer);

    // 仅在非加密的纯 TS 流上检测 0x47 同步字
    if (bytes.length > 188 && bytes[0] !== 0x47) {
      let syncPos = -1;
      const scanLimit = Math.min(bytes.length, 2048);
      for (let i = 0; i < scanLimit; i++) {
        if (bytes[i] === 0x47) {
          const isTs =
            (i + 188 < bytes.length && bytes[i + 188] === 0x47) ||
            (i + 376 < bytes.length && bytes[i + 376] === 0x47);
          if (isTs) {
            syncPos = i;
            break;
          }
        }
      }

      if (syncPos !== -1) {
        bytes = bytes.subarray(syncPos);
      }
    }

    responseHeaders.set("Content-Type", contentType);
    return new Response(bytes, { headers: responseHeaders });
  } catch (err: any) {
    return new Response(`Upstream error: ${err.message}`, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
};
