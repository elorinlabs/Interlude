use super::{ClipboardError, ClipboardResult, ReadEvent, Reader, Sender};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex, OnceLock},
    time::Duration,
};

type Pending = HashMap<(String, String), mpsc::SyncSender<ClipboardResult<Vec<u8>>>>;
static PENDING: OnceLock<Mutex<Pending>> = OnceLock::new();
const READ_TIMEOUT: Duration = Duration::from_secs(20);

pub(in crate::remote_desktop) fn remote_reader(scope: String, send: Sender) -> Reader {
    Arc::new(move |request| {
        let request_id = uuid::Uuid::new_v4().to_string();
        let key = (scope.clone(), request_id.clone());
        let (reply, receive) = mpsc::sync_channel(1);
        PENDING
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| ClipboardError::Access)?
            .insert(key.clone(), reply);
        let result = send(ReadEvent {
            kind: "clipboardFileRead",
            request_id,
            request,
        })
        .and_then(|()| {
            receive
                .recv_timeout(READ_TIMEOUT)
                .map_err(|_| ClipboardError::Access)?
        });
        if let Ok(mut pending) = PENDING.get_or_init(Default::default).lock() {
            pending.remove(&key);
        }
        result
    })
}

pub(in crate::remote_desktop) fn answer(
    scope: &str,
    request_id: String,
    data: Option<String>,
) -> ClipboardResult<()> {
    let reply = PENDING
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| ClipboardError::Access)?
        .remove(&(scope.into(), request_id))
        .ok_or(ClipboardError::Invalid)?;
    let result = data
        .filter(|value| value.len() <= super::super::clipboard::CHUNK_BYTES.div_ceil(3) * 4)
        .ok_or(ClipboardError::Access)
        .and_then(|value| STANDARD.decode(value).map_err(|_| ClipboardError::Invalid));
    // Explorer may have cancelled while the final network reply was in flight.
    let _ = reply.send(result);
    Ok(())
}

pub(in crate::remote_desktop) fn cancel(scope: &str) {
    if let Ok(mut pending) = PENDING.get_or_init(Default::default).lock() {
        pending.retain(|(owner, _), _| owner != scope);
    }
}
