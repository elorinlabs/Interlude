use super::{group_visible_models, provider_group_model_name};
use crate::models::ProviderProfile;
use std::collections::BTreeMap;

const ACCOUNT_NAME_LENGTH: usize = 12;
const ACCOUNT_ID_LENGTH: usize = 4;

/// Labels are independent of routing slugs so renaming an account cannot break existing conversations.
pub(super) fn display_names(providers: &[ProviderProfile]) -> BTreeMap<String, String> {
    providers
        .iter()
        .flat_map(|provider| {
            let member = member_label(provider);
            group_visible_models(provider)
                .into_iter()
                .map(move |model| {
                    let slug = provider_group_model_name(provider, model);
                    let label = member
                        .as_ref()
                        .map_or_else(|| slug.clone(), |name| format!("{model} · {name}"));
                    (slug, label)
                })
        })
        .collect()
}

fn member_label(provider: &ProviderProfile) -> Option<String> {
    let id = crate::aggregate_api::member_account_id(&provider.id)?;
    if let Some(alias) = provider
        .account_alias
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(alias.to_string());
    }
    let name = provider.name.split('@').next().unwrap_or(&provider.name);
    let shortened: String = name.chars().take(ACCOUNT_NAME_LENGTH).collect();
    let suffix = if name.chars().count() > ACCOUNT_NAME_LENGTH {
        "…"
    } else {
        ""
    };
    let id: String = id.chars().take(ACCOUNT_ID_LENGTH).collect();
    Some(format!("{shortened}{suffix} · {id}"))
}
