use interlude_account_switch::health::{Health, Status};

#[derive(Serialize, Deserialize)]
struct HealthObservation {
    fingerprint: String,
    health: Health,
}

fn health_paths<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<Paths, String> {
    if id.is_empty()
        || id.len() > 200
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("accountHealthFailed".to_string());
    }
    resolve_paths(app).map_err(|_| "accountHealthFailed".to_string())
}

fn auth_fingerprint(auth: &Value) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(auth.to_string().as_bytes()))
}

fn local_health(paths: &Paths, id: &str) -> Health {
    let now = Utc::now().timestamp();
    let Ok(auth) = read_json(&managed_auth_path(paths, id)) else {
        return interlude_account_switch::health::local(false, None, false, now);
    };
    let valid = interlude_account_switch::sanitized_oauth(&auth).is_ok();
    let expires = token_string(&auth, "access_token")
        .and_then(|token| crate::auth::decode_jwt(token).ok())
        .and_then(|claims| claims.get("exp").and_then(Value::as_i64));
    let refreshable = token_string(&auth, "refresh_token").is_some_and(|value| !value.is_empty());
    let local = interlude_account_switch::health::local(valid, expires, refreshable, now);
    let cached = fs::read(account_dir(paths, id).join("health.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HealthObservation>(&bytes).ok())
        .filter(|record| record.fingerprint == auth_fingerprint(&auth))
        .map(|record| record.health);
    interlude_account_switch::health::combine(local, cached, now)
}

#[tauri::command]
pub(crate) async fn load_account_health<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
) -> Result<HashMap<String, Health>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if ids.len() > 5000 {
            return Err("accountHealthFailed".to_string());
        }
        ids.into_iter()
            .map(|id| {
                let paths = health_paths(&app, &id)?;
                Ok((id.clone(), local_health(&paths, &id)))
            })
            .collect()
    })
    .await
    .map_err(|_| "accountHealthFailed".to_string())?
}

fn probe_account<R: Runtime>(
    app: &tauri::AppHandle<R>,
    paths: &Paths,
    id: &str,
) -> (Status, Option<String>) {
    let Ok(mut auth) = load_auth_for_request(app, paths, id) else {
        // A failed disk read is not evidence that a server rejected the login.
        return (Status::CheckFailed, None);
    };
    let status = (|| {
        let Ok(client) = api_client() else {
            return Status::CheckFailed;
        };
        if let Err(error) = refresh_auth_if_needed(&client, &mut auth, paths, id) {
            return renewal_failure_status(&error);
        }
        let Ok(mut response) = usage_request(&client, &auth.value) else {
            return Status::CheckFailed;
        };
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            if token_string(&auth.value, "refresh_token").is_none_or(str::is_empty) {
                return Status::NeedsLogin;
            }
            if let Err(error) = auth.refresh(&client, paths, id) {
                return renewal_failure_status(&error);
            }
            let Ok(retried) = usage_request(&client, &auth.value) else {
                return Status::CheckFailed;
            };
            response = retried;
        }
        interlude_account_switch::health::http_status(response.status().as_u16())
    })();
    (status, Some(auth_fingerprint(&auth.value)))
}

fn renewal_failure_status(error: &str) -> Status {
    if error == "credentialRefreshRejected" { Status::NeedsLogin } else { Status::CheckFailed }
}

#[cfg(test)]mod recovery_tests{
    use super::*;
    #[test]fn only_confirmed_refresh_rejection_requests_login(){
        assert_eq!(renewal_failure_status("credentialRefreshRejected"),Status::NeedsLogin);
        for error in ["HTTP 429","HTTP 503","timeout","Active desktop login renewal is pending; retry usage later"]{
            assert_eq!(renewal_failure_status(error),Status::CheckFailed);
        }
    }
}

#[tauri::command]
pub(crate) async fn check_account_health<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<Health, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::client_lifecycle::try_lock(account_switch_lock())
            .map_err(|_| "accountHealthBusy".to_string())?;
        let paths = health_paths(&app, &id)?;
        let (status, fingerprint) = probe_account(&app, &paths, &id);
        let health = Health {
            status,
            checked_at: Some(Utc::now().timestamp()),
        };
        if let Ok(auth) = read_json(&managed_auth_path(&paths, &id)) {
            if fingerprint
                .as_ref()
                .is_some_and(|value| *value != auth_fingerprint(&auth))
            {
                return Ok(local_health(&paths, &id));
            }
            let record = HealthObservation {
                fingerprint: auth_fingerprint(&auth),
                health: health.clone(),
            };
            let value =
                serde_json::to_value(record).map_err(|_| "accountHealthFailed".to_string())?;
            write_json_atomic(&account_dir(&paths, &id).join("health.json"), &value)
                .map_err(|_| "accountHealthFailed".to_string())?;
        }
        Ok(health)
    })
    .await
    .map_err(|_| "accountHealthFailed".to_string())?
}
