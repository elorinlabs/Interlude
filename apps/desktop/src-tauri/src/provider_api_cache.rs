use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use crate::models::{ProviderApiFormat, ProviderProfile};

#[derive(Hash, PartialEq, Eq)]
struct ProviderModelKey {
    provider_id: String,
    model: String,
}

struct CachedApiFormat {
    base_url: String,
    configured_format: ProviderApiFormat,
    format: ProviderApiFormat,
}

static API_FORMAT_CACHE: OnceLock<Mutex<HashMap<ProviderModelKey, CachedApiFormat>>> =
    OnceLock::new();

/// A detected protocol is valid only for the configuration that produced it.
pub(crate) fn cached_format(provider: &ProviderProfile, model: &str) -> Option<ProviderApiFormat> {
    let key = cache_key(&provider.id, model);
    let mut cache = cache().lock().ok()?;
    let normalized_base_url = normalized_base_url(&provider.base_url);
    if cache.get(&key).is_some_and(|entry| {
        entry.base_url == normalized_base_url && entry.configured_format == provider.api_format
    }) {
        return cache.get(&key).map(|entry| entry.format);
    }
    cache.remove(&key);
    None
}

pub(crate) fn remember_format(provider: &ProviderProfile, model: &str, format: ProviderApiFormat) {
    let Ok(mut cache) = cache().lock() else {
        // Protocol detection is best-effort and must never fail a provider request.
        return;
    };
    cache.insert(
        cache_key(&provider.id, model),
        CachedApiFormat {
            base_url: normalized_base_url(&provider.base_url),
            configured_format: provider.api_format,
            format,
        },
    );
}

pub(crate) fn forget_format(provider_id: &str, model: &str) {
    let Ok(mut cache) = cache().lock() else {
        return;
    };
    cache.remove(&cache_key(provider_id, model));
}

fn cache() -> &'static Mutex<HashMap<ProviderModelKey, CachedApiFormat>> {
    API_FORMAT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(provider_id: &str, model: &str) -> ProviderModelKey {
    ProviderModelKey {
        provider_id: provider_id.to_string(),
        model: model.trim().to_string(),
    }
}

fn normalized_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str, base_url: &str) -> ProviderProfile {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": "cache fixture", "baseUrl": base_url, "apiKey": "",
            "model": "model-a", "apiFormat": "openaiResponses"
        }))
        .unwrap()
    }

    #[test]
    fn caches_formats_independently_for_each_provider_model() {
        let mut provider = provider("cache-provider-a", "https://relay.example.com/v1");
        remember_format(&provider, "model-a", ProviderApiFormat::OpenaiChat);
        remember_format(&provider, "model-b", ProviderApiFormat::OpenaiResponses);
        provider.base_url.push('/');
        assert_eq!(
            cached_format(&provider, "model-a"),
            Some(ProviderApiFormat::OpenaiChat)
        );
        assert_eq!(
            cached_format(&provider, "model-b"),
            Some(ProviderApiFormat::OpenaiResponses)
        );
        provider.id = "cache-provider-b".into();
        assert_eq!(cached_format(&provider, "model-a"), None);
    }

    #[test]
    fn changing_the_provider_endpoint_invalidates_cached_formats() {
        let mut provider = provider("cache-provider-endpoint", "https://old.example.com/v1");
        remember_format(&provider, "model-a", ProviderApiFormat::OpenaiChat);

        provider.base_url = "https://new.example.com/v1".into();
        assert_eq!(cached_format(&provider, "model-a"), None);
    }

    #[test]
    fn an_in_flight_old_request_cannot_override_a_new_protocol_setting() {
        let original = provider("cache-provider-in-flight", "https://relay.example.com/v1");
        let mut updated = original.clone();
        updated.api_format = ProviderApiFormat::OpenaiChat;
        remember_format(&updated, "model-a", ProviderApiFormat::OpenaiChat);
        remember_format(&original, "model-a", ProviderApiFormat::OpenaiResponses);
        assert_eq!(cached_format(&updated, "model-a"), None);
    }
}
