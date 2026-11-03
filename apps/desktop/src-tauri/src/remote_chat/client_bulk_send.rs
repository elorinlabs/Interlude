//! Viewer relay writes acknowledge native socket admission and share a bounded IPC budget.
use super::{
    bulk,
    client::{self, ClientCommand},
    protocol::ChatError,
};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Webview,
};
use tokio::sync::{oneshot, OwnedSemaphorePermit};

pub(super) struct ClientBulkSend {
    pub session: String,
    pub frames: Vec<Vec<u8>>,
    pub completed: oneshot::Sender<Result<(), ChatError>>,
    pub _memory: OwnedSemaphorePermit,
}

#[tauri::command]
pub(crate) async fn gui_remote_bulk_send(
    app: AppHandle,
    window: Webview,
    request: Request<'_>,
) -> Result<(), String> {
    client::require_main(&window)?;
    let invalid = || "连接已中断，请重新连接。".to_string();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(invalid());
    };
    let memory = bulk::reserve_bytes(bytes.len()).map_err(|_| invalid())?;
    let (session, frames) = bulk::parse_frames(bytes).map_err(|_| invalid())?;
    let client_id = request
        .headers()
        .get("x-file-bulk-client")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(invalid)?
        .to_owned();
    uuid::Uuid::parse_str(&client_id).map_err(|_| invalid())?;
    let (completed, result) = oneshot::channel();
    client::submit(
        app,
        client_id,
        ClientCommand::Bulk(ClientBulkSend {
            session,
            frames,
            completed,
            _memory: memory,
        }),
    )
    .await?;
    result.await.map_err(|_| invalid())?.map_err(|_| invalid())
}
