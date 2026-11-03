use super::{
    child, object, text, Mapping, ProviderProfile, SyncError, SyncResult, Value, API_KEY_REF,
    PROVIDERS_ENTRY, SELECTOR_ENTRY,
};
use crate::third_party_apps::{provider_protocol, ProviderProtocol, MANAGED_PROVIDER_ID};

pub(super) fn take_legacy(config: &mut Value) -> SyncResult<Mapping> {
    let root = object(config)?;
    let mut migrated = Mapping::new();
    // Both sections would otherwise overwrite the complete profile entry on the
    // next Harness boot, even when they contain only user-managed providers.
    for id in [PROVIDERS_ENTRY, SELECTOR_ENTRY] {
        if let Some(entry) = root.remove(text(id)) {
            migrated.insert(text(id), entry);
        }
    }
    Ok(migrated)
}

pub(super) fn update(
    patch: &mut Value,
    legacy: &Mapping,
    provider: Option<&ProviderProfile>,
) -> SyncResult<()> {
    let entries = patch.as_sequence_mut().ok_or(SyncError::InvalidConfig)?;
    for id in [PROVIDERS_ENTRY, SELECTOR_ENTRY] {
        let create = provider.is_some() || legacy.contains_key(text(id));
        let Some(index) = entry_index(entries, id, create)? else {
            continue;
        };
        let entry = object(&mut entries[index])?;
        let config = child(entry, "config")?;
        if let Some(inherited) = legacy.get(text(id)) {
            merge_missing(
                config,
                inherited.as_mapping().ok_or(SyncError::InvalidConfig)?,
            )?;
        }
        if id == SELECTOR_ENTRY
            && provider.is_none()
            && config.get(text("provider")).and_then(Value::as_str) == Some(MANAGED_PROVIDER_ID)
        {
            entries.remove(index);
            continue;
        }
        if id == PROVIDERS_ENTRY {
            update_providers(config, provider)?;
        } else {
            update_selector(config, provider);
        }
    }
    Ok(())
}

fn entry_index(entries: &mut Vec<Value>, id: &str, create: bool) -> SyncResult<Option<usize>> {
    let matches = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.get("id").and_then(Value::as_str) == Some(id))
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [index] => Ok(Some(*index)),
        [] if create => {
            entries.push(Value::Mapping(Mapping::from_iter([(text("id"), text(id))])));
            Ok(Some(entries.len() - 1))
        }
        [] => Ok(None),
        _ => Err(SyncError::InvalidConfig),
    }
}

fn merge_missing(target: &mut Mapping, source: &Mapping) -> SyncResult<()> {
    for (key, value) in source {
        match target.get_mut(key) {
            Some(Value::Mapping(existing)) if value.is_mapping() => {
                merge_missing(
                    existing,
                    value.as_mapping().ok_or(SyncError::InvalidConfig)?,
                )?;
            }
            Some(_) => {}
            None => {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    Ok(())
}

fn update_providers(config: &mut Mapping, provider: Option<&ProviderProfile>) -> SyncResult<()> {
    let providers = child(config, "providers")?;
    let Some(provider) = provider else {
        providers.remove(text(MANAGED_PROVIDER_ID));
        return Ok(());
    };
    let route = child(providers, MANAGED_PROVIDER_ID)?;
    route
        .entry(text("displayName"))
        .or_insert_with(|| text(MANAGED_PROVIDER_ID));
    route.insert(text("apiKeyEnv"), text(API_KEY_REF));
    route.insert(
        text("api"),
        text(match provider_protocol(provider) {
            ProviderProtocol::Anthropic => "anthropic-messages",
            ProviderProtocol::OpenaiResponses => "openai-responses",
            ProviderProtocol::OpenaiChat => "openai-completions",
        }),
    );
    route.insert(text("baseURL"), text(&provider.base_url));
    let mut model = route
        .get(text("models"))
        .and_then(Value::as_sequence)
        .and_then(|models| {
            models.iter().find(|model| {
                model.get("id").and_then(Value::as_str) == Some(provider.model.as_str())
            })
        })
        .cloned()
        .unwrap_or_else(|| Value::Mapping(Mapping::new()));
    let fields = object(&mut model)?;
    fields.insert(text("id"), text(&provider.model));
    fields
        .entry(text("name"))
        .or_insert_with(|| text(&provider.model));
    route.insert(text("models"), Value::Sequence(vec![model]));
    Ok(())
}

fn update_selector(config: &mut Mapping, provider: Option<&ProviderProfile>) {
    if let Some(provider) = provider {
        config.insert(text("provider"), text(MANAGED_PROVIDER_ID));
        config.insert(text("model"), text(&provider.model));
    }
}
