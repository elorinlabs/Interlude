//! Staged uploads keep relay packets small and preserve the original file until the final revision check.
use super::*;
use std::{
    collections::HashMap,
    io::{Seek, SeekFrom},
    sync::OnceLock,
    time::{Duration, Instant},
};

const MAX_UPLOADS: usize = 8;
const UPLOAD_IDLE: Duration = Duration::from_secs(15 * 60);
static UPLOADS: OnceLock<Mutex<HashMap<String, Upload>>> = OnceLock::new();

#[derive(Debug, Deserialize, Clone)]
pub(super) struct ReadRange {
    offset: u64,
    length: usize,
}

#[derive(Debug, Deserialize)]
pub(super) struct UploadChunk {
    token: String,
    offset: u64,
    size: u64,
    data: String,
    #[serde(default)]
    finish: bool,
    #[serde(default)]
    cancel: bool,
}

struct Upload {
    target: Target,
    path: PathBuf,
    revision: String,
    size: u64,
    received: u64,
    staged: tempfile::NamedTempFile,
    updated: Instant,
}

pub(super) fn read_chunk(path: &Path, range: &ReadRange) -> Result<GuiResponse> {
    if range.length == 0 || range.length > INLINE_BYTES {
        return Err(GuiError::InvalidRequest);
    }
    let mut file = File::open(path).map_err(|_| GuiError::FileRead)?;
    file.seek(SeekFrom::Start(range.offset))
        .map_err(|_| GuiError::FileRead)?;
    let mut bytes = vec![0; range.length];
    file.read_exact(&mut bytes)
        .map_err(|_| GuiError::ProjectFileConflict)?;
    Ok(GuiResponse {
        data: serde_json::json!({ "data": STANDARD.encode(bytes) }),
    })
}

fn create(request: &Save, path: PathBuf, chunk: &UploadChunk) -> Result<Upload> {
    let current = snapshot(&path)?;
    if current.read_only || current.kind != "text" {
        return Err(GuiError::ProjectFileWrite);
    }
    if current.revision != request.revision {
        return Err(GuiError::ProjectFileConflict);
    }
    let parent = path.parent().ok_or(GuiError::ProjectFileWrite)?;
    let staged = tempfile::NamedTempFile::new_in(parent).map_err(|_| GuiError::ProjectFileWrite)?;
    Ok(Upload {
        target: request.target.clone(),
        path,
        revision: request.revision.clone(),
        size: chunk.size,
        received: 0,
        staged,
        updated: Instant::now(),
    })
}

fn append(upload: &mut Upload, chunk: &UploadChunk, bytes: &[u8]) -> Result<()> {
    let end = chunk
        .offset
        .checked_add(bytes.len() as u64)
        .ok_or(GuiError::InvalidRequest)?;
    if end > upload.size || chunk.offset > upload.received {
        return Err(GuiError::InvalidRequest);
    }
    let file = upload.staged.as_file_mut();
    file.seek(SeekFrom::Start(chunk.offset))
        .map_err(|_| GuiError::ProjectFileWrite)?;
    if chunk.offset < upload.received {
        if end > upload.received {
            return Err(GuiError::InvalidRequest);
        }
        let mut existing = vec![0; bytes.len()];
        file.read_exact(&mut existing)
            .map_err(|_| GuiError::ProjectFileWrite)?;
        if existing != bytes {
            return Err(GuiError::InvalidRequest);
        }
    } else {
        file.write_all(bytes)
            .map_err(|_| GuiError::ProjectFileWrite)?;
        upload.received = end;
    }
    upload.updated = Instant::now();
    Ok(())
}

fn finish(upload: Upload) -> Result<GuiResponse> {
    if upload.received != upload.size {
        return Err(GuiError::InvalidRequest);
    }
    let bytes = file_bytes(upload.staged.path())?;
    if bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
        return Err(GuiError::ProjectFileWrite);
    }
    if resolve(&upload.target)? != upload.path
        || revision(&file_bytes(&upload.path)?) != upload.revision
    {
        return Err(GuiError::ProjectFileConflict);
    }
    let permissions = fs::metadata(&upload.path)
        .map_err(|_| GuiError::FileRead)?
        .permissions();
    if permissions.readonly() {
        return Err(GuiError::ProjectFileWrite);
    }
    upload
        .staged
        .as_file()
        .set_permissions(permissions)
        .and_then(|()| upload.staged.as_file().sync_all())
        .map_err(|_| GuiError::ProjectFileWrite)?;
    upload
        .staged
        .persist(&upload.path)
        .map_err(|_| GuiError::ProjectFileWrite)?;
    response(snapshot(&upload.path)?)
}

fn stage_chunk(
    uploads: &mut HashMap<String, Upload>,
    request: &Save,
    path: PathBuf,
) -> Result<u64> {
    let chunk = request.upload.as_ref().ok_or(GuiError::InvalidRequest)?;
    let bytes = STANDARD
        .decode(&chunk.data)
        .map_err(|_| GuiError::InvalidRequest)?;
    if bytes.is_empty() || bytes.len() > INLINE_BYTES {
        return Err(GuiError::InvalidRequest);
    }
    if !uploads.contains_key(&chunk.token) {
        if chunk.offset != 0 || uploads.len() >= MAX_UPLOADS {
            return Err(GuiError::FileBusy);
        }
        uploads.insert(chunk.token.clone(), create(request, path, chunk)?);
    }
    let upload = uploads
        .get_mut(&chunk.token)
        .ok_or(GuiError::InvalidRequest)?;
    append(upload, chunk, &bytes)?;
    Ok(upload.received)
}

pub(super) fn write(request: Save) -> Result<GuiResponse> {
    let chunk = request.upload.as_ref().ok_or(GuiError::InvalidRequest)?;
    if uuid::Uuid::parse_str(&chunk.token).is_err()
        || chunk.data.len() > INLINE_BYTES.div_ceil(3) * 4
    {
        return Err(GuiError::InvalidRequest);
    }
    let _guard = EDIT_LOCK.lock().map_err(|_| GuiError::FileBusy)?;
    let path = resolve(&request.target)?;
    let mut uploads = UPLOADS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| GuiError::FileBusy)?;
    uploads.retain(|_, upload| upload.updated.elapsed() < UPLOAD_IDLE);
    if let Some(upload) = uploads.get(&chunk.token) {
        if upload.path != path || upload.revision != request.revision || upload.size != chunk.size {
            return Err(GuiError::InvalidRequest);
        }
    }
    if chunk.cancel {
        uploads.remove(&chunk.token);
        return Ok(GuiResponse {
            data: serde_json::Value::Null,
        });
    }
    let received = stage_chunk(&mut uploads, &request, path)?;
    if !chunk.finish {
        return Ok(GuiResponse {
            data: serde_json::json!({ "received": received }),
        });
    }
    let upload = uploads
        .remove(&chunk.token)
        .ok_or(GuiError::InvalidRequest)?;
    drop(uploads);
    finish(upload)
}
