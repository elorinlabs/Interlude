//! Password and authenticator storage; exposed only to explicitly encrypted complete backups.
use serde::{Deserialize, Serialize};
use tauri::Runtime;
use zeroize::Zeroizing;
mod otp;
mod vault;
use vault::entry;
pub(crate) use vault::{delete, load, restore_secret, validate_backup_secret, Secret};

#[derive(Serialize)]
pub(crate) struct ImportFile {
    name: String,
    mime: String,
    data: Vec<u8>,
}
/// Read only supported bounded authenticator export/image files explicitly dropped by the user.
#[tauri::command]
pub(crate) async fn read_authenticator_import(path: String) -> Result<ImportFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let path = std::path::Path::new(&path);
        if !path.is_absolute() {
            return Err("authenticatorImportFailed".into());
        }
        let extension = path
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "gif" => "image/gif",
            "avif" => "image/avif",
            "txt" | "json" | "csv" | "uri" | "2fas" | "aegis" => "text/plain",
            _ => return Err("authenticatorImportFailed".into()),
        };
        let file = std::fs::File::open(path).map_err(|_| "authenticatorImportFailed")?;
        let metadata = file.metadata().map_err(|_| "authenticatorImportFailed")?;
        if !metadata.is_file() || metadata.len() > 10 * 1024 * 1024 {
            return Err("authenticatorImportFailed".into());
        }
        let mut data = Vec::new();
        file.take(10 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|_| "authenticatorImportFailed")?;
        if data.len() > 10 * 1024 * 1024 {
            return Err("authenticatorImportFailed".into());
        }
        Ok(ImportFile {
            name: path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("import")
                .to_owned(),
            mime: mime.into(),
            data,
        })
    })
    .await
    .map_err(|_| "authenticatorImportFailed".to_string())?
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Action {
    Status {
        id: String,
    },
    Save {
        id: String,
        password: String,
        totp: String,
    },
    Delete {
        id: String,
    },
}
#[derive(Serialize)]
pub(crate) struct Status {
    enabled: bool,
}
/// Limit automatic password submissions, including repeated health-check batches.
pub(crate) fn reserve_attempt(id: &str) -> Result<(), String> {
    static ATTEMPTS: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<String, std::time::Instant>>,
    > = std::sync::OnceLock::new();
    let mut attempts = ATTEMPTS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "savedLoginFailed")?;
    let now = std::time::Instant::now();
    attempts.retain(|_, time| now.duration_since(*time) < std::time::Duration::from_secs(600));
    if attempts.contains_key(id) {
        return Err("savedLoginCooldown".into());
    }
    attempts.insert(id.to_owned(), now);
    Ok(())
}
fn normalize_totp(input: &str) -> Result<String, String> {
    otp::normalize(input)
}
#[cfg(test)]
pub(crate) fn code(secret: &str, seconds: u64) -> Result<String, String> {
    otp::generate(secret, seconds).map(|value| value.0)
}

pub(crate) fn fill_script(id: &str) -> Result<String, String> {
    let secret = load(id)?.ok_or("savedLoginFailed")?;
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    let (code, expires_at) = otp::generate(&secret.totp, now)?;
    let payload = serde_json::json!({"email":secret.email,"password":secret.password,
        "code":code,"expiresAt":expires_at});
    Ok(include_str!("account_recovery_fill.js")
        .replace("__INTERLUDE_SECRET__", &payload.to_string()))
}
#[tauri::command]
pub(crate) async fn saved_login_settings<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    action: Action,
) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = if matches!(action, Action::Status { .. }) {
            None
        } else {
            Some(
                crate::client_lifecycle::try_lock(crate::commands::account_switch_lock())
                    .map_err(|_| "savedLoginFailed")?,
            )
        };
        match action {
            Action::Status { id } => Ok(Status {
                enabled: load(&id)?.is_some(),
            }),
            Action::Delete { id } => {
                delete(&id)?;
                let paths = crate::storage::resolve_paths(&app)?;
                crate::storage::touch_account_field(
                    &paths,
                    &id,
                    crate::storage::AccountSyncField::PrivateDetails,
                )?;
                Ok(Status { enabled: false })
            }
            Action::Save { id, password, totp } => {
                let password = Zeroizing::new(password);
                let totp = Zeroizing::new(totp);
                let paths = crate::storage::resolve_paths(&app)?;
                let auth =
                    crate::storage::read_json(&crate::storage::managed_auth_path(&paths, &id))?;
                let (email, _, _, actual) = crate::auth::account_fields(&auth)?;
                if actual != id || password.is_empty() || password.len() > 4096 || totp.len() > 4096
                {
                    return Err("savedLoginInvalid".into());
                }
                let secret = Secret {
                    email,
                    password: password.to_string(),
                    totp: normalize_totp(&totp)?,
                };
                let bytes =
                    Zeroizing::new(serde_json::to_vec(&secret).map_err(|_| "savedLoginFailed")?);
                entry(&id)?
                    .set_secret(&bytes)
                    .map_err(|_| "savedLoginFailed")?;
                crate::storage::touch_account_field(
                    &paths,
                    &id,
                    crate::storage::AccountSyncField::PrivateDetails,
                )?;
                Ok(Status { enabled: true })
            }
        }
    })
    .await
    .map_err(|_| "savedLoginFailed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generates_rfc6238_six_digit_sha1_code() {
        assert_eq!(
            code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59).unwrap(),
            "287082"
        );
        assert_eq!(
            code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1111111109).unwrap(),
            "081804"
        );
    }
    #[test]
    fn rejects_unsupported_uri_parameters() {
        assert!(normalize_totp(
            "otpauth://totp/test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=MD5"
        )
        .is_err());
        assert!(normalize_totp("123456").is_err());
    }
    #[test]
    fn system_vault_roundtrip_does_not_return_plaintext_to_status() {
        let id = uuid::Uuid::new_v4().simple().to_string()[..24].to_owned();
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = delete(&self.0);
            }
        }
        let _cleanup = Cleanup(id.clone());
        let secret = Secret {
            email: "fixture@example.invalid".into(),
            password: "synthetic-test-password".into(),
            totp: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".into(),
        };
        entry(&id)
            .unwrap()
            .set_secret(&serde_json::to_vec(&secret).unwrap())
            .unwrap();
        assert_eq!(load(&id).unwrap().unwrap().password, secret.password);
        assert_eq!(
            serde_json::to_value(Status { enabled: true }).unwrap(),
            serde_json::json!({"enabled":true})
        );
        delete(&id).unwrap();
        assert!(load(&id).unwrap().is_none());
    }
}
