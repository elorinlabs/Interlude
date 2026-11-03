//! Only the elevated installer registers our additional sign-in provider. System providers stay untouched.
use super::{configuration, installer, Result, ServiceError};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use winreg::{enums::*, RegKey};

const ID: &str = "{64053F3E-11A6-47E0-93DC-CF63D7674B7A}";
pub(super) const RESOURCE: &str = "resources/desktop-service/desktop-unlock.dll";
fn provider_key() -> String {
    format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{ID}")
}
fn class_key() -> String {
    format!(r"SOFTWARE\Classes\CLSID\{ID}")
}
fn root() -> Result<PathBuf> {
    Ok(configuration::install_root()?.with_file_name("Codex Switch Remote Desktop Login"))
}
pub(crate) fn available() -> bool {
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    machine
        .open_subkey_with_flags(provider_key(), KEY_READ | KEY_WOW64_64KEY)
        .is_ok()
        && machine
            .open_subkey_with_flags(
                format!(r"{}\InprocServer32", class_key()),
                KEY_READ | KEY_WOW64_64KEY,
            )
            .and_then(|key| key.get_value::<String, _>(""))
            .is_ok_and(|value| Path::new(&value).is_file())
}
pub(super) fn install(source: &Path) -> Result<()> {
    // The DLL is versioned outside the service tree: LogonUI may hold an old version open during an update.
    let bytes = std::fs::read(source.join(RESOURCE)).map_err(|_| ServiceError::Setup)?;
    let directory = root()?;
    installer::protect_directory(&directory)?;
    let path = directory.join(format!("{:x}.dll", Sha256::digest(&bytes)));
    installer::reject_link(&path)?;
    if !path.exists() {
        std::fs::write(&path, &bytes).map_err(|_| ServiceError::Storage)?;
    }
    let actual = std::fs::read(&path).map_err(|_| ServiceError::Storage)?;
    if actual != bytes {
        return Err(ServiceError::Setup);
    }
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    let (class, _) = machine
        .create_subkey_with_flags(
            format!(r"{}\InprocServer32", class_key()),
            KEY_WRITE | KEY_WOW64_64KEY,
        )
        .map_err(|_| ServiceError::Setup)?;
    class
        .set_value("", &path.to_string_lossy().as_ref())
        .map_err(|_| ServiceError::Setup)?;
    class
        .set_value("ThreadingModel", &"Apartment")
        .map_err(|_| ServiceError::Setup)?;
    let (provider, _) = machine
        .create_subkey_with_flags(provider_key(), KEY_WRITE | KEY_WOW64_64KEY)
        .map_err(|_| ServiceError::Setup)?;
    provider
        .set_value("", &"Interlude")
        .map_err(|_| ServiceError::Setup)
}
pub(super) fn unregister() -> Result<()> {
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    for key in [provider_key(), class_key()] {
        match machine.delete_subkey_all(key) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(ServiceError::Setup),
        }
    }
    Ok(())
}
pub(super) fn uninstall() -> Result<()> {
    unregister()?;
    let directory = root()?;
    if !directory.exists() {
        return Ok(());
    }
    installer::reject_link(&directory)?;
    for entry in std::fs::read_dir(&directory).map_err(|_| ServiceError::Storage)? {
        let path = entry.map_err(|_| ServiceError::Storage)?.path();
        installer::reject_link(&path)?;
        if path.parent() != Some(directory.as_path())
            || path.extension().is_none_or(|ext| ext != "dll")
        {
            return Err(ServiceError::Invalid);
        }
        remove_or_schedule(&path)?;
    }
    remove_or_schedule(&directory)
}
fn remove_or_schedule(path: &Path) -> Result<()> {
    let removed = if path.is_dir() {
        std::fs::remove_dir(path)
    } else {
        std::fs::remove_file(path)
    };
    if removed.is_ok() {
        return Ok(());
    }
    let path = super::platform::wide(&path.to_string_lossy());
    // SAFETY: fixed, installer-owned paths were checked for reparse points; Windows copies this live buffer.
    if unsafe {
        windows_sys::Win32::Storage::FileSystem::MoveFileExW(
            path.as_ptr(),
            std::ptr::null(),
            windows_sys::Win32::Storage::FileSystem::MOVEFILE_DELAY_UNTIL_REBOOT,
        )
    } == 0
    {
        return Err(ServiceError::Storage);
    }
    Ok(())
}
