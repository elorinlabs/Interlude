use crate::{
    auth::{account_fields, validate_auth},
    models::{ProviderApiFormat, ProviderKind, ProviderProfile},
    official_models, providers,
    storage::{managed_auth_path, read_json, Paths},
};

pub(crate) const ACCOUNT_MEMBER_PREFIX: &str = "account:";

/// Account references share the ordered member list without colliding with Provider IDs.
pub(crate) fn member_account_id(member_id: &str) -> Option<&str> {
    member_id.strip_prefix(ACCOUNT_MEMBER_PREFIX)
}

pub(super) fn validate_member_id(id: &str) -> Result<(), String> {
    super::validate_id(member_account_id(id).unwrap_or(id))
}

/// Only capability metadata is projected as a profile; credentials stay in the account store.
pub(crate) fn read_member_profile(paths: &Paths, id: &str) -> Result<ProviderProfile, String> {
    validate_member_id(id)?;
    let Some(account_id) = member_account_id(id) else {
        return providers::read_provider(paths, id);
    };
    let unavailable = || "An official account in this aggregate is unavailable".to_string();
    let auth = read_json(&managed_auth_path(paths, account_id)).map_err(|_| unavailable())?;
    validate_auth(&auth).map_err(|_| unavailable())?;
    let (email, _, _, credential_id) = account_fields(&auth).map_err(|_| unavailable())?;
    if credential_id != account_id {
        return Err(unavailable());
    }
    Ok(official_profile(paths, id, email))
}

fn official_profile(paths: &Paths, id: &str, name: String) -> ProviderProfile {
    let catalog = official_models::cached_catalog(paths);
    let reasoning = catalog
        .models
        .iter()
        .filter_map(|model| {
            providers::known_model_reasoning_efforts(model)
                .map(|efforts| (model.clone(), efforts.to_vec()))
        })
        .collect();
    ProviderProfile {
        account_alias: None,
        id: id.to_string(),
        kind: ProviderKind::OpenAi,
        name,
        group: String::new(),
        base_url: "https://chatgpt.com/backend-api/codex".into(),
        api_key: String::new(),
        model: providers::official_model(),
        models: catalog.models,
        model_reasoning_efforts: reasoning,
        model_context_windows: Default::default(),
        model_api_formats: Default::default(),
        image_input_models: catalog.image_input_models,
        image_input_models_configured: true,
        context_window: None,
        model_selection_controlled_by_codex: true,
        fast_mode_enabled: true,
        api_format: ProviderApiFormat::OpenaiResponses,
        request_options: None,
        balance_platform: None,
        balance_query_url: None,
        balance_query_token: None,
        wallet_query_url: None,
        wallet_query_token: None,
        wallet_username: None,
        wallet_password: None,
    }
}
