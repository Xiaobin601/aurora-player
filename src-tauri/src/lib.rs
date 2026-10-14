mod proxy;

use std::sync::Mutex;
use tauri::{Manager, State};

pub struct AppState {
    pub proxy_port: Mutex<u16>,
}

#[tauri::command]
fn get_proxy_port(state: State<AppState>) -> Result<u16, String> {
    state
        .proxy_port
        .lock()
        .map(|guard| *guard)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_remote_api(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read body: {}", e))?;

    Ok(text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                match proxy::start_local_proxy().await {
                    Ok(port) => {
                        println!("[AuroraPlayer] Local stream proxy listening on 127.0.0.1:{}", port);
                        app.manage(AppState {
                            proxy_port: Mutex::new(port),
                        });
                    }
                    Err(e) => {
                        eprintln!("[AuroraPlayer] Failed to start local proxy: {}", e);
                        app.manage(AppState {
                            proxy_port: Mutex::new(0),
                        });
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_proxy_port, fetch_remote_api])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
