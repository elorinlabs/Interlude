use crate::types::*;
use russh_sftp::{
    client::{error::Error as SftpError, SftpSession},
    protocol::{FileAttributes, StatusCode},
};

pub(crate) async fn exists(sftp: &SftpSession, path: &str) -> Result<bool> {
    match sftp.symlink_metadata(path).await {
        Ok(_) => Ok(true),
        Err(SftpError::Status(status)) if status.status_code == StatusCode::NoSuchFile => Ok(false),
        Err(_) => Err(Error::File),
    }
}

/// Pin an existing link's regular-file target before creating a replacement beside it.
pub(crate) async fn overwrite_path(sftp: &SftpSession, path: &str) -> Result<String> {
    if !exists(sftp, path).await? {
        return Ok(path.to_owned());
    }
    let path = sftp.canonicalize(path).await.map_err(|_| Error::File)?;
    let metadata = sftp
        .symlink_metadata(&path)
        .await
        .map_err(|_| Error::File)?;
    if !metadata.file_type().is_file() {
        return Err(Error::Conflict);
    }
    Ok(path)
}

/// Apply private/executable modes before any bytes are written, then refresh them before publication.
pub(crate) async fn preserve_metadata(
    sftp: &SftpSession,
    source: &str,
    target: &str,
) -> Result<()> {
    if !exists(sftp, source).await? {
        return Ok(());
    }
    let metadata = sftp
        .symlink_metadata(source)
        .await
        .map_err(|_| Error::File)?;
    // A changed path must never redirect a pending overwrite to a different link or special file.
    if !metadata.file_type().is_file() {
        return Err(Error::Conflict);
    }
    let attributes = FileAttributes {
        size: None,
        permissions: metadata.permissions,
        uid: metadata.uid,
        gid: metadata.gid,
        user: None,
        group: None,
        atime: None,
        mtime: None,
    };
    sftp.set_metadata(target, attributes)
        .await
        .map_err(|_| Error::File)
}

pub(crate) fn numbered_path(path: &str, number: u64) -> String {
    let (parent, name) = path.rsplit_once('/').unwrap_or(("", path));
    let (stem, extension) = match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    };
    format!("{parent}/{stem} ({number}){extension}")
}

pub(crate) async fn publish(
    sftp: &SftpSession,
    temporary: &str,
    path: &str,
    mode: UploadMode,
) -> Result<String> {
    if mode == UploadMode::Overwrite {
        replace(sftp, temporary, path).await?;
        return Ok(path.to_owned());
    }
    let mut destination = path.to_owned();
    let mut number = 0u64;
    loop {
        if !exists(sftp, &destination).await? && sftp.rename(temporary, &destination).await.is_ok()
        {
            return Ok(destination);
        }
        if !exists(sftp, &destination).await? {
            return Err(Error::File);
        }
        if mode == UploadMode::Reject {
            return Err(Error::Conflict);
        }
        number = number.checked_add(1).ok_or(Error::File)?;
        destination = numbered_path(path, number);
    }
}

async fn replace(sftp: &SftpSession, temporary: &str, path: &str) -> Result<()> {
    if !exists(sftp, path).await? {
        return sftp.rename(temporary, path).await.map_err(|_| Error::File);
    }
    preserve_metadata(sftp, path, temporary).await?;
    // SFTP v3 has no replace flag. Keep the original until the complete upload can take its place.
    let backup = format!("{temporary}.previous");
    sftp.rename(path, &backup).await.map_err(|_| Error::File)?;
    if sftp.rename(temporary, path).await.is_err() {
        if sftp.rename(&backup, path).await.is_err() {
            eprintln!("SSH overwrite rollback could not restore the retained backup");
        }
        return Err(Error::File);
    }
    if sftp.remove_file(backup).await.is_err() {
        eprintln!("SSH overwrite completed but the retained backup could not be removed");
    }
    Ok(())
}
