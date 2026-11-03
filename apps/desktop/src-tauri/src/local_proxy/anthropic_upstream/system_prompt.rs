use std::sync::atomic::Ordering;

use serde_json::{json, Value};

pub(super) fn prepare(body: Value) -> Value {
    let mut body = super::super::filter_system_prompt_value(body);
    if super::super::SYSTEM_PROMPT_INJECTION_ENABLED.load(Ordering::Relaxed) {
        let prompts = super::super::runtime_system_prompt_injection_prompts();
        let injection = prompts
            .iter()
            .filter(|prompt| prompt.enabled)
            .map(|prompt| prompt.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        inject(&mut body, &injection);
    }
    body
}

fn inject(body: &mut Value, injection: &str) {
    if injection.is_empty() {
        return;
    }
    if let Some(blocks) = body["system"].as_array_mut() {
        blocks.insert(0, json!({ "type": "text", "text": injection }));
    } else {
        let existing = body["system"].as_str().unwrap_or_default();
        body["system"] = json!(if existing.is_empty() {
            injection.to_string()
        } else {
            format!("{injection}\n\n{existing}")
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_prompt_injection_preserves_cache_control_and_message_roles() {
        let original =
            json!({ "type": "text", "text": "Original", "cache_control": { "type": "ephemeral" } });
        let mut body = json!({ "system": [original.clone()], "messages": [{ "role": "user", "content": "Hi" }] });
        inject(&mut body, "Extra instructions");
        assert_eq!(body["system"][1], original);
        assert_eq!(body["system"][0]["text"], "Extra instructions");
        assert_eq!(body["messages"][0]["role"], "user");
        let mut text = json!({ "system": "Original" });
        inject(&mut text, "Extra");
        assert_eq!(text["system"], "Extra\n\nOriginal");
    }
}
