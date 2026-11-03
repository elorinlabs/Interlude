use super::{install, state, RemoteError, Result, INSTALL_CHANGES};
use std::{
    fs,
    path::{Path, PathBuf},
};

const SETUP_DIRECTORY: &str = "gui-setup";

/// Install before the desktop GUI starts its app-server, without blocking the UI thread.
pub(crate) async fn setup_gui(home: PathBuf) {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = INSTALL_CHANGES.lock().map_err(|_| RemoteError::Storage)?;
        setup_home(&super::root()?, &home)
    })
    .await;
    if !matches!(result, Ok(Ok(()))) {
        eprintln!("Remote command automatic setup failed: {result:?}");
    }
}

fn setup_home(root: &Path, home: &Path) -> Result<()> {
    let marker = root.join(SETUP_DIRECTORY).join(state::home_id(home));
    if marker.try_exists().map_err(|_| RemoteError::Storage)? {
        return Ok(());
    }
    let previously_installed = state::read(root, &state::home_id(home))?.is_some();
    // Remember before installing so reconnects preserve removals and leave failed setup for manual repair.
    remember(root, home)?;
    if previously_installed {
        return Ok(());
    }
    install::install(root, home)
}

pub(super) fn remember(root: &Path, home: &Path) -> Result<()> {
    let directory = root.join(SETUP_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|_| RemoteError::Storage)?;
    crate::storage::write_text_atomic(&directory.join(state::home_id(home)), "1")
        .map_err(|_| RemoteError::Storage)
}

#[cfg(test)]
#[path = "automatic_tests.rs"]
mod tests;
