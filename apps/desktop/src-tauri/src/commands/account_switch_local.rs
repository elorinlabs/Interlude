/// One explicit selection owns validation, desktop shutdown, credential switch and relaunch.
#[tauri::command]
pub(crate) async fn switch_local_account<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        record_local_switch_stage(&app, "begin");
        let _guard = crate::client_lifecycle::try_lock(account_switch_lock())
            .map_err(|_| {
                record_local_switch_stage(&app, "lock-busy");
                "switchFailed".to_string()
            })?;
        let paths = resolve_paths(&app).map_err(|_| {
            record_local_switch_stage(&app, "paths-failed");
            "switchFailed".to_string()
        })?;
        interlude_account_switch::validate_switch(&interlude_account_switch::SwitchRequest {
            accounts: &paths.accounts, current_auth: &paths.current_auth, state: &paths.state_file, id: &id,
        }).map_err(|error| {
            record_local_switch_stage(&app, &format!("validation-failed:{error:?}"));
            match error {
            interlude_account_switch::SwitchError::CredentialStore=>"credentialStore",
            _=>"switchFailed",
            }.to_string()
        })?;
        record_local_switch_stage(&app, "validated");
        #[cfg(windows)]
        crate::windows_client_processes::stop_desktop_processes().map_err(|error| {
            record_local_switch_stage(&app, &format!("stop-failed:{error:?}"));
            "switchFailed".to_string()
        })?;
        #[cfg(not(windows))]
        stop_chatgpt_processes().map_err(|_|"switchFailed".to_string())?;
        record_local_switch_stage(&app, "stopped");
        interlude_account_switch::switch_account(interlude_account_switch::SwitchRequest {
            accounts: &paths.accounts,
            current_auth: &paths.current_auth,
            state: &paths.state_file,
            id: &id,
        })
        .map_err(|error| {
            record_local_switch_stage(&app, &format!("write-failed:{error:?}"));
            match error {
                interlude_account_switch::SwitchError::CredentialStore => "credentialStore".to_string(),
                interlude_account_switch::SwitchError::Failed => "switchFailed".to_string(),
            }
        })?;
        record_local_switch_stage(&app, "credentials-written");
        let _=app.emit("accounts-changed", ());
        crate::account_automation::request_usage_refresh(&app);
        #[cfg(windows)] {
            // The activation helper resolves the current Store package AUMID at
            // the moment of launch, so a Codex update cannot leave us using a
            // stale version-specific identity.
            let activation_pid = crate::windows_client_processes::submit_desktop_activation()
                .map_err(|error| {
                    record_local_switch_stage(&app, &format!("activation-failed:{error}"));
                    error
                })?;
            record_local_switch_stage(&app, &format!("activation-submitted:pid={activation_pid}"));
            let window_pid = crate::windows_client_processes::wait_for_desktop_window()
                .map_err(|error| {
                    record_local_switch_stage(&app, &format!("window-missing:pid={activation_pid}"));
                    error
                })?;
            record_local_switch_stage(&app, &format!("window-visible:pid={window_pid}"));
        }
        Ok(())
    })
    .await
    .map_err(|_| "switchFailed".to_string())?
}

fn record_local_switch_stage<R: Runtime>(app: &tauri::AppHandle<R>, stage: &str) {
    use std::io::Write;
    use tauri::Manager;
    let Ok(root) = app.path().app_data_dir() else { return; };
    let directory = root.join("logs");
    if fs::create_dir_all(&directory).is_err() { return; }
    let path = directory.join("codex-startup.jsonl");
    if fs::metadata(&path).is_ok_and(|meta| meta.len() > 262_144) {
        let _ = fs::rename(&path, directory.join("codex-startup.jsonl.old"));
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let record = serde_json::json!({"at": Utc::now().to_rfc3339(), "stage": stage});
        let _ = writeln!(file, "{record}");
    }
}

#[tauri::command]
pub(crate) async fn import_local_auth_file<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = Path::new(&path);
        if !source.is_absolute() {
            return Err("switchFailed".to_string());
        }
        let metadata = fs::metadata(source).map_err(|_| "switchFailed".to_string())?;
        if !metadata.is_file() || metadata.len() > 1_048_576 {
            return Err("switchFailed".to_string());
        }
        let auth = read_json(source).map_err(|_| "switchFailed".to_string())?;
        let id = crate::storage::import_local_oauth(&app, auth)?;
        app.emit("accounts-changed", ())
            .map_err(|_| "switchFailed".to_string())?;
        Ok(id)
    })
    .await
    .map_err(|_| "switchFailed".to_string())?
}

#[tauri::command]
pub(crate) async fn launch_local_codex() -> Result<bool, String> {
    crate::client_lifecycle::run(move || {
        let _guard = crate::client_lifecycle::try_lock(account_switch_lock())
            .map_err(|_| "switchFailed".to_string())?;
        #[cfg(windows)]
        if chatgpt_or_codex_is_running()? && crate::windows_client_processes::bring_desktop_window_to_front() {
            return Ok(false);
        }
        #[cfg(windows)]
        {
            if chatgpt_or_codex_is_running()? {
                crate::windows_client_processes::stop_desktop_processes().map_err(|_| "switchFailed".to_string())?;
                crate::windows_client_processes::wait_for_desktop_exit(std::time::Duration::from_secs(10))
                    .map_err(|_| "switchFailed".to_string())?;
            }
            crate::windows_client_processes::activate_desktop()?;
            Ok(true)
        }
        #[cfg(not(windows))]
        Err("switchFailed".to_string())
    })
    .await
}
