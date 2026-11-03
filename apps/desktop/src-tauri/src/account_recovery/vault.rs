use super::normalize_totp;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct Secret {
    pub(crate) email: String,
    pub(crate) password: String,
    pub(crate) totp: String,
}
impl std::fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Secret(<redacted>)")
    }
}
impl Drop for Secret {
    fn drop(&mut self) {
        self.email.zeroize();
        self.password.zeroize();
        self.totp.zeroize();
    }
}
pub(super) fn entry(id: &str) -> Result<keyring::Entry, String> {
    if id.len() != 24 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("savedLoginFailed".into());
    }
    keyring::Entry::new("dev.interlude.local-login", id).map_err(|_| "savedLoginFailed".into())
}
pub(crate) fn delete(id: &str) -> Result<(), String> {
    match entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("savedLoginFailed".into()),
    }
}
pub(crate) fn load(id: &str) -> Result<Option<Secret>, String> {
    match entry(id)?.get_secret() {
        Ok(bytes) => serde_json::from_slice(&Zeroizing::new(bytes))
            .map(Some)
            .map_err(|_| "savedLoginFailed".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("savedLoginFailed".into()),
    }
}
pub(crate) fn validate_backup_secret(id: &str, secret: &Secret, email: &str) -> Result<(), String> {
    entry(id)?;
    if secret.email.len() > 512
        || !secret.email.trim().eq_ignore_ascii_case(email.trim())
        || secret.password.is_empty()
        || secret.password.len() > 4096
        || secret.totp.len() > 4096
    {
        return Err("savedLoginInvalid".into());
    }
    normalize_totp(&secret.totp)?;
    Ok(())
}
pub(crate) fn restore_secret(id: &str, secret: Option<&Secret>) -> Result<(), String> {
    match secret {
        Some(secret) => {
            let bytes = Zeroizing::new(serde_json::to_vec(secret).map_err(|_| "savedLoginFailed")?);
            entry(id)?
                .set_secret(&bytes)
                .map_err(|_| "savedLoginFailed".into())
        }
        None => delete(id),
    }
}
