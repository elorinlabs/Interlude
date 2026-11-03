use serde_json::Value;

const MAX_REASONING_DETAILS_BYTES: usize = 4 * 1024 * 1024;

pub(super) fn message_text(message: &Value) -> Option<String> {
    let explicit = ["reasoning_content", "reasoning"]
        .into_iter()
        .find_map(|key| {
            message
                .get(key)
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
        });
    if let Some(text) = explicit {
        return Some(text.to_string());
    }
    let details = message.get("reasoning_details")?.as_array()?;
    let text = details.iter().filter_map(detail_text).collect::<String>();
    (!text.is_empty()).then_some(text)
}

fn detail_text(detail: &Value) -> Option<&str> {
    let field = match detail.get("type").and_then(Value::as_str)? {
        "reasoning.text" => "text",
        "reasoning.summary" => "summary",
        // Opaque data and future extensions must not be interpreted as visible reasoning.
        _ => return None,
    };
    detail.get(field)?.as_str()
}

#[derive(Default)]
pub(super) struct ReasoningDetails {
    items: Vec<Value>,
    bytes: usize,
    overflowed: bool,
}

impl ReasoningDetails {
    pub(super) fn observe(&mut self, message: &Value) {
        let Some(details) = message.get("reasoning_details").and_then(Value::as_array) else {
            return;
        };
        if self.overflowed {
            return;
        }
        self.bytes = self.bytes.saturating_add(
            details
                .iter()
                .map(|item| item.to_string().len())
                .sum::<usize>(),
        );
        if self.bytes > MAX_REASONING_DETAILS_BYTES {
            // An incomplete opaque sequence is unsafe to replay; discard the entire cached sequence.
            self.items.clear();
            self.overflowed = true;
            return;
        }
        for detail in details {
            let previous = if has_identity(detail) {
                self.items
                    .iter_mut()
                    .rev()
                    .find(|previous| can_merge(previous, detail))
            } else {
                self.items
                    .last_mut()
                    .filter(|previous| can_merge(previous, detail))
            };
            if let Some(previous) = previous {
                merge_text_detail(previous, detail);
            } else {
                self.items.push(detail.clone());
            }
        }
    }

    pub(super) fn value(&self) -> Option<Value> {
        (!self.items.is_empty()).then(|| Value::Array(self.items.clone()))
    }

    pub(super) fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

fn can_merge(previous: &Value, next: &Value) -> bool {
    if previous.get("type") != next.get("type")
        || !matches!(
            next.get("type").and_then(Value::as_str),
            Some("reasoning.text" | "reasoning.summary")
        )
    {
        return false;
    }
    let same_identity = ["id", "index"].iter().any(|key| {
        next.get(*key)
            .is_some_and(|value| !value.is_null() && Some(value) == previous.get(*key))
    });
    if !same_identity && (has_identity(previous) || has_identity(next)) {
        return false;
    }
    let Some(fields) = next.as_object() else {
        return false;
    };
    fields.iter().all(|(key, value)| {
        if matches!(key.as_str(), "text" | "summary" | "signature") {
            return (value.is_null() || value.is_string())
                && previous
                    .get(key)
                    .is_none_or(|old| old.is_null() || old.is_string());
        }
        previous
            .get(key)
            .is_none_or(|old| old.is_null() || old == value)
    })
}

fn has_identity(detail: &Value) -> bool {
    ["id", "index"]
        .iter()
        .any(|key| detail.get(*key).is_some_and(|value| !value.is_null()))
}

fn merge_text_detail(previous: &mut Value, next: &Value) {
    let (Some(previous), Some(next)) = (previous.as_object_mut(), next.as_object()) else {
        return;
    };
    for (key, value) in next {
        if matches!(key.as_str(), "text" | "summary" | "signature") {
            if let (Some(Value::String(old)), Some(delta)) = (previous.get_mut(key), value.as_str())
            {
                old.push_str(delta);
                continue;
            }
        }
        if !value.is_null() || !previous.contains_key(key) {
            previous.insert(key.clone(), value.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reasoning_details_join_known_text_without_exposing_opaque_extensions() {
        let message = json!({ "reasoning_details": [
            { "type": "reasoning.text", "text": "plan" },
            { "type": "reasoning.summary", "summary": " summary" },
            { "type": "reasoning.encrypted", "data": "secret" },
            { "type": "future.type", "text": "private" }
        ] });
        assert_eq!(message_text(&message).as_deref(), Some("plan summary"));
        let mut duplicated = message;
        duplicated["reasoning_content"] = json!("canonical");
        assert_eq!(message_text(&duplicated).as_deref(), Some("canonical"));
    }

    #[test]
    fn detail_stream_joins_identified_text_and_preserves_unknown_and_encrypted_items() {
        let mut details = ReasoningDetails::default();
        details.observe(&json!({ "reasoning_details": [
            { "type": "reasoning.text", "index": 0, "text": "one", "signature": null },
            { "type": "future", "data": { "blob": 1 } }
        ] }));
        details.observe(&json!({ "reasoning_details": [
            { "type": "reasoning.text", "index": 0, "text": " two", "signature": "sig" },
            { "type": "reasoning.encrypted", "index": 1, "data": "opaque" },
            { "type": "reasoning.encrypted", "index": 1, "data": "other" }
        ] }));
        let value = details.value().unwrap();
        assert_eq!(value[0]["text"], "one two");
        assert_eq!(value[0]["signature"], "sig");
        assert_eq!(value[1], json!({ "type": "future", "data": { "blob": 1 } }));
        assert_eq!(value.as_array().unwrap().len(), 4);
    }

    #[test]
    fn detail_stream_joins_signature_only_chunks_and_adjacent_unindexed_text() {
        let mut details = ReasoningDetails::default();
        for detail in [
            json!({ "type": "reasoning.text", "id": "first", "text": "thought" }),
            json!({ "type": "reasoning.text", "id": "first", "signature": "proof" }),
            json!({ "type": "reasoning.summary", "summary": "short" }),
            json!({ "type": "reasoning.summary", "summary": " summary" }),
            json!({ "type": "future", "summary": "opaque" }),
            json!({ "type": "reasoning.summary", "summary": "separate" }),
        ] {
            details.observe(&json!({ "reasoning_details": [detail] }));
        }
        let value = details.value().unwrap();
        assert_eq!(value[0]["signature"], "proof");
        assert_eq!(value[1]["summary"], "short summary");
        assert_eq!(value[3]["summary"], "separate");
        assert_eq!(value.as_array().unwrap().len(), 4);
    }
}
