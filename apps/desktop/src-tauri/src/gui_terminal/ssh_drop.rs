//! Bounded reads from files explicitly dropped into this window; never accept arbitrary read paths.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;

const CHUNK_BYTES: usize = 256 * 1024;
const MAX_HANDLES: usize = 64;
const IDLE_LIFETIME: Duration = Duration::from_secs(60 * 60);
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, thiserror::Error)]
enum DropError {
    #[error("client.ssh.localFileUnavailable")]
    Read,
    #[error("client.ssh.dropFilesOnly")]
    Folder,
}

struct Source {
    file: File,
    size: u64,
    touched: Instant,
}

#[derive(Default, Clone)]
pub(crate) struct SshDropState(Arc<Mutex<HashMap<String, Source>>>);

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Request {
    Open {
        paths: Vec<PathBuf>,
    },
    Read {
        token: String,
        offset: u64,
        length: usize,
    },
    Close {
        tokens: Vec<String>,
    },
}

#[derive(Serialize)]
pub(crate) struct FileInfo {
    token: String,
    name: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum Reply {
    Files { files: Vec<FileInfo> },
    Data { data: String },
    Done,
}

fn open_file(path: PathBuf) -> Result<(FileInfo, Source), DropError> {
    if !path.is_absolute() {
        return Err(DropError::Read);
    }
    let metadata = std::fs::metadata(&path).map_err(|_| DropError::Read)?;
    if metadata.is_dir() {
        return Err(DropError::Folder);
    }
    if !metadata.is_file() {
        return Err(DropError::Read);
    }
    let file = File::open(&path).map_err(|_| DropError::Read)?;
    let metadata = file.metadata().map_err(|_| DropError::Read)?;
    if !metadata.is_file() || metadata.len() > MAX_SAFE_INTEGER {
        return Err(DropError::Read);
    }
    let name = path
        .file_name()
        .ok_or(DropError::Read)?
        .to_string_lossy()
        .into_owned();
    let info = FileInfo {
        token: uuid::Uuid::new_v4().to_string(),
        name,
        size: metadata.len(),
    };
    Ok((
        info,
        Source {
            file,
            size: metadata.len(),
            touched: Instant::now(),
        },
    ))
}

impl SshDropState {
    fn perform(&self, request: Request) -> Result<Reply, DropError> {
        // This service is only invoked from the blocking pool; no UI/async thread waits for its lock.
        let mut sources = self.0.lock().map_err(|_| DropError::Read)?;
        sources.retain(|_, source| source.touched.elapsed() <= IDLE_LIFETIME);
        match request {
            Request::Open { paths } => {
                if paths.is_empty() || paths.len() + sources.len() > MAX_HANDLES {
                    return Err(DropError::Read);
                }
                let opened = paths
                    .into_iter()
                    .map(open_file)
                    .collect::<Result<Vec<_>, _>>()?;
                let mut files = Vec::with_capacity(opened.len());
                for (info, source) in opened {
                    sources.insert(info.token.clone(), source);
                    files.push(info);
                }
                Ok(Reply::Files { files })
            }
            Request::Read {
                token,
                offset,
                length,
            } => read_chunk(
                sources.get_mut(&token).ok_or(DropError::Read)?,
                offset,
                length,
            ),
            Request::Close { tokens } => {
                for token in tokens {
                    sources.remove(&token);
                }
                Ok(Reply::Done)
            }
        }
    }
}

fn read_chunk(source: &mut Source, offset: u64, length: usize) -> Result<Reply, DropError> {
    if length > CHUNK_BYTES
        || offset
            .checked_add(length as u64)
            .is_none_or(|end| end > source.size)
    {
        return Err(DropError::Read);
    }
    source
        .file
        .seek(SeekFrom::Start(offset))
        .map_err(|_| DropError::Read)?;
    let mut bytes = vec![0; length];
    source
        .file
        .read_exact(&mut bytes)
        .map_err(|_| DropError::Read)?;
    source.touched = Instant::now();
    Ok(Reply::Data {
        data: STANDARD.encode(bytes),
    })
}

#[tauri::command]
pub(crate) async fn codex_gui_ssh_drop_files(
    app: tauri::AppHandle,
    window: tauri::Webview,
    request: Request,
) -> Result<Reply, String> {
    if window.label() != "main" {
        return Err(DropError::Read.to_string());
    }
    let state = app.state::<SshDropState>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Request::Open { paths } = &request {
            app.state::<crate::codex_gui::dropped_files::DroppedFilesState>()
                .consume(paths)
                .map_err(|_| DropError::Read)?;
        }
        state.perform(request)
    })
    .await
    .map_err(|_| DropError::Read.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "ssh_drop_tests.rs"]
mod tests;
