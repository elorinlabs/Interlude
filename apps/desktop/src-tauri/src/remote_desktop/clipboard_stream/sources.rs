use super::{ClipboardError, ClipboardResult, FileInfo, Offer, ReadRequest};
use std::{
    collections::HashMap,
    fs::File,
    os::windows::fs::FileExt,
    sync::{Arc, Mutex, OnceLock},
};

struct Source {
    revision: String,
    offer: Offer,
    files: Vec<File>,
}

// One clipboard snapshot per viewer/session. A new copy revokes the previous file handles.
static SOURCES: OnceLock<Mutex<HashMap<String, Arc<Source>>>> = OnceLock::new();

pub(in crate::remote_desktop) fn capture(scope: &str) -> ClipboardResult<Option<Offer>> {
    if let Some(offer) = super::published(scope) {
        return Ok(Some(offer));
    }
    let revision = super::super::clipboard_revision::current()?;
    if let Some(source) = SOURCES
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| ClipboardError::Access)?
        .get(scope)
        .filter(|s| s.revision == revision)
    {
        return Ok(Some(source.offer.clone()));
    }
    let mut clipboard = arboard::Clipboard::new().map_err(|_| ClipboardError::Access)?;
    let Ok(paths) = clipboard.get().file_list() else {
        return Ok(None);
    };
    if paths.is_empty() {
        return Ok(None);
    }
    if paths.len() > super::super::clipboard_files::MAX_FILES {
        return Err(ClipboardError::Size);
    }
    let (files, info) = open_files(paths)?;
    if super::super::clipboard_revision::current()? != revision {
        return Err(ClipboardError::Access);
    }
    let offer = Offer {
        id: uuid::Uuid::new_v4().to_string(),
        files: info,
    };
    offer.validate()?;
    let source = Source {
        revision,
        offer: offer.clone(),
        files,
    };
    SOURCES
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| ClipboardError::Access)?
        .insert(scope.into(), Arc::new(source));
    Ok(Some(offer))
}

pub(in crate::remote_desktop) fn read(
    scope: &str,
    request: &ReadRequest,
) -> ClipboardResult<Vec<u8>> {
    let source = SOURCES
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| ClipboardError::Access)?
        .get(scope)
        .filter(|s| s.offer.id == request.offer_id)
        .cloned()
        .ok_or(ClipboardError::Invalid)?;
    let file = source
        .files
        .get(request.index)
        .ok_or(ClipboardError::Invalid)?;
    let size = source.offer.files[request.index].size;
    let length = checked_length(request, size)?;
    if file.metadata().map_err(|_| ClipboardError::Access)?.len() != size {
        return Err(ClipboardError::Invalid);
    }
    let mut bytes = vec![0; length];
    file.seek_read(&mut bytes, request.offset)
        .map_err(|_| ClipboardError::Access)
        .and_then(|read| {
            if read == length {
                Ok(bytes)
            } else {
                Err(ClipboardError::Access)
            }
        })
}

pub(in crate::remote_desktop) fn checked_length(
    request: &ReadRequest,
    size: u64,
) -> ClipboardResult<usize> {
    if request.length == 0
        || request.length > super::super::clipboard::CHUNK_BYTES
        || request.offset > size
    {
        return Err(ClipboardError::Invalid);
    }
    Ok(request.length.min((size - request.offset) as usize))
}

pub(in crate::remote_desktop) fn release(scope: &str) {
    if let Ok(mut sources) = SOURCES.get_or_init(Default::default).lock() {
        sources.remove(scope);
    }
    super::cancel(scope);
    super::publisher::revoke(scope);
}

fn open_files(paths: Vec<std::path::PathBuf>) -> ClipboardResult<(Vec<File>, Vec<FileInfo>)> {
    let mut files = Vec::new();
    let mut info = Vec::new();
    for path in paths {
        let file = File::open(&path).map_err(|_| ClipboardError::Access)?;
        let metadata = file.metadata().map_err(|_| ClipboardError::Access)?;
        if !metadata.is_file() {
            return Err(ClipboardError::Directory);
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or(ClipboardError::Invalid)?
            .to_owned();
        info.push(FileInfo {
            name,
            size: metadata.len(),
        });
        files.push(file);
    }
    Ok((files, info))
}
