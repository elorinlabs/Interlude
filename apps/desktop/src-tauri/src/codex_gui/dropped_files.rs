//! Read only files from a recent native drop, on a worker rather than the window thread.
use std::{
    fs::File,
    io::Read,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::clipboard::{file_reference, ClipboardFile};

const MAX_FILES: usize = 32;
const DROP_LIFETIME: Duration = Duration::from_secs(60);
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, thiserror::Error)]
enum DropError {
    #[error("文件添加失败，请重新选择。")]
    Read,
    #[error("请重新将文件拖入输入框。")]
    Expired,
    #[error("每条消息最多添加 32 个文件或文件夹。")]
    TooMany,
    #[error("远程聊天暂不支持拖入文件夹，请选择其中的文件。")]
    Folder,
    #[error("附件总大小过大，请减少照片或文件后再试。")]
    Size,
}

struct PendingDrop {
    paths: Vec<PathBuf>,
    received: Instant,
}

/// A short-lived, one-use grant created by an operating system drop into the main window.
#[derive(Default)]
pub(crate) struct DroppedFilesState(Arc<Mutex<Option<PendingDrop>>>);

impl DroppedFilesState {
    /// Consume the native grant before creating a bounded SSH upload source. Call on a worker.
    pub(crate) fn consume(&self, paths: &[PathBuf]) -> Result<(), String> {
        authorize(
            &mut *self.0.lock().map_err(|_| DropError::Read.to_string())?,
            paths,
        )
        .map_err(|error| error.to_string())
    }
}

/// Record the grant before Tauri forwards the drop to JavaScript. Window listeners run too late;
/// multi-webview windows also deliver drops as webview events instead of window events.
pub(crate) fn handle_run_event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    let (label, drop) = match event {
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::DragDrop(drop),
            ..
        }
        | tauri::RunEvent::WebviewEvent {
            label,
            event: tauri::WebviewEvent::DragDrop(drop),
            ..
        } => (label, drop),
        _ => return,
    };
    record_drop(&app.state::<DroppedFilesState>(), label, drop);
}

fn record_drop(state: &DroppedFilesState, label: &str, event: &tauri::DragDropEvent) {
    if label != "main" {
        return;
    }
    let tauri::DragDropEvent::Drop { paths, .. } = event else {
        return;
    };
    // The UI thread must never wait for a file reader to release a lock.
    match state.0.try_lock() {
        Ok(mut pending) => {
            *pending = (paths.len() <= MAX_FILES).then(|| PendingDrop {
                paths: paths.to_vec(),
                received: Instant::now(),
            });
        }
        Err(error) => eprintln!("could not record dropped files: {error}"),
    };
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DropMode {
    Local,
    Remote,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DropRequest {
    paths: Vec<PathBuf>,
    mode: DropMode,
    max_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedFile {
    name: String,
    mime_type: &'static str,
    data: String,
}

/// Remote exports contain names and bytes, never the sender's filesystem paths.
#[derive(Default, Serialize)]
pub(crate) struct DropResponse {
    references: Vec<ClipboardFile>,
    files: Vec<DroppedFile>,
}

fn authorize(pending: &mut Option<PendingDrop>, paths: &[PathBuf]) -> Result<(), DropError> {
    if paths.is_empty() || paths.len() > MAX_FILES {
        return Err(DropError::TooMany);
    }
    let grant = pending.as_ref().ok_or(DropError::Expired)?;
    if grant.received.elapsed() > DROP_LIFETIME || paths != grant.paths {
        return Err(DropError::Expired);
    }
    *pending = None;
    Ok(())
}

fn read_file(path: PathBuf, remaining: &mut u64) -> Result<DroppedFile, DropError> {
    file_reference(path.clone()).map_err(|_| DropError::Read)?;
    if path.is_dir() {
        return Err(DropError::Folder);
    }
    let file = File::open(&path).map_err(|_| DropError::Read)?;
    let metadata = file.metadata().map_err(|_| DropError::Read)?;
    if !metadata.is_file() || metadata.len() > *remaining {
        return Err(DropError::Size);
    }
    let mut bytes = Vec::new();
    file.take(*remaining + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| DropError::Read)?;
    if bytes.len() as u64 > *remaining {
        return Err(DropError::Size);
    }
    *remaining -= bytes.len() as u64;
    let mime_type = image::guess_format(&bytes)
        .map(|format| format.to_mime_type())
        .unwrap_or("application/octet-stream");
    Ok(DroppedFile {
        name: path
            .file_name()
            .ok_or(DropError::Read)?
            .to_string_lossy()
            .into_owned(),
        mime_type,
        data: STANDARD.encode(bytes),
    })
}

fn read(request: DropRequest) -> Result<DropResponse, DropError> {
    match request.mode {
        DropMode::Local => Ok(DropResponse {
            references: request
                .paths
                .into_iter()
                .map(file_reference)
                .collect::<Result<_, _>>()
                .map_err(|_| DropError::Read)?,
            ..Default::default()
        }),
        DropMode::Remote => {
            let mut remaining = request
                .max_bytes
                .filter(|bytes| *bytes > 0 && *bytes <= MAX_SAFE_INTEGER)
                .ok_or(DropError::Size)?;
            let files = request
                .paths
                .into_iter()
                .map(|path| read_file(path, &mut remaining))
                .collect::<Result<_, _>>()?;
            Ok(DropResponse {
                files,
                ..Default::default()
            })
        }
    }
}

#[tauri::command]
pub(crate) async fn codex_gui_dropped_files(
    window: tauri::Webview,
    state: tauri::State<'_, DroppedFilesState>,
    request: DropRequest,
) -> Result<DropResponse, String> {
    if window.label() != "main" {
        return Err(DropError::Read.to_string());
    }
    let pending = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || {
        authorize(
            &mut *pending.lock().map_err(|_| DropError::Read)?,
            &request.paths,
        )?;
        read(request)
    })
    .await
    .map_err(|_| DropError::Read.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "dropped_files_tests.rs"]
mod tests;
