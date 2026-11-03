use super::super::display::Display;
use crate::{Error, Result};
use zeroize::Zeroizing;

pub(super) async fn default_display() -> Result<String> {
    Ok(std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into()))
}

pub(super) async fn cookie(_: &Display) -> Result<Option<Zeroizing<Vec<u8>>>> {
    Ok(None)
}

pub(super) async fn start(_: &Display) -> Result<()> {
    // The Linux login session owns Xorg/XWayland. Starting another server would
    // create an unrelated desktop instead of displaying on the user's screen.
    Err(Error::X11Unavailable)
}

pub(super) async fn stop(_: ()) -> Result<()> {
    Ok(())
}
