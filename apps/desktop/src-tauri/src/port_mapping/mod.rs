//! Native loopback sinks for authenticated port streams. Control and upload credit remain link-scoped.
mod buffer;
mod cipher;
mod commands;
mod receiver;
mod sockets;
#[cfg(test)]
mod tests;

pub(crate) use commands::*;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};
use uuid::Uuid;

const MAX_RECEIVERS: usize = 8;
const MAX_SOCKETS: usize = 24;
const MAX_RECORD_BYTES: usize = 16 * 1024;
const WINDOW_BYTES: u64 = 2 * 1024 * 1024;
const BATCH_BYTES: usize = 384 * 1024;
const MAX_POSITION: u64 = (1 << 53) - 1;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("映射连接已中断，请重新启动。")]
    Closed,
    #[error("映射连接无效，请重新连接电脑。")]
    Invalid,
    #[error("映射连接较多，请稍后重试。")]
    Limit,
    #[error("映射连接无效，请重新连接电脑。")]
    Authentication,
    #[error("映射连接较多，请稍后重试。")]
    ControlQueue,
}
type Result<T> = std::result::Result<T, Error>;
fn lock<T>(value: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    value.lock().map_err(|_| Error::Closed)
}

/// One application owns every receiver and accepted socket; only the main WebView may attach them.
#[derive(Default)]
pub(crate) struct State {
    receivers: Mutex<HashMap<Uuid, Arc<receiver::Receiver>>>,
    sockets: Mutex<HashMap<u32, Arc<sockets::Socket>>>,
    next_socket: std::sync::atomic::AtomicU32,
}

impl State {
    pub fn register(&self, id: Uuid, epoch: Uuid, key: &[u8]) -> Result<()> {
        let mut receivers = lock(&self.receivers)?;
        if receivers.contains_key(&id) || receivers.len() >= MAX_RECEIVERS {
            return Err(Error::Limit);
        }
        receivers.insert(id, Arc::new(receiver::Receiver::new(id, epoch, key)?));
        Ok(())
    }

    fn receiver(&self, id: &Uuid) -> Result<Arc<receiver::Receiver>> {
        lock(&self.receivers)?.get(id).cloned().ok_or(Error::Closed)
    }

    pub fn close(&self, id: &Uuid) -> Result<()> {
        if let Some(receiver) = lock(&self.receivers)?.remove(id) {
            receiver.close();
        }
        Ok(())
    }

    /// Intercept only registered identities; authentication and replay checks precede socket writes.
    pub fn route(&self, bytes: &[u8]) -> bool {
        let Some(id) = bytes
            .get(8..24)
            .and_then(|value| Uuid::from_slice(value).ok())
        else {
            return false;
        };
        let Ok(receiver) = self.receiver(&id) else {
            return false;
        };
        if let Err(error) = receiver.receive(bytes) {
            if !matches!(error, Error::Closed) {
                crate::error_logs::record_codex_error(&format!(
                    "Port mapping receiver stopped: {error:?}"
                ));
            }
            receiver.close();
        }
        true
    }

    pub fn reap(&self) -> Result<()> {
        lock(&self.receivers)?.retain(|_, receiver| {
            if receiver.expired() {
                crate::error_logs::record_codex_error(
                    "Port mapping receiver stopped: polling lease expired",
                );
                receiver.close();
                return false;
            }
            true
        });
        lock(&self.sockets)?.retain(|_, socket| {
            if socket.closed() {
                socket.close();
                return false;
            }
            true
        });
        Ok(())
    }
}

pub(crate) fn start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    let state = Arc::new(State::default());
    app.manage(state.clone());
    let weak = Arc::downgrade(&state);
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            let Some(state) = weak.upgrade() else {
                return;
            };
            if let Err(error) = state.reap() {
                eprintln!("Port stream cleanup: {error}");
            }
        }
    });
}
