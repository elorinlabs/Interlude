//! Initialize the Linux desktop libraries before GTK creates displays or worker threads.

#[derive(Debug, thiserror::Error)]
#[error("failed to initialize X11 thread support")]
pub(crate) struct DesktopInitializationError;

#[link(name = "X11")]
unsafe extern "C" {
    fn XInitThreads() -> std::ffi::c_int;
}

/// Older libX11 versions need explicit initialization before the first display is opened.
pub(crate) fn initialize_desktop() -> Result<(), DesktopInitializationError> {
    // SAFETY: run() calls this on the main thread before GTK or any desktop worker starts.
    // XInitThreads takes no pointers, is idempotent, and must precede other Xlib calls.
    if unsafe { XInitThreads() } == 0 {
        return Err(DesktopInitializationError);
    }
    Ok(())
}
