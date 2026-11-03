fn collect_full_snapshot(app: &tauri::AppHandle) -> Result<AccountArchivePayload, String> {
    let mut payload = collect_accounts(app).map_err(|_| "folderSyncIo")?;
    payload.format_version = 6;
    payload.active_account_id = None;
    payload.active_provider_id = None;
    payload.providers.clear();
    payload.aggregates.clear();
    payload.exported_at.clear();
    for account in &mut payload.accounts {
        account.usage = Default::default();
        if let Some(secret) =
            crate::account_recovery::load(&account.id).map_err(|_| "backupVault")?
        {
            let (email, _, _, _) = account_fields(&account.auth).map_err(|_| "folderSyncFormat")?;
            crate::account_recovery::validate_backup_secret(&account.id, &secret, &email)
                .map_err(|_| "backupVault")?;
            payload.saved_logins.insert(account.id.clone(), secret);
        }
    }
    Ok(payload)
}

fn validate_full_snapshot(payload: &mut AccountArchivePayload) -> Result<(), String> {
    if payload.accounts.len() > 2000
        || payload.saved_logins.len() > 2000
        || !(1..=6).contains(&payload.format_version)
    {
        return Err("folderSyncFormat".into());
    }
    let mut seen = std::collections::HashSet::new();
    for account in &mut payload.accounts {
        canonicalize_chatgpt_auth(&mut account.auth).map_err(|_| "folderSyncFormat")?;
        validate_auth(&account.auth).map_err(|_| "folderSyncFormat")?;
        let (email, _, _, id) = account_fields(&account.auth).map_err(|_| "folderSyncFormat")?;
        if id != account.id || !seen.insert(id.clone()) {
            return Err("folderSyncFormat".into());
        }
        account.private_details = account
            .private_details
            .clone()
            .normalized()
            .map_err(|_| "folderSyncFormat")?;
        if let Some(secret) = payload.saved_logins.get(&id) {
            crate::account_recovery::validate_backup_secret(&id, secret, &email)
                .map_err(|_| "folderSyncFormat")?;
        }
    }
    if payload.saved_logins.keys().any(|id| !seen.contains(id)) {
        return Err("folderSyncFormat".into());
    }
    Ok(())
}

fn snapshot_login_updates(
    paths: &crate::storage::Paths,
    payload: &AccountArchivePayload,
) -> Result<Vec<(String, crate::account_recovery::Secret)>, String> {
    let mut updates = Vec::new();
    for account in &payload.accounts {
        let Some(secret) = payload.saved_logins.get(&account.id) else {
            continue;
        };
        let local = crate::account_recovery::load(&account.id).map_err(|_| "backupVault")?;
        let newer = match (
            account
                .last_modified_at
                .as_deref()
                .and_then(parse_last_modified),
            crate::storage::load_last_modified(&crate::storage::last_modified_path(
                paths,
                &account.id,
            )),
        ) {
            (Some(archive), Some(local)) => archive > local,
            _ => false,
        };
        if local.is_none() || newer {
            updates.push((account.id.clone(), secret.clone()));
        }
    }
    Ok(updates)
}

fn restore_full_snapshot(
    app: &tauri::AppHandle,
    mut payload: AccountArchivePayload,
) -> Result<usize, String> {
    validate_full_snapshot(&mut payload)?;
    let updates = snapshot_login_updates(&resolve_paths(app)?, &payload)?;
    payload.active_account_id = None;
    payload.active_provider_id = None;
    payload.providers.clear();
    payload.aggregates.clear();
    let before = vault_transaction::restore(
        &updates,
        |id| crate::account_recovery::load(id).map_err(|_| "backupVault".into()),
        |id, value| {
            crate::account_recovery::restore_secret(id, value).map_err(|_| "backupVault".into())
        },
    )?;
    let result = apply_archive_accounts(app, payload).map_err(|_| "folderSyncFormat".to_string());
    match result {
        Ok(result) => {
            app.emit("accounts-changed", ())
                .map_err(|_| "folderSyncIo")?;
            Ok(result.imported)
        }
        Err(error) => {
            vault_transaction::rollback(&before, |id, value| {
                crate::account_recovery::restore_secret(id, value).map_err(|_| "backupVault".into())
            })?;
            Err(error)
        }
    }
}
