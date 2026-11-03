//! Viewer-side commands never run clipboard, filesystem or COM work on Tauri's UI thread.
use super::{ClipboardError, Offer, ReadEvent, ReadRequest};
use crate::remote_desktop::clipboard::Content;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[cfg_attr(
    not(windows),
    expect(
        dead_code,
        reason = "Keep the same IPC schema on platforms using eager clipboard copies."
    )
)]
#[serde(tag = "action", rename_all = "camelCase")]
pub(crate) enum Request {
    Read,
    Chunk {
        request: ReadRequest,
    },
    Publish {
        offer: Offer,
    },
    Reply {
        #[serde(rename = "requestId")]
        request_id: String,
        data: Option<String>,
    },
    Release,
}

#[derive(Default, Serialize)]
pub(crate) struct Reply {
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

#[tauri::command]
pub(crate) async fn remote_desktop_local_file_clipboard(
    scope: String,
    request: Request,
    on_read: tauri::ipc::Channel<ReadEvent>,
) -> Result<Reply, String> {
    if uuid::Uuid::parse_str(&scope).is_err() {
        return Err(ClipboardError::Invalid.to_string());
    }
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || {
        apply(format!("viewer:{scope}"), request, Some(on_read))
    })
    .await
    .map_err(|_| ClipboardError::Access.to_string())?
    .map_err(|error| error.to_string());
    #[cfg(not(windows))]
    {
        let _ = (scope, request, on_read);
        Err(ClipboardError::Invalid.to_string())
    }
}

#[cfg(windows)]
fn apply(
    scope: String,
    request: Request,
    on_read: Option<tauri::ipc::Channel<ReadEvent>>,
) -> super::ClipboardResult<Reply> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let mut reply = Reply::default();
    match request {
        Request::Read => {
            reply.content = Some(match super::capture(&scope)? {
                Some(offer) => Content::FileOffer { offer },
                None => crate::remote_desktop::clipboard_platform::read_local()?,
            })
        }
        Request::Chunk { request } => {
            reply.data = Some(STANDARD.encode(super::read(&scope, &request)?))
        }
        Request::Publish { offer } => {
            let channel = on_read.ok_or(ClipboardError::Invalid)?;
            let send = std::sync::Arc::new(move |event| {
                channel.send(event).map_err(|_| ClipboardError::Access)
            });
            let reader = super::remote_reader(scope.clone(), send);
            super::publish(scope, offer, reader)?;
        }
        Request::Reply { request_id, data } => super::answer(&scope, request_id, data)?,
        Request::Release => super::release(&scope),
    }
    Ok(reply)
}
