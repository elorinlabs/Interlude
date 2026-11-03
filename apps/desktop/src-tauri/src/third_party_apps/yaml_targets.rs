use std::{
    env,
    path::{Path, PathBuf},
};

use serde_yaml::{Mapping, Value};

use crate::{models::ProviderProfile, storage::write_text_atomic};

use super::{provider_context_window, provider_protocol, ProviderProtocol, MANAGED_PROVIDER_ID};

pub(super) fn sync_hermes(home: &Path, provider: Option<&ProviderProfile>) -> Result<(), String> {
    let path = hermes_path(home);
    let mut config = read_yaml(&path)?;
    update_hermes_config(&mut config, provider)?;
    write_yaml(&path, &config)
}

fn hermes_path(home: &Path) -> PathBuf {
    env::var_os("HERMES_HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| {
            if cfg!(windows) {
                env::var_os("LOCALAPPDATA")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| home.join("AppData").join("Local"))
                    .join("hermes")
            } else {
                home.join(".hermes")
            }
        })
        .join("config.yaml")
}

fn read_yaml(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Mapping(Mapping::new()));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("无法读取 {}：{error}", path.display()))?;
    if content.trim().is_empty() {
        return Ok(Value::Mapping(Mapping::new()));
    }
    serde_yaml::from_str(&content)
        .map_err(|error| format!("{} 的 YAML 格式无效：{error}", path.display()))
}

fn write_yaml(path: &Path, value: &Value) -> Result<(), String> {
    let content = serde_yaml::to_string(value)
        .map_err(|error| format!("序列化 {} 失败：{error}", path.display()))?;
    write_text_atomic(path, &content)
}

fn mapping(value: &mut Value) -> Result<&mut Mapping, String> {
    value
        .as_mapping_mut()
        .ok_or_else(|| "应用 YAML 配置的根节点必须是对象".to_string())
}

fn child_mapping<'a>(parent: &'a mut Mapping, key: &str) -> &'a mut Mapping {
    let key = Value::String(key.to_string());
    let value = parent
        .entry(key)
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    if !value.is_mapping() {
        *value = Value::Mapping(Mapping::new());
    }
    value
        .as_mapping_mut()
        .expect("value was replaced with a mapping")
}

fn text(value: &str) -> Value {
    Value::String(value.to_string())
}

fn update_hermes_config(
    config: &mut Value,
    provider: Option<&ProviderProfile>,
) -> Result<(), String> {
    let root = mapping(config)?;
    {
        let list = root
            .entry(text("custom_providers"))
            .or_insert_with(|| Value::Sequence(Vec::new()));
        let providers = list
            .as_sequence_mut()
            .ok_or_else(|| "Hermes 的 custom_providers 必须是数组".to_string())?;
        providers
            .retain(|entry| entry.get("name").and_then(Value::as_str) != Some(MANAGED_PROVIDER_ID));
        if let Some(provider) = provider {
            providers.push(hermes_provider(provider));
        }
    }
    let Some(provider) = provider else {
        clear_hermes_model(root);
        return Ok(());
    };

    let model = child_mapping(root, "model");
    model.insert(text("default"), text(&provider.model));
    model.insert(text("provider"), text(MANAGED_PROVIDER_ID));
    model.insert(text("base_url"), text(&provider.base_url));
    model.insert(text("api_key"), text(&provider.api_key));
    model.insert(
        text("api_mode"),
        text(hermes_api_mode(provider_protocol(provider))),
    );
    Ok(())
}

fn clear_hermes_model(root: &mut Mapping) {
    let managed = root
        .get(text("model"))
        .and_then(Value::as_mapping)
        .and_then(|model| model.get(text("provider")))
        .and_then(Value::as_str)
        == Some(MANAGED_PROVIDER_ID);
    if !managed {
        return;
    }
    let Some(model) = root.get_mut(text("model")).and_then(Value::as_mapping_mut) else {
        return;
    };
    for key in ["default", "provider", "base_url", "api_key", "api_mode"] {
        model.remove(text(key));
    }
    if model.is_empty() {
        root.remove(text("model"));
    }
}

fn hermes_provider(provider: &ProviderProfile) -> Value {
    let mut entry = Mapping::new();
    entry.insert(text("name"), text(MANAGED_PROVIDER_ID));
    entry.insert(text("base_url"), text(&provider.base_url));
    entry.insert(text("api_key"), text(&provider.api_key));
    entry.insert(
        text("api_mode"),
        text(hermes_api_mode(provider_protocol(provider))),
    );
    entry.insert(
        text("models"),
        Value::Sequence(vec![Value::Mapping({
            let mut model = Mapping::new();
            model.insert(text("id"), text(&provider.model));
            model.insert(text("name"), text(&provider.model));
            model.insert(
                text("context_length"),
                Value::Number(provider_context_window(provider).into()),
            );
            model
        })]),
    );
    Value::Mapping(entry)
}

fn hermes_api_mode(protocol: ProviderProtocol) -> &'static str {
    match protocol {
        ProviderProtocol::Anthropic => "anthropic_messages",
        ProviderProtocol::OpenaiResponses => "codex_responses",
        ProviderProtocol::OpenaiChat => "chat_completions",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::third_party_apps::tests::provider;

    #[test]
    fn hermes_update_keeps_existing_custom_providers() {
        let mut config = serde_yaml::from_str("custom_providers:\n  - name: keep\n").unwrap();
        let provider = provider();
        update_hermes_config(&mut config, Some(&provider)).unwrap();
        assert_eq!(config["custom_providers"][0]["name"], "keep");
        assert_eq!(config["model"]["provider"], MANAGED_PROVIDER_ID);
    }

    #[test]
    fn hermes_clear_removes_only_the_managed_model_selection() {
        let mut config = serde_yaml::from_str(
            "custom_providers:\n  - name: keep\nmodel:\n  provider: codex-switch\n  default: test-model\n",
        )
        .unwrap();
        update_hermes_config(&mut config, None).unwrap();
        assert!(config.get("model").is_none());
        assert_eq!(config["custom_providers"][0]["name"], "keep");
    }
}
