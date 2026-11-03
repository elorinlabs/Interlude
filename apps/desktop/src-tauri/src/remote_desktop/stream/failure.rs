//! Deliver a display-safe failure before closing the media channel that carries it.
use super::native::Stream;
use crate::remote_desktop::{safe_error, DesktopError};
use std::{sync::Arc, time::Duration};
use webrtc::data_channel::data_channel_state::RTCDataChannelState;

const ERROR_DELIVERY_TIMEOUT: Duration = Duration::from_secs(1);

pub(super) async fn notify(stream: &Stream, error: DesktopError) {
    let error = classify(error).await;
    let peer = Arc::clone(&stream.peer.borrow());
    if peer.controls.ready_state() != RTCDataChannelState::Open {
        return;
    }
    let message = serde_json::json!({"kind": "error", "message": safe_error(error)}).to_string();
    let delivery = async {
        peer.controls.send_text(message).await?;
        // The receiver closes after displaying the reason. Give reliable SCTP a bounded chance
        // to deliver it instead of destroying the connection immediately after enqueueing it.
        while peer.controls.ready_state() == RTCDataChannelState::Open {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        Ok::<_, webrtc::Error>(())
    };
    if let Ok(Err(error)) = tokio::time::timeout(ERROR_DELIVERY_TIMEOUT, delivery).await {
        eprintln!("desktop failure notification: {error}");
    }
}

async fn classify(error: DesktopError) -> DesktopError {
    #[cfg(windows)]
    if matches!(error, DesktopError::Platform) {
        if let Ok(Err(locked)) =
            tauri::async_runtime::spawn_blocking(super::super::session_access::check).await
        {
            return locked;
        }
    }
    error
}
