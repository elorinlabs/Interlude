use serde_json::{json, Map, Value};

use crate::models::ProviderProfile;

mod profiles;
use profiles::{Dialect, Profile, Switch};

#[cfg(test)]
mod tests;

/// Translate reasoning controls only when the upstream's parameter contract is known.
pub(super) fn apply(body: &Value, chat: &mut Value, provider: &ProviderProfile) {
    let Some(dialect) = Dialect::from_base_url(&provider.base_url) else {
        return;
    };
    if dialect == Dialect::OpenRouter {
        apply_router(body, chat);
        return;
    }
    let model = chat
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or(&provider.model)
        .trim()
        .to_ascii_lowercase();
    let Some(profile) = profiles::for_model(dialect, &model) else {
        return;
    };
    apply_profile(body, chat, profile);
}

fn requested_effort<'a>(body: &'a Value, chat: &'a Value) -> Option<&'a str> {
    body.pointer("/reasoning/effort")
        .or_else(|| body.get("reasoning_effort"))
        .or_else(|| chat.get("reasoning_effort"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|effort| !effort.is_empty())
}

fn apply_profile(body: &Value, chat: &mut Value, profile: Profile) {
    let effort = requested_effort(body, chat).map(str::to_ascii_lowercase);
    let Some(chat) = chat.as_object_mut() else {
        return;
    };
    copy_native_options(body, chat, profile.switch);
    if profile.switch == Switch::Split {
        // Separating reasoning is an output format choice; M2 models always think.
        chat.entry("reasoning_split").or_insert(json!(true));
    }
    let Some(effort) = effort else {
        return;
    };
    let enabled = profile.always_thinks || effort != "none";
    set_switch(chat, profile.switch, enabled);
    chat.remove("reasoning_effort");
    if !enabled || explicitly_disabled(chat, profile.switch) {
        return;
    }
    if matches!(profile.effort, profiles::EffortRule::Qwen) && chat.contains_key("thinking_budget")
    {
        // Qwen rejects requests that combine the token budget and effort controls.
        return;
    }
    if let Some(mapped) = profile.effort.map(&effort) {
        chat.insert("reasoning_effort".to_string(), json!(mapped));
    }
}

fn copy_native_options(body: &Value, chat: &mut Map<String, Value>, switch: Switch) {
    let keys: &[&str] = match switch {
        Switch::Thinking => &["thinking"],
        Switch::Enabled => &["enable_thinking", "thinking_budget"],
        Switch::Split => &["reasoning_split"],
    };
    for key in keys {
        if let Some(value) = body.get(key) {
            chat.entry((*key).to_string())
                .or_insert_with(|| value.clone());
        }
    }
}

fn set_switch(chat: &mut Map<String, Value>, switch: Switch, enabled: bool) {
    match switch {
        Switch::Enabled => {
            chat.entry("enable_thinking").or_insert(json!(enabled));
        }
        Switch::Thinking => {
            let thinking = chat.entry("thinking").or_insert_with(|| json!({}));
            if let Some(thinking) = thinking.as_object_mut() {
                let kind = if enabled { "enabled" } else { "disabled" };
                thinking.entry("type").or_insert(json!(kind));
            }
        }
        Switch::Split => {}
    }
}

fn explicitly_disabled(chat: &Map<String, Value>, switch: Switch) -> bool {
    match switch {
        Switch::Enabled => chat.get("enable_thinking").and_then(Value::as_bool) == Some(false),
        Switch::Thinking => {
            chat.get("thinking")
                .and_then(|value| value.get("type"))
                .and_then(Value::as_str)
                == Some("disabled")
        }
        Switch::Split => false,
    }
}

fn apply_router(body: &Value, chat: &mut Value) {
    let effort = requested_effort(body, chat).map(str::to_string);
    let Some(chat) = chat.as_object_mut() else {
        return;
    };
    let mut reasoning = Map::new();
    if let Some(existing) = body.get("reasoning").and_then(Value::as_object) {
        for key in ["enabled", "exclude", "max_tokens", "context", "mode"] {
            if let Some(value) = existing.get(key) {
                reasoning.insert(key.to_string(), value.clone());
            }
        }
    }
    if let Some(existing) = chat.get("reasoning").and_then(Value::as_object) {
        reasoning.extend(existing.clone());
    }
    if !reasoning.contains_key("max_tokens") && reasoning.get("enabled") != Some(&json!(false)) {
        if let Some(effort) = effort {
            reasoning.entry("effort").or_insert(json!(effort));
        }
    }
    if !reasoning.is_empty() {
        chat.insert("reasoning".to_string(), Value::Object(reasoning));
        chat.remove("reasoning_effort");
    }
}

#[cfg(test)]
pub(super) fn apply_deepseek(body: &Value, chat: &mut Value) {
    apply_profile(
        body,
        chat,
        Profile {
            switch: Switch::Thinking,
            effort: profiles::EffortRule::DeepSeek,
            always_thinks: false,
        },
    );
}
