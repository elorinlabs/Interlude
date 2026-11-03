use csw_chat_connectivity::packet_codec::{self, Request};
use tauri::Webview;

/// Each packet runs off the WebView/UI thread, including compression and decompression.
#[tauri::command]
pub(crate) async fn remote_chat_packet_codec(
    window: Webview,
    request: Request,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("CHAT_PACKET_CODEC".into());
    }
    tauri::async_runtime::spawn_blocking(move || packet_codec::transform(request))
        .await
        .map_err(|_| "CHAT_PACKET_CODEC".to_string())?
        .map_err(|_| "CHAT_PACKET_CODEC".to_string())
}
