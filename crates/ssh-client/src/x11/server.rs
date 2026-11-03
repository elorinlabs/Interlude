//! Start an available local X server only when the selected display is offline.
use super::{authority, display::Display};
use crate::{Error, Result, X11};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
    time::{sleep, timeout},
};
use zeroize::Zeroizing;

#[cfg(target_os = "windows")]
#[path = "server/windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "server/macos.rs"]
mod platform;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[path = "server/unix.rs"]
mod platform;

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const START_TIMEOUT: Duration = Duration::from_secs(10);
const RETRY_INTERVAL: Duration = Duration::from_millis(150);
// Serializes startup across local and remote callers without blocking the UI thread.
static STARTING: Mutex<()> = Mutex::const_new(());

pub(super) struct Ready {
    pub display: Display,
    pub cookie: Zeroizing<Vec<u8>>,
}

/// Ensure X11 is ready without opening an SSH session or sending login credentials.
pub async fn ensure_x11(options: X11) -> Result<()> {
    prepare(&options).await.map(|_| ())
}

pub(super) async fn prepare(options: &X11) -> Result<Ready> {
    options.validate()?;
    let _guard = STARTING.lock().await;
    let display = resolve_display(options).await?;
    if let Some(ready) = probe(display.clone()).await? {
        return Ok(ready);
    }
    let child = platform::start(&display).await?;
    let result = timeout(START_TIMEOUT, async {
        loop {
            if let Some(ready) = probe(resolve_display(options).await?).await? {
                return Ok(ready);
            }
            sleep(RETRY_INTERVAL).await;
        }
    })
    .await
    .unwrap_or(Err(Error::X11Start));
    if result.is_err() {
        platform::stop(child).await?;
    }
    result
}

async fn resolve_display(options: &X11) -> Result<Display> {
    if let Some(value) = options.display.as_deref().filter(|value| !value.is_empty()) {
        return Display::parse(value);
    }
    let value = platform::default_display().await?;
    Display::from_environment(&value)
}

async fn probe(display: Display) -> Result<Option<Ready>> {
    // An occupied display must never start a second server, even when its cookie is wrong.
    let Ok(Ok(stream)) = timeout(PROBE_TIMEOUT, display.connect()).await else {
        return Ok(None);
    };
    drop(stream);
    let cookie = authority::load(&display).await?;
    if authenticated(&display, &cookie).await.is_ok() {
        return Ok(Some(Ready { display, cookie }));
    }
    if let Some(cookie) = platform::cookie(&display).await? {
        authenticated(&display, &cookie).await?;
        return Ok(Some(Ready { display, cookie }));
    }
    Err(Error::X11Unavailable)
}

async fn authenticated(display: &Display, cookie: &[u8]) -> Result<()> {
    timeout(PROBE_TIMEOUT, async {
        let mut stream = display.connect().await?;
        let packet = setup_packet(cookie);
        stream
            .write_all(&packet)
            .await
            .map_err(|_| Error::X11Unavailable)?;
        let mut header = [0; 8];
        stream
            .read_exact(&mut header)
            .await
            .map_err(|_| Error::X11Unavailable)?;
        if header[0] != 1 || u16::from_le_bytes([header[2], header[3]]) != 11 {
            return Err(Error::X11Unavailable);
        }
        let mut body = vec![0; usize::from(u16::from_le_bytes([header[6], header[7]])) * 4];
        stream
            .read_exact(&mut body)
            .await
            .map_err(|_| Error::X11Unavailable)?;
        Ok(())
    })
    .await
    .map_err(|_| Error::X11Unavailable)?
}

fn setup_packet(cookie: &[u8]) -> Zeroizing<Vec<u8>> {
    let protocol = if cookie.is_empty() {
        &[][..]
    } else {
        authority::AUTH_PROTOCOL
    };
    let mut packet = Zeroizing::new(vec![b'l', 0, 11, 0, 0, 0]);
    packet.extend_from_slice(&(protocol.len() as u16).to_le_bytes());
    packet.extend_from_slice(&(cookie.len() as u16).to_le_bytes());
    packet.extend_from_slice(&[0, 0]);
    packet.extend_from_slice(protocol);
    let padded = packet.len().next_multiple_of(4);
    packet.resize(padded, 0);
    packet.extend_from_slice(cookie);
    let padded = packet.len().next_multiple_of(4);
    packet.resize(padded, 0);
    packet
}

#[cfg(test)]
mod tests;
