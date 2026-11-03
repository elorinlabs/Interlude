use crate::{files::validate_path, types::*, upload_destination::exists};
use russh_sftp::{client::SftpSession, protocol::OpenFlags};
use tokio::io::AsyncWriteExt;

pub(crate) async fn create_file(sftp: &SftpSession, path: &str) -> Result<FileReply> {
    if exists(sftp, path).await? {
        return Err(Error::Conflict);
    }
    let mut file = sftp
        .open_with_flags(
            path,
            OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
        )
        .await
        .map_err(|_| Error::File)?;
    file.shutdown().await.map_err(|_| Error::File)?;
    Ok(FileReply::Done)
}

pub(crate) async fn delete_tree(sftp: &SftpSession, path: &str) -> Result<FileReply> {
    let canonical = sftp.canonicalize(path).await.map_err(|_| Error::File)?;
    if canonical == "/" {
        return Err(Error::Invalid);
    }
    let mut pending = vec![(path.to_owned(), false)];
    while let Some((path, visited)) = pending.pop() {
        validate_path(&path)?;
        let metadata = sftp
            .symlink_metadata(&path)
            .await
            .map_err(|_| Error::File)?;
        if !metadata.is_dir() || metadata.is_symlink() {
            sftp.remove_file(path).await.map_err(|_| Error::File)?;
            continue;
        }
        if visited {
            sftp.remove_dir(path).await.map_err(|_| Error::File)?;
            continue;
        }
        pending.push((path.clone(), true));
        for entry in sftp.read_dir(&path).await.map_err(|_| Error::File)? {
            let name = entry.file_name();
            if name == "." || name == ".." || name.contains('/') {
                continue;
            }
            pending.push((format!("{}/{name}", path.trim_end_matches('/')), false));
        }
    }
    Ok(FileReply::Done)
}
