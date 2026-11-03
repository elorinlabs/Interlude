use super::super::{authority, display::Display};
use crate::{Error, Result};
use std::{
    io::Write,
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Child, Command, Stdio},
};
use zeroize::Zeroizing;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(super) async fn default_display() -> Result<String> {
    Ok(std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into()))
}

fn authority_path(display: u16) -> Result<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").ok_or(Error::X11Start)?;
    Ok(PathBuf::from(base)
        .join("Interlude")
        .join("X11")
        .join(format!("display-{display}.auth")))
}

pub(super) async fn cookie(display: &Display) -> Result<Option<Zeroizing<Vec<u8>>>> {
    let number = display.number;
    tokio::task::spawn_blocking(move || {
        let path = authority_path(number)?;
        match std::fs::read(path) {
            Ok(bytes) => {
                authority::parse(&Zeroizing::new(bytes), number.to_string().as_bytes()).map(Some)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(Error::X11Unavailable),
        }
    })
    .await
    .map_err(|_| Error::X11Unavailable)?
}

fn executable() -> Result<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            candidates.push(parent.join("resources/x-server/runtime/vcxsrv.exe"));
        }
    }
    // Development builds use the same verified resource pack as installers.
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../apps/desktop/src-tauri/resources/x-server/runtime/vcxsrv.exe"),
    );
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(variable) {
            candidates.push(PathBuf::from(base).join("VcXsrv/vcxsrv.exe"));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or(Error::X11Missing)
}

pub(super) async fn start(display: &Display) -> Result<Child> {
    let number = display.number;
    tokio::task::spawn_blocking(move || {
        let executable = executable()?;
        let auth = prepare_authority(number)?;
        Command::new(&executable)
            .current_dir(executable.parent().ok_or(Error::X11Missing)?)
            .args([
                format!(":{number}"),
                "-multiwindow".into(),
                "-clipboard".into(),
                "-wgl".into(),
                "-noreset".into(),
                "-listen".into(),
                "tcp".into(),
                "-auth".into(),
            ])
            .arg(auth)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|_| Error::X11Start)
    })
    .await
    .map_err(|_| Error::X11Start)?
}

fn prepare_authority(number: u16) -> Result<PathBuf> {
    let path = authority_path(number)?;
    let parent = path.parent().ok_or(Error::X11Start)?;
    std::fs::create_dir_all(parent).map_err(|_| Error::X11Start)?;
    // Reuse a per-user cookie across app restarts; never modify the user's Xauthority.
    if path.is_file() {
        let bytes = Zeroizing::new(std::fs::read(&path).map_err(|_| Error::X11Start)?);
        if authority::parse(&bytes, number.to_string().as_bytes())?.len() == 16 {
            return Ok(path);
        }
        return Err(Error::X11Start);
    }
    let cookie = Zeroizing::new(*uuid::Uuid::new_v4().as_bytes());
    let bytes = authority_record(number, cookie.as_slice());
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| Error::X11Start)?;
    file.write_all(&bytes).map_err(|_| Error::X11Start)?;
    Ok(path)
}

fn authority_record(number: u16, cookie: &[u8]) -> Zeroizing<Vec<u8>> {
    let mut bytes = Zeroizing::new(65535_u16.to_be_bytes().to_vec());
    for field in [
        &[][..],
        number.to_string().as_bytes(),
        authority::AUTH_PROTOCOL,
        cookie,
    ] {
        bytes.extend_from_slice(&(field.len() as u16).to_be_bytes());
        bytes.extend_from_slice(field);
    }
    bytes
}

pub(super) async fn stop(mut child: Child) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        if child.try_wait().map_err(|_| Error::X11Start)?.is_none() {
            child.kill().map_err(|_| Error::X11Start)?;
            child.wait().map_err(|_| Error::X11Start)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| Error::X11Start)?
}

#[cfg(test)]
#[test]
fn managed_cookie_is_readable_without_changing_user_authority() {
    let cookie = [7; 16];
    let record = authority_record(12, &cookie);
    assert_eq!(*authority::parse(&record, b"12").unwrap(), cookie);
    assert!(authority::parse(&record, b"1").unwrap().is_empty());
}
