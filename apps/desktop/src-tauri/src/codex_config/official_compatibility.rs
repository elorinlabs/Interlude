use super::*;

/// Old chats can still select the proxy provider after a stop without history migration.
/// Keep that ID resolvable using normal OpenAI authentication and default endpoints.
pub(crate) fn ensure_official_provider_compatibility(content: &str) -> Result<String, ConfigError> {
    let mut document = parse_document(content)?;
    let selected = document
        .get("model_provider")
        .and_then(Item::as_str)
        .unwrap_or(OFFICIAL_PROVIDER_ID);
    if !matches!(selected, OFFICIAL_PROVIDER_ID | LOCAL_PROXY_PROVIDER_ID)
        || local_proxy_table(&document).is_some()
    {
        return Ok(content.to_string());
    }
    set_official_compatibility_provider(&mut document)?;
    Ok(document.to_string())
}

pub(super) fn set_official_compatibility_provider(
    document: &mut DocumentMut,
) -> Result<(), ConfigError> {
    model_providers_mut(document)?
        .insert(LOCAL_PROXY_PROVIDER_ID, Item::Table(official_provider()));
    Ok(())
}

pub(super) fn is_official_compatibility_provider(document: &DocumentMut) -> bool {
    let Some(provider) = local_proxy_table(document) else {
        return false;
    };
    let expected = official_provider();
    provider.len() == expected.len()
        && expected
            .iter()
            .all(|(key, item)| match (provider.get(key), item.as_value()) {
                (Some(actual), Some(Value::String(value))) => {
                    actual.as_str() == Some(value.value())
                }
                (Some(actual), Some(Value::Boolean(value))) => {
                    actual.as_bool() == Some(*value.value())
                }
                _ => false,
            })
}

fn official_provider() -> Table {
    let mut provider = Table::new();
    provider["name"] = value("OpenAI");
    provider["wire_api"] = value("responses");
    provider["requires_openai_auth"] = value(true);
    provider["supports_websockets"] = value(true);
    provider
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopped_proxy_keeps_old_chat_provider_without_proxy_credentials() {
        for requires_openai_auth in [false, true] {
            let options = LocalProxyConfig {
                requires_openai_auth,
                ..super::super::tests::proxy_options()
            };
            let active = apply_local_proxy("", &options).unwrap();
            let restored = restore_official(&active, None, Some("gpt-5.6-sol")).unwrap();
            let document = restored.parse::<DocumentMut>().unwrap();
            assert_eq!(document["model_provider"].as_str(), Some("openai"));
            assert!(is_official_compatibility_provider(&document));
            assert!(!restored.contains(LOCAL_PROXY_BASE_URL));
            assert!(!restored.contains(LOCAL_PROXY_TOKEN));
            assert!(!restored.contains(TOKEN_COMMAND_ARGUMENT));
            assert!(!contains_local_proxy(&restored));
        }
    }

    #[test]
    fn compatibility_repair_preserves_settings_and_is_idempotent() {
        let source = "model = 'my-model'\nnotify = ['done']\n[features]\njs_repl = true\n";
        let repaired = ensure_official_provider_compatibility(source).unwrap();
        let document = repaired.parse::<DocumentMut>().unwrap();
        assert_eq!(document["model"].as_str(), Some("my-model"));
        assert_eq!(document["notify"][0].as_str(), Some("done"));
        assert_eq!(document["features"]["js_repl"].as_bool(), Some(true));
        assert!(is_official_compatibility_provider(&document));
        assert_eq!(
            ensure_official_provider_compatibility(&repaired).unwrap(),
            repaired
        );
    }

    #[test]
    fn compatibility_does_not_replace_active_or_unrelated_providers() {
        let active = apply_local_proxy("", &super::super::tests::proxy_options()).unwrap();
        let custom = "model_provider = 'custom'\n[model_providers.custom]\nname = 'Custom'\n";
        for source in [active.as_str(), custom] {
            assert_eq!(
                ensure_official_provider_compatibility(source).unwrap(),
                source
            );
        }
        assert!(contains_local_proxy(&active));
    }

    #[test]
    fn restarting_proxy_replaces_compatibility_route() {
        let official = ensure_official_provider_compatibility("").unwrap();
        let active = apply_local_proxy(&official, &super::super::tests::proxy_options()).unwrap();
        let document = active.parse::<DocumentMut>().unwrap();
        assert!(contains_local_proxy(&active));
        assert!(!is_official_compatibility_provider(&document));
        assert_eq!(
            document["model_providers"][LOCAL_PROXY_PROVIDER_ID]["base_url"].as_str(),
            Some(LOCAL_PROXY_BASE_URL)
        );
    }
}
