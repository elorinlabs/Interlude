//! OS revisions detect remote context-menu copies without reading clipboard contents or polling.
#[cfg(not(target_os = "macos"))]
use super::clipboard::ClipboardError;
use super::clipboard::ClipboardResult;

#[cfg(windows)]
pub(super) fn current() -> ClipboardResult<String> {
    // SAFETY: The parameter-free Win32 call reads the clipboard counter and does not retain pointers.
    let revision =
        unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() };
    if revision == 0 {
        return Err(ClipboardError::Access);
    }
    Ok(revision.to_string())
}

#[cfg(target_os = "macos")]
pub(super) fn current() -> ClipboardResult<String> {
    super::macos::pasteboard::change_count().map(|revision| revision.to_string())
}

#[cfg(not(any(windows, target_os = "macos")))]
pub(super) fn current() -> ClipboardResult<String> {
    Err(ClipboardError::Access)
}
