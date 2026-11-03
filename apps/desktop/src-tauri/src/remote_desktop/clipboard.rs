//! Bounded, ordered clipboard transfers share the active desktop session and its input worker.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

pub(super) const CHUNK_BYTES: usize = 32 * 1024;
pub(super) const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_WIRE_BYTES: usize = MAX_BYTES * 2;
const TRANSFER_LEASE: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
pub(super) enum ClipboardError {
    #[error("电脑未允许此剪贴板操作，请在电脑的设置中调整。")]
    Denied,
    #[error("剪贴板内容无效，请重新复制。")]
    Invalid,
    #[error("剪贴板内容过大，请分批复制（每次最多 64 MB）。")]
    Size,
    #[error("无法访问剪贴板，请重新复制后再试。")]
    Access,
    #[error("暂不支持复制文件夹，请先压缩后再复制。")]
    Directory,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("未能复制所选内容，请确认远程窗口后重试。")]
    Copy,
}
pub(super) type ClipboardResult<T> = std::result::Result<T, ClipboardError>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardMessage {
    pub request_id: u32,
    transfer_id: String,
    request: Request,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum Request {
    Read {
        shortcut: Option<Shortcut>,
        #[serde(default, rename = "fileStreaming")]
        file_streaming: bool,
    },
    Copy {
        shortcut: Shortcut,
        #[serde(default, rename = "fileStreaming")]
        file_streaming: bool,
    },
    Paste {
        #[serde(rename = "preferLocal")]
        prefer_local: bool,
    },
    Begin {
        length: usize,
    },
    Append {
        offset: usize,
        data: String,
    },
    Commit {
        paste: bool,
        #[serde(rename = "expectedRevision")]
        expected_revision: Option<String>,
    },
    Chunk {
        offset: usize,
    },
    Clear,
    #[cfg(windows)]
    Files {
        request: super::clipboard_stream::host::Request,
    },
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Shortcut {
    Copy,
    Cut,
}

#[derive(Default, Serialize)]
pub(crate) struct ReplyData {
    #[serde(skip_serializing_if = "Option::is_none")]
    length: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pasted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revision: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardReply {
    kind: &'static str,
    request_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<ReplyData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "format", rename_all = "camelCase")]
pub(crate) enum Content {
    Text {
        text: String,
    },
    Image {
        data: String,
    },
    Files {
        files: Vec<ClipboardFile>,
    },
    FileOffer {
        offer: super::clipboard_stream::Offer,
    },
}
#[derive(Deserialize, Serialize)]
pub(crate) struct ClipboardFile {
    pub name: String,
    pub data: String,
}

pub(super) struct Transfer {
    id: String,
    bytes: Vec<u8>,
    expected: Option<usize>,
    touched: Instant,
}
impl Transfer {
    fn new(id: String, bytes: Vec<u8>, expected: Option<usize>) -> ClipboardResult<Self> {
        if bytes.len().max(expected.unwrap_or(0)) > MAX_WIRE_BYTES {
            return Err(ClipboardError::Size);
        }
        Ok(Self {
            id,
            bytes,
            expected,
            touched: Instant::now(),
        })
    }
    fn append(&mut self, offset: usize, data: &str) -> ClipboardResult<()> {
        if data.len() > CHUNK_BYTES * 2 {
            return Err(ClipboardError::Size);
        }
        let chunk = STANDARD.decode(data).map_err(|_| ClipboardError::Invalid)?;
        if offset != self.bytes.len()
            || chunk.is_empty()
            || chunk.len() > CHUNK_BYTES
            || self.bytes.len() + chunk.len() > self.expected.ok_or(ClipboardError::Invalid)?
        {
            return Err(ClipboardError::Invalid);
        }
        self.bytes.extend(chunk);
        Ok(())
    }
}

pub(super) fn handle(id: &str, message: ClipboardMessage) -> ClipboardReply {
    handle_with_sender(id, message, None)
}

fn handle_with_sender(
    id: &str,
    message: ClipboardMessage,
    sender: Option<super::clipboard_stream::Sender>,
) -> ClipboardReply {
    let request_id = message.request_id;
    let result = super::with_session(id, |session| Ok(apply(session, message, sender)))
        .map_err(super::safe_error)
        .and_then(|result| result.map_err(|error| error.to_string()));
    let (result, error) = match result {
        Ok(reply) => (Some(reply), None),
        Err(error) => (None, Some(error)),
    };
    ClipboardReply {
        kind: "clipboard",
        request_id,
        result,
        error,
    }
}

fn apply(
    session: &mut super::Session,
    message: ClipboardMessage,
    _sender: Option<super::clipboard_stream::Sender>,
) -> ClipboardResult<ReplyData> {
    authorize(&session.permissions, &message.request)?;
    if message.transfer_id.is_empty() || message.transfer_id.len() > 100 {
        return Err(ClipboardError::Invalid);
    }
    let id = message.transfer_id;
    match message.request {
        Request::Copy {
            shortcut,
            file_streaming,
        } => {
            super::clipboard_platform::copy_selection(session, shortcut)?;
            session.clipboard_revision = super::clipboard_revision::current().ok();
            // Sharing is optional: folders, large files and private formats still copy natively.
            if !session.permissions.clipboard_read {
                return Ok(ReplyData::default());
            }
            Ok(read_content(session, id, None, file_streaming).unwrap_or_default())
        }
        Request::Paste { prefer_local } => prepare_paste(session, prefer_local),
        Request::Read {
            shortcut,
            file_streaming,
        } => read_content(session, id, shortcut, file_streaming),
        #[cfg(windows)]
        Request::Files { request } => {
            let host = session.id.clone();
            let sender = _sender.unwrap_or_else(|| {
                std::sync::Arc::new(move |event| {
                    tauri::async_runtime::block_on(super::stream::send_clipboard_file(&host, event))
                })
            });
            super::clipboard_stream::host::apply(session, request, sender)
        }
        Request::Begin { length } => {
            if length == 0 {
                return Err(ClipboardError::Invalid);
            }
            session.clipboard = Some(Transfer::new(id, Vec::new(), Some(length))?);
            Ok(ReplyData::default())
        }
        Request::Clear => {
            if session
                .clipboard
                .as_ref()
                .is_some_and(|transfer| transfer.id == id)
            {
                session.clipboard = None;
            }
            Ok(ReplyData::default())
        }
        request => continue_transfer(session, &id, request),
    }
}

fn read_content(
    session: &mut super::Session,
    id: String,
    shortcut: Option<Shortcut>,
    _file_streaming: bool,
) -> ClipboardResult<ReplyData> {
    if let Some(shortcut) = shortcut {
        super::clipboard_platform::copy_selection(session, shortcut)?;
    }
    #[cfg(windows)]
    let offer = if _file_streaming && session.permissions.files {
        super::clipboard_stream::capture(&format!("host:{}", session.id))?
    } else {
        None
    };
    #[cfg(not(windows))]
    let offer: Option<super::clipboard_stream::Offer> = None;
    let content = match offer {
        Some(offer) => Content::FileOffer { offer },
        None => super::clipboard_platform::read_local()?,
    };
    allow_content(&session.permissions, &content)?;
    let bytes = serde_json::to_vec(&content).map_err(|_| ClipboardError::Invalid)?;
    let length = bytes.len();
    session.clipboard = Some(Transfer::new(id, bytes, None)?);
    Ok(ReplyData {
        length: Some(length),
        ..Default::default()
    })
}

fn can_import(
    prefer_local: bool,
    allowed: bool,
    previous: Option<&str>,
    current: Option<&str>,
) -> bool {
    prefer_local && allowed && current.is_some() && previous == current
}

pub(super) fn paste_original(session: &mut super::Session) -> ClipboardResult<ReplyData> {
    super::clipboard_platform::paste_selection(session)?;
    session.clipboard_revision = super::clipboard_revision::current().ok();
    Ok(ReplyData {
        pasted: Some(true),
        ..Default::default()
    })
}

fn prepare_paste(session: &mut super::Session, prefer_local: bool) -> ClipboardResult<ReplyData> {
    let revision = super::clipboard_revision::current().ok();
    if can_import(
        prefer_local,
        session.permissions.clipboard_write,
        session.clipboard_revision.as_deref(),
        revision.as_deref(),
    ) {
        return Ok(ReplyData {
            pasted: Some(false),
            revision,
            ..Default::default()
        });
    }
    paste_original(session)
}

fn allow_content(
    permissions: &super::permissions::Permissions,
    content: &Content,
) -> ClipboardResult<()> {
    if matches!(content, Content::Files { .. } | Content::FileOffer { .. }) && !permissions.files {
        return Err(ClipboardError::Denied);
    }
    Ok(())
}

fn authorize(
    permissions: &super::permissions::Permissions,
    request: &Request,
) -> ClipboardResult<()> {
    let allowed = match request {
        Request::Copy { .. } | Request::Paste { .. } => permissions.control,
        Request::Read { shortcut, .. } => {
            permissions.clipboard_read && (shortcut.is_none() || permissions.control)
        }
        Request::Chunk { .. } => permissions.clipboard_read,
        Request::Begin { .. } | Request::Append { .. } => permissions.clipboard_write,
        Request::Commit { paste, .. } => {
            permissions.clipboard_write && (!paste || permissions.control)
        }
        Request::Clear => true,
        #[cfg(windows)]
        Request::Files { .. } => true, // The streaming handler checks each direction and file permission.
    };
    if allowed {
        Ok(())
    } else {
        Err(ClipboardError::Denied)
    }
}

fn continue_transfer(
    session: &mut super::Session,
    id: &str,
    request: Request,
) -> ClipboardResult<ReplyData> {
    let transfer = session
        .clipboard
        .as_mut()
        .filter(|transfer| transfer.id == id && transfer.touched.elapsed() < TRANSFER_LEASE)
        .ok_or(ClipboardError::Invalid)?;
    transfer.touched = Instant::now();
    match request {
        Request::Append { offset, data } => {
            transfer.append(offset, &data)?;
            Ok(ReplyData::default())
        }
        Request::Chunk { offset } => {
            if transfer.expected.is_some() || offset >= transfer.bytes.len() {
                return Err(ClipboardError::Invalid);
            }
            let end = (offset + CHUNK_BYTES).min(transfer.bytes.len());
            Ok(ReplyData {
                data: Some(STANDARD.encode(&transfer.bytes[offset..end])),
                ..Default::default()
            })
        }
        Request::Commit {
            paste,
            expected_revision,
        } => {
            if transfer.expected != Some(transfer.bytes.len()) {
                return Err(ClipboardError::Invalid);
            }
            let content =
                serde_json::from_slice(&transfer.bytes).map_err(|_| ClipboardError::Invalid)?;
            session.clipboard = None;
            commit_content(session, content, paste, expected_revision)
        }
        _ => Err(ClipboardError::Invalid),
    }
}

fn commit_content(
    session: &mut super::Session,
    content: Content,
    paste: bool,
    expected_revision: Option<String>,
) -> ClipboardResult<ReplyData> {
    if expected_revision.is_some() && expected_revision != super::clipboard_revision::current().ok()
    {
        // A remote copy during upload wins. Do not overwrite it with an older local snapshot.
        return if paste {
            paste_original(session)
        } else {
            Err(ClipboardError::Invalid)
        };
    }
    allow_content(&session.permissions, &content)?;
    super::clipboard_platform::write(session, content, paste)?;
    session.clipboard_revision = super::clipboard_revision::current().ok();
    Ok(ReplyData::default())
}

#[tauri::command]
pub(crate) async fn remote_desktop_clipboard(
    id: String,
    message: ClipboardMessage,
    on_file_read: tauri::ipc::Channel<super::clipboard_stream::ReadEvent>,
) -> ClipboardReply {
    let request_id = message.request_id;
    let sender: super::clipboard_stream::Sender = std::sync::Arc::new(move |event| {
        on_file_read.send(event).map_err(|_| ClipboardError::Access)
    });
    tauri::async_runtime::spawn_blocking(move || handle_with_sender(&id, message, Some(sender)))
        .await
        .unwrap_or_else(|_| ClipboardReply {
            kind: "clipboard",
            request_id,
            result: None,
            error: Some(ClipboardError::Access.to_string()),
        })
}

#[cfg(test)]
#[path = "clipboard_tests.rs"]
mod tests;
