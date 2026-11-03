use super::*;

pub(crate) fn member_profiles(
    paths: &Paths,
    aggregate: &AggregateApiConfig,
) -> Result<Vec<ProviderProfile>, String> {
    let profiles = aggregate
        .member_provider_ids
        .iter()
        .map(|id| read_member_profile(paths, id))
        .collect::<Result<Vec<_>, _>>()?;
    validate_members(aggregate, &profiles)?;
    Ok(profiles)
}

pub(crate) fn logical_profile(
    aggregate: &AggregateApiConfig,
    profiles: &[ProviderProfile],
) -> Result<ProviderProfile, String> {
    let mut profile = profiles
        .first()
        .cloned()
        .ok_or_else(|| "Aggregate API does not contain any available APIs".to_string())?;
    profile.id = active_id(&aggregate.id);
    profile.kind = ProviderKind::Custom;
    profile.name.clone_from(&aggregate.name);
    profile.group.clear();
    profile.model.clone_from(&aggregate.model);
    profile.models = vec![aggregate.model.clone()];
    profile.model_reasoning_efforts = common_reasoning_efforts(aggregate, profiles);
    profile.model_context_windows = common_context_window(aggregate, profiles);
    profile.image_input_models = common_image_input_models(aggregate, profiles);
    profile.image_input_models_configured = true;
    profile.model_selection_controlled_by_codex = true;
    profile.fast_mode_enabled = profiles.iter().all(|provider| provider.fast_mode_enabled);
    profile.balance_platform = None;
    Ok(profile)
}

pub(crate) fn force_aggregate_model(provider: &ProviderProfile, model: &str) -> ProviderProfile {
    let mut selected = provider.clone();
    selected.model = model.to_string();
    selected.models = vec![model.to_string()];
    selected.model_selection_controlled_by_codex = false;
    selected
}

pub(super) fn validate_members(
    config: &AggregateApiConfig,
    profiles: &[ProviderProfile],
) -> Result<(), String> {
    if profiles.len() < 2 {
        return Err("Aggregate API does not contain enough available APIs".to_string());
    }
    if profiles
        .iter()
        .any(|provider| !provider_supports_model(provider, member_model(config, &provider.id)))
    {
        return Err("Every API in an aggregate must support the selected model".to_string());
    }
    Ok(())
}

pub(crate) fn member_model<'a>(config: &'a AggregateApiConfig, provider_id: &str) -> &'a str {
    config
        .member_models
        .get(provider_id)
        .map(String::as_str)
        .unwrap_or(&config.model)
}

fn provider_supports_model(provider: &ProviderProfile, model: &str) -> bool {
    // The shared official catalog can lag account entitlements; allow explicit model names.
    if member_account_id(&provider.id).is_some() {
        return !model.trim().is_empty();
    }
    provider.model == model || provider.models.iter().any(|candidate| candidate == model)
}

fn common_reasoning_efforts(
    config: &AggregateApiConfig,
    profiles: &[ProviderProfile],
) -> ModelReasoningEfforts {
    let Some(first) = profiles
        .first()
        .and_then(|provider| {
            provider
                .model_reasoning_efforts
                .get(member_model(config, &provider.id))
        })
        .cloned()
    else {
        return ModelReasoningEfforts::new();
    };
    let common = first
        .into_iter()
        .filter(|effort| {
            profiles.iter().all(|provider| {
                provider
                    .model_reasoning_efforts
                    .get(member_model(config, &provider.id))
                    .is_some_and(|efforts| efforts.contains(effort))
            })
        })
        .collect::<Vec<_>>();
    if common.is_empty() {
        ModelReasoningEfforts::new()
    } else {
        [(config.model.clone(), common)].into()
    }
}

fn common_context_window(
    config: &AggregateApiConfig,
    profiles: &[ProviderProfile],
) -> ModelContextWindows {
    profiles
        .iter()
        .filter_map(|provider| {
            provider
                .model_context_windows
                .get(member_model(config, &provider.id))
                .copied()
        })
        .min()
        .map(|window| [(config.model.clone(), window)].into())
        .unwrap_or_default()
}

fn common_image_input_models(
    aggregate: &AggregateApiConfig,
    profiles: &[ProviderProfile],
) -> Vec<String> {
    let supported_by_all = profiles.iter().all(|provider| {
        provider
            .image_input_models
            .iter()
            .any(|model| model == member_model(aggregate, &provider.id))
    });
    if supported_by_all {
        vec![aggregate.model.clone()]
    } else {
        Vec::new()
    }
}
