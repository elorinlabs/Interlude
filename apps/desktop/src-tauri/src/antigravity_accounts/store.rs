use super::{
    model::{identity, Account, Error, Result, Snapshot},
    platform,
};
use keyring_core::Entry;
use std::path::PathBuf;
use tauri::{Manager, Runtime};
use zeroize::Zeroizing;

pub(super) fn active_entry() -> Result<Entry> {
    // Initialize keyring's native store, then address Go keyring's exact Windows target.
    keyring::Entry::new("interlude.antigravity", "initialize").map_err(|_| Error::Credentials)?;
    Entry::new_with_modifiers(
        "gemini",
        "antigravity",
        &std::collections::HashMap::from([
            ("target", "gemini:antigravity"),
            ("persistence", "Local"),
        ]),
    )
    .map_err(|_| Error::Credentials)
}

pub(super) fn read_active() -> Result<Zeroizing<Vec<u8>>> {
    active_entry()?
        .get_secret()
        .map(Zeroizing::new)
        .map_err(|_| Error::Credentials)
}

pub(super) fn saved_entry(id: &str) -> Result<keyring::Entry> {
    uuid::Uuid::parse_str(id).map_err(|_| Error::Credentials)?;
    keyring::Entry::new("dev.interlude.accounts.antigravity", id).map_err(|_| Error::Credentials)
}

fn path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| Error::Storage)?
        .join("antigravity");
    std::fs::create_dir_all(&root).map_err(|_| Error::Storage)?;
    Ok(root.join("accounts.json"))
}

pub(super) fn configure<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<()> {
    let path = path(app)?.with_file_name("installation.json");
    let previous = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<PathBuf>(&bytes).ok());
    if let Some(path) = &previous {
        // A stale remembered installation is optional; the running app takes precedence.
        let _ = platform::prefer(path);
    }
    if let Ok(selected) = platform::installation() {
        if previous.as_ref() != Some(&selected) {
            crate::storage::write_json_atomic(
                &path,
                &serde_json::to_value(selected).map_err(|_| Error::Storage)?,
            )
            .map_err(|_| Error::Storage)?;
        }
    }
    Ok(())
}

pub(super) fn read<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Vec<Account>> {
    let path = path(app)?;
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| Error::Storage),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err(Error::Storage),
    }
}

pub(super) fn write<R: Runtime>(app: &tauri::AppHandle<R>, accounts: &[Account]) -> Result<()> {
    crate::storage::write_json_atomic(
        &path(app)?,
        &serde_json::to_value(accounts).map_err(|_| Error::Storage)?,
    )
    .map_err(|_| Error::Storage)
}

pub(super) fn snapshot<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Snapshot> {
    let accounts = read(app)?;
    let current = read_active().and_then(|s| identity(&s)).ok();
    let active_id = current
        .as_ref()
        .and_then(|(sub, _)| accounts.iter().find(|a| &a.subject == sub))
        .map(|a| a.id.clone());
    Ok(Snapshot {
        installed: platform::installed(),
        active_id,
        current_email: current.map(|(_, email)| email),
        accounts,
    })
}

pub(super) fn capture<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<()> {
    let secret = read_active()?;
    let (subject, email) = identity(&secret)?;
    let mut accounts = read(app)?;
    let existing = accounts.iter().position(|a| a.subject == subject);
    let mut account = existing
        .map(|i| accounts[i].clone())
        .unwrap_or_else(|| Account {
            id: uuid::Uuid::new_v4().to_string(),
            subject,
            email,
            ..Default::default()
        });
    // Only capture the locally signed-in account, and verify the live service identity when available.
    if let Ok(status) = platform::rpc("GetUserStatus", std::time::Duration::from_secs(20)) {
        super::model::apply_status(&mut account, &status)?;
    }
    let entry = saved_entry(&account.id)?;
    let fresh = read_active()?;
    if identity(&fresh)?.0 != account.subject {
        return Err(Error::Credentials);
    }
    entry.set_secret(&fresh).map_err(|_| Error::Credentials)?;
    if let Some(index) = existing {
        accounts[index] = account;
    } else {
        accounts.push(account);
    }
    write(app, &accounts)
}

pub(super) fn refresh<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<()> {
    let secret = read_active()?;
    let (subject, _) = identity(&secret)?;
    let mut accounts = read(app)?;
    let account = accounts
        .iter_mut()
        .find(|a| a.subject == subject)
        .ok_or(Error::Credentials)?;
    // Preserve rotations even if the quota service is temporarily unavailable.
    saved_entry(&account.id)?
        .set_secret(&secret)
        .map_err(|_| Error::Credentials)?;
    let response = platform::rpc("GetUserStatus", std::time::Duration::from_secs(20));
    // Keep the refreshed native credential, rather than a potentially stale previous snapshot.
    let fresh = read_active()?;
    if identity(&fresh)?.0 != subject {
        return Err(Error::Credentials);
    }
    saved_entry(&account.id)?
        .set_secret(&fresh)
        .map_err(|_| Error::Credentials)?;
    super::model::apply_status(account, &response?)?;
    write(app, &accounts)
}

fn preserve_current(accounts: &[Account], expected: &str) -> Result<Zeroizing<Vec<u8>>> {
    let current = read_active()?;
    if identity(&current)?.0 != expected {
        return Err(Error::Switch);
    }
    if let Some(account) = accounts.iter().find(|a| a.subject == expected) {
        saved_entry(&account.id)?
            .set_secret(&current)
            .map_err(|_| Error::Credentials)?;
    }
    Ok(current)
}

pub(super) fn switch<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<()> {
    let accounts = read(app)?;
    let target = accounts
        .iter()
        .find(|a| a.id == id)
        .ok_or(Error::Credentials)?;
    let secret = Zeroizing::new(
        saved_entry(id)?
            .get_secret()
            .map_err(|_| Error::Credentials)?,
    );
    if identity(&secret)?.0 != target.subject {
        return Err(Error::Credentials);
    }
    let current = read_active()?;
    let current_subject = identity(&current)?.0;
    if current_subject == target.subject {
        return platform::launch();
    }
    let active = active_entry()?;
    platform::stop()?;
    // Read once more after shutdown so a final token refresh cannot be lost.
    let current = match preserve_current(&accounts, &current_subject) {
        Ok(current) => current,
        Err(error) => {
            platform::launch()?;
            return Err(error);
        }
    };
    if active.set_secret(&secret).is_err() {
        // A failed write may leave an uncertain state; restoring is mandatory before relaunch.
        active
            .set_secret(&current)
            .map_err(|_| Error::Credentials)?;
        platform::launch()?;
        return Err(Error::Switch);
    }
    if platform::launch().is_err() {
        active
            .set_secret(&current)
            .map_err(|_| Error::Credentials)?;
        platform::launch()?;
        return Err(Error::Switch);
    }
    Ok(())
}

pub(super) fn delete<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<()> {
    let mut accounts = read(app)?;
    if !accounts.iter().any(|a| a.id == id) {
        return Err(Error::Credentials);
    }
    // Removing a saved profile never logs out the official app.
    match saved_entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => (),
        Err(_) => return Err(Error::Credentials),
    }
    accounts.retain(|a| a.id != id);
    write(app, &accounts)
}
