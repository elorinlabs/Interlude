//! Upgrade enabled installations without holding the settings guard during downloads.
use super::{install, package, platform, state, ComputerError, Result, CHANGES, VERSION};
use std::path::Path;

/// Called only by desktop startup; never starts a driver or requests OS permissions.
pub(crate) fn start(app: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        if platform::asset().is_err() {
            return;
        }
        if let Err(error) = upgrade_installed(&app) {
            eprintln!("Computer-use automatic upgrade failed: {error}");
        }
    });
}

fn upgrade_installed(app: &tauri::AppHandle) -> Result<()> {
    let root = super::root()?;
    for home in state::installed_homes(&root)? {
        if let Err(error) = ensure_enabled(app, &root, &home, || {}) {
            eprintln!("Could not upgrade an enabled computer-use installation: {error}");
        }
    }
    Ok(())
}

pub(super) fn ensure_enabled(
    app: &tauri::AppHandle,
    root: &Path,
    home: &Path,
    installing: impl FnOnce(),
) -> Result<()> {
    upgrade_with(root, home, || {
        installing();
        package::ensure(app, root)
    })
}

fn upgrade_with(root: &Path, home: &Path, prepare: impl FnOnce() -> Result<()>) -> Result<()> {
    let candidate = {
        let _guard = CHANGES.lock().map_err(|_| ComputerError::Storage)?;
        candidate(root, home)?
    };
    let Some(record) = candidate else {
        return Ok(());
    };
    // Download failure leaves the user's enabled choice, configuration and generation
    // intact. Startup or the next GUI connection can retry without manual repair.
    prepare()?;
    let _guard = CHANGES.lock().map_err(|_| ComputerError::Storage)?;
    if !home.is_dir() || !state::allowed(root, &state::home_id(home), &record.generation) {
        return Ok(());
    }
    if !package::present(root)? {
        return Err(ComputerError::Integrity);
    }
    install::upgrade(root, record)
}

fn candidate(root: &Path, home: &Path) -> Result<Option<state::Record>> {
    let Some(record) = state::read(root, &state::home_id(home))? else {
        return Ok(None);
    };
    // Do not recreate a Home the user has deleted.
    if !record.enabled || !home.is_dir() {
        return Ok(None);
    }
    if record.version == VERSION && package::present(root)? {
        install::refresh_installed(root, home)?;
        return Ok(None);
    }
    Ok(Some(record))
}

#[cfg(test)]
#[path = "upgrade_tests.rs"]
mod tests;
