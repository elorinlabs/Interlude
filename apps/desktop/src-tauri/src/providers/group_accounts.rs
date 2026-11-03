use crate::{
    aggregate_api::{read_member_profile, ACCOUNT_MEMBER_PREFIX},
    models::ProviderProfile,
    storage::{account_group_path, load_account_group, read_state, Paths},
};

/// Refresh catalog labels off the UI thread after a local edit or a cloud update.
pub(crate) fn refresh_labels<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Result<(), String> {
    use tauri::Emitter;
    for paths in crate::storage::resolve_enabled_paths(app)? {
        let Some(group) = read_state(&paths).active_provider_group else {
            continue;
        };
        if load_account_group(&account_group_path(&paths, id)) != group {
            continue;
        }
        let members = super::provider_group_profiles(&paths, &group)?;
        if !members
            .iter()
            .any(|member| crate::aggregate_api::member_account_id(&member.id) == Some(id))
        {
            continue;
        }
        refresh_catalog(&paths, &members)?;
        app.emit("providers-changed", ())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(super) fn refresh_catalog(paths: &Paths, members: &[ProviderProfile]) -> Result<(), String> {
    let catalog = super::model_catalog_for_provider_group_with_image_route(
        members,
        super::image_input_route_enabled(paths),
    );
    // A label edit must not rewrite the user's selected model or other Codex settings.
    super::write_model_catalog(paths, catalog)?;
    super::refresh_codex_group_models_best_effort(paths, members);
    Ok(())
}

/// Group membership is resolved on each request so disabled or moved accounts cannot be reused.
pub(super) fn profiles(paths: &Paths, group: &str) -> Result<Vec<ProviderProfile>, String> {
    let state = read_state(paths);
    let entries = match std::fs::read_dir(&paths.accounts) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Unable to load official accounts".to_string()),
    };
    let mut profiles = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| "Unable to load official accounts".to_string())?;
        let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if state.disabled_account_ids.contains(&id)
            || load_account_group(&account_group_path(paths, &id)) != group
        {
            continue;
        }
        // Unavailable credentials must not prevent healthy members from serving the group.
        if let Ok(mut profile) = read_member_profile(paths, &format!("{ACCOUNT_MEMBER_PREFIX}{id}"))
        {
            profile.group = group.to_string();
            profile.account_alias = crate::storage::load_account_private_details(
                &crate::storage::account_private_details_path(paths, &id),
            )
            .alias;
            profiles.push(profile);
        }
    }
    profiles.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(profiles)
}
