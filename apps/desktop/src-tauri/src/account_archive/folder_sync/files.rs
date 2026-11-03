use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Snapshot {
    pub id: String,
    pub saved_at: i64,
    pub size: u64,
    pub local: bool,
}

fn valid_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".interlude") else {
        return false;
    };
    let Some((device, timestamp)) = stem.rsplit_once('-') else {
        return false;
    };
    uuid::Uuid::parse_str(device).is_ok() && timestamp.parse::<i64>().is_ok_and(|v| v > 0)
}

pub(super) fn folder(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if !path.is_absolute() || value.len() > 2048 || !path.is_dir() {
        return Err("folderSyncFolder".into());
    }
    let path = path.canonicalize().map_err(|_| "folderSyncFolder")?;
    let path = if path.file_name().is_some_and(|name| name == "Interlude") {
        path
    } else {
        path.join("Interlude")
    };
    fs::create_dir_all(&path).map_err(|_| "folderSyncFolder")?;
    path.canonicalize().map_err(|_| "folderSyncFolder".into())
}

fn snapshots_dir(root: &Path, create: bool) -> Result<PathBuf, String> {
    if !root.is_dir() {
        return Err("folderSyncFolder".into());
    }
    let path = root.join("snapshots");
    if create {
        fs::create_dir_all(&path).map_err(|_| "folderSyncIo")?;
    }
    if !path.exists() && !create {
        return Ok(path);
    }
    let canonical = path.canonicalize().map_err(|_| "folderSyncIo")?;
    let root = root.canonicalize().map_err(|_| "folderSyncFolder")?;
    if !canonical.starts_with(root) {
        return Err("folderSyncFolder".into());
    }
    Ok(canonical)
}

pub(super) fn list(root: &Path, device: &str) -> Result<Vec<Snapshot>, String> {
    let path = snapshots_dir(root, false)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(path).map_err(|_| "folderSyncIo")?.take(2000) {
        let entry = entry.map_err(|_| "folderSyncIo")?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_name(&name) || !entry.file_type().map_err(|_| "folderSyncIo")?.is_file() {
            continue;
        }
        let saved_at = name
            .trim_end_matches(".interlude")
            .rsplit_once('-')
            .and_then(|(_, v)| v.parse().ok())
            .ok_or("folderSyncFormat")?;
        snapshots.push(Snapshot {
            local: name.starts_with(&format!("{device}-")),
            id: name,
            saved_at,
            size: entry.metadata().map_err(|_| "folderSyncIo")?.len(),
        });
    }
    snapshots.sort_by(|a, b| b.saved_at.cmp(&a.saved_at).then_with(|| a.id.cmp(&b.id)));
    Ok(snapshots)
}

pub(super) fn read(root: &Path, name: &str) -> Result<Vec<u8>, String> {
    if !valid_name(name) {
        return Err("folderSyncFormat".into());
    }
    let path = snapshots_dir(root, false)?.join(name);
    if !fs::symlink_metadata(&path)
        .map_err(|_| "folderSyncMissing")?
        .file_type()
        .is_file()
    {
        return Err("folderSyncFormat".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "folderSyncMissing")?
        .take(super::crypto::MAX_BYTES as u64 + 128)
        .read_to_end(&mut bytes)
        .map_err(|_| "folderSyncIo")?;
    if bytes.len() > super::crypto::MAX_BYTES + 64 {
        return Err("folderSyncFormat".into());
    }
    Ok(bytes)
}

pub(super) fn write(root: &Path, device: &str, bytes: &[u8]) -> Result<(), String> {
    if uuid::Uuid::parse_str(device).is_err() {
        return Err("folderSyncFormat".into());
    }
    let dir = snapshots_dir(root, true)?;
    let last = list(root, device)?
        .into_iter()
        .filter(|snapshot| snapshot.local)
        .map(|snapshot| snapshot.saved_at)
        .max()
        .unwrap_or(0);
    let now = chrono::Utc::now()
        .timestamp_millis()
        .max(last.saturating_add(1));
    let name = format!("{device}-{now}.interlude");
    let temporary = dir.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "folderSyncIo")?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "folderSyncIo")?;
        fs::rename(&temporary, dir.join(name)).map_err(|_| "folderSyncIo")?;
        Ok::<_, String>(())
    })();
    if result.is_err() {
        // Best-effort cleanup of this operation's encrypted staging file.
        let _ = fs::remove_file(temporary);
    }
    result?;
    for old in list(root, device)?.into_iter().filter(|s| s.local).skip(5) {
        fs::remove_file(dir.join(old.id)).map_err(|_| "folderSyncIo")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_names_reject_traversal_and_non_snapshot_files() {
        let device = uuid::Uuid::new_v4().to_string();
        assert!(valid_name(&format!("{device}-123.interlude")));
        for value in [
            "../secret.interlude",
            "wrong-123.interlude",
            "file.tmp",
            "a-0.interlude",
        ] {
            assert!(!valid_name(value));
        }
    }
    #[test]
    fn snapshots_round_trip_and_never_prune_another_device() {
        let dir = tempfile::tempdir().unwrap();
        let root = folder(dir.path().to_str().unwrap()).unwrap();
        let a = uuid::Uuid::new_v4().to_string();
        let b = uuid::Uuid::new_v4().to_string();
        write(&root, &b, b"other").unwrap();
        for _ in 0..7 {
            write(&root, &a, b"new").unwrap();
        }
        let snapshots = list(&root, &a).unwrap();
        assert_eq!(snapshots.iter().filter(|s| s.local).count(), 5);
        assert_eq!(snapshots.iter().filter(|s| !s.local).count(), 1);
        assert_eq!(read(&root, &snapshots[0].id).unwrap(), b"new");
        assert!(read(&root, "../accounts.json").is_err());
    }
}
