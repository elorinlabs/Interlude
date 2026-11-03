fn collect_accounts<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<AccountArchivePayload, String> {
    let paths = resolve_paths(app)?;
    let mut accounts = Vec::new();
    if paths.accounts.exists() {
        for entry in fs::read_dir(&paths.accounts)
            .map_err(|error| format!("Failed to read account store: {error}"))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            if !entry.path().is_dir() {
                continue;
            }
            let auth_path = entry.path().join("auth.json");
            if !auth_path.exists() {
                continue;
            }
            let mut auth = read_json(&auth_path)?;
            let repaired = canonicalize_chatgpt_auth(&mut auth)?;
            validate_auth(&auth)?;
            let (_, _, _, id) = account_fields(&auth)?;
            if repaired {
                write_managed_auth_if_changed(&paths, &id, &auth)?;
            }
            let last_modified_at = Some(load_or_init_last_modified(&paths, &id)?.to_rfc3339());
            accounts.push(AccountArchiveEntry {
                group: load_account_group(&account_group_path(&paths, &id)),
                note: load_note(&note_path(&paths, &id)),
                expires_at: load_expiration(&expiration_path(&paths, &id)),
                private_details: load_account_private_details(&account_private_details_path(
                    &paths, &id,
                )),
                usage: load_usage(&usage_path(&paths, &id)),
                auto_switch_priority: load_auto_switch_priority(&auto_switch_priority_path(
                    &paths, &id,
                )),
                auto_switch_threshold: load_auto_switch_threshold(&auto_switch_threshold_path(
                    &paths, &id,
                )),
                last_modified_at,
                id,
                auth,
            });
        }
    }
    accounts.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(AccountArchivePayload {
        format_version: 6,
        exported_at: Utc::now().to_rfc3339(),
        active_account_id: None,
        active_provider_id: None,
        accounts,
        providers: vec![],
        aggregates: vec![],
        saved_logins: Default::default(),
    })
}

fn apply_archive_accounts<R: Runtime>(
    app: &tauri::AppHandle<R>,
    payload: AccountArchivePayload,
) -> Result<AccountArchiveImportResult, String> {
    if payload.format_version == 0 || payload.format_version > 6 || payload.accounts.is_empty() {
        return Err("folderSyncFormat".into());
    }
    let paths = resolve_paths(app)?;
    fs::create_dir_all(&paths.accounts).map_err(|_| "folderSyncIo")?;
    let mut validated_accounts = Vec::new();
    for mut account in payload.accounts {
        canonicalize_chatgpt_auth(&mut account.auth)?;
        validate_auth(&account.auth)?;
        let (_, _, _, computed_id) = account_fields(&account.auth)?;
        if computed_id != account.id {
            return Err(format!(
                "Archive account {} does not match its auth.json identity",
                account.id
            ));
        }
        validated_accounts.push(account);
    }

    let mut account_ids = Vec::new();
    for account in validated_accounts {
        let auth_path = managed_auth_path(&paths, &account.id);
        let local_auth = read_json(&auth_path).ok();
        let local_usable = local_auth.as_ref().is_some_and(|auth| {
            validate_auth(auth).is_ok()
                && matches!(account_fields(auth), Ok((_, _, _, local_id)) if local_id == account.id)
        });
        let local_modified_at = if local_usable {
            Some(load_or_init_last_modified(&paths, &account.id)?)
        } else {
            None
        };
        let archive_modified_at = account
            .last_modified_at
            .as_deref()
            .and_then(parse_last_modified);
        let should_apply_archive = !local_usable
            || match (local_modified_at.as_ref(), archive_modified_at.as_ref()) {
                (Some(local), Some(archive)) => archive > local,
                (None, _) => true,
                (Some(_), None) => false,
            };
        crate::storage::merge_imported_auth(&paths, &account.id, &account.auth)?;
        if should_apply_archive {
            save_note(&note_path(&paths, &account.id), &account.note)?;
            save_account_group(&account_group_path(&paths, &account.id), &account.group)?;
            save_expiration(&expiration_path(&paths, &account.id), &account.expires_at)?;
            if account.private_details != AccountPrivateDetails::default() {
                save_account_private_details(
                    &account_private_details_path(&paths, &account.id),
                    &account.private_details,
                )?;
            }
            save_auto_switch_priority(
                &auto_switch_priority_path(&paths, &account.id),
                account.auto_switch_priority,
            )?;
            save_auto_switch_threshold(
                &auto_switch_threshold_path(&paths, &account.id),
                account.auto_switch_threshold,
            )?;
            save_account_last_modified(
                &paths,
                &account.id,
                archive_modified_at.unwrap_or_else(Utc::now),
            )?;
        }
        if !account_ids.contains(&account.id) {
            account_ids.push(account.id);
        }
    }

    Ok(AccountArchiveImportResult {
        imported: account_ids.len(),
    })
}
