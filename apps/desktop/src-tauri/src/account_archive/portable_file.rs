use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

fn validate(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.as_os_str().len() > 4096
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("interlude-backup"))
    {
        return Err("backupFile".into());
    }
    Ok(())
}
pub(super) fn read(path: &Path) -> Result<Vec<u8>, String> {
    validate(path)?;
    let file = fs::File::open(path).map_err(|_| "backupFile")?;
    if !file.metadata().map_err(|_| "backupFile")?.is_file() {
        return Err("backupFile".into());
    }
    let mut bytes = Vec::new();
    file.take(super::password_crypto::MAX_BYTES as u64 + 128)
        .read_to_end(&mut bytes)
        .map_err(|_| "backupFile")?;
    if bytes.len() > super::password_crypto::MAX_BYTES + 64 {
        return Err("backupFormat".into());
    }
    Ok(bytes)
}
pub(super) fn write(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    validate(path)?;
    let parent = path
        .parent()
        .ok_or("backupFile")?
        .canonicalize()
        .map_err(|_| "backupFile")?;
    let target = parent.join(path.file_name().ok_or("backupFile")?);
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "backupFile")?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "backupFile")?;
    file.persist(&target).map_err(|_| "backupFile")?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encrypted_files_are_replaced_atomically_and_bad_paths_fail() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("accounts.interlude-backup");
        write(&path, b"encrypted-one").unwrap();
        write(&path, b"encrypted-two").unwrap();
        assert_eq!(read(&path).unwrap(), b"encrypted-two");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        assert!(write(Path::new("relative"), b"data").is_err());
        assert!(write(&dir.path().join("auth.json"), b"data").is_err());
        assert!(!dir.path().join("auth.json").exists());
        assert!(read(dir.path()).is_err());
    }
}
