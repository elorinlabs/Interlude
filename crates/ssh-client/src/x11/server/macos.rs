use super::super::display::Display;
use crate::{Error, Result};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{process::Command, time::timeout};
use zeroize::Zeroizing;

pub(super) async fn default_display() -> Result<String> {
    if let Ok(value) = std::env::var("DISPLAY") {
        if !value.is_empty() {
            return Ok(value);
        }
    }
    let output = timeout(
        Duration::from_secs(2),
        Command::new("/bin/launchctl")
            .args(["getenv", "DISPLAY"])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| Error::X11Unavailable)?
    .map_err(|_| Error::X11Unavailable)?;
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if value.is_empty() { ":0".into() } else { value })
}

pub(super) async fn cookie(_: &Display) -> Result<Option<Zeroizing<Vec<u8>>>> {
    Ok(None)
}

pub(super) async fn start(_: &Display) -> Result<()> {
    let installed =
        tokio::task::spawn_blocking(|| Path::new("/Applications/Utilities/XQuartz.app").is_dir())
            .await
            .map_err(|_| Error::X11Missing)?;
    if !installed {
        return Err(Error::X11Missing);
    }
    let status = timeout(
        Duration::from_secs(3),
        Command::new("/usr/bin/open")
            .args(["-g", "-a", "/Applications/Utilities/XQuartz.app"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await
    .map_err(|_| Error::X11Start)?
    .map_err(|_| Error::X11Start)?;
    if status.success() {
        Ok(())
    } else {
        Err(Error::X11Start)
    }
}

pub(super) async fn stop(_: ()) -> Result<()> {
    // LaunchServices owns XQuartz; never terminate another application's session.
    Ok(())
}
