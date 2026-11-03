use super::*;

/// Preserve opaque upstream reasoning only in the originating provider/session scope.
pub(crate) fn capture_reasoning_details(scope: &ContinuationScope, item_id: &str, details: &Value) {
    let Some(details) = bounded_details(Some(details)) else {
        return;
    };
    if item_id.len() > MAX_SIGNATURE_BYTES {
        return;
    }
    // Match the existing best-effort continuation cache behavior on lock poisoning.
    let Ok(mut store) = continuation_store().lock() else {
        return;
    };
    let now = Instant::now();
    store.remove_expired(now);
    store.next_sequence = store.next_sequence.wrapping_add(1);
    let sequence = store.next_sequence;
    let key = ContinuationKey {
        scope: scope.clone(),
        reference: ContinuationReference::ReasoningItem(item_id.to_string()),
    };
    let entry = store
        .entries
        .entry(key)
        .or_insert_with(|| ContinuationEntry {
            reasoning_content: None,
            reasoning_details: None,
            thought_signature: None,
            expires_at: now + CONTINUATION_TTL,
            sequence,
            bytes: item_id.len(),
        });
    entry.reasoning_details = Some(details.clone());
    entry.bytes = entry_bytes(item_id, &entry.reasoning_content, &entry.thought_signature)
        + details.to_string().len();
    entry.expires_at = now + CONTINUATION_TTL;
    entry.sequence = sequence;
    store.enforce_limits();
}

pub(crate) fn reasoning_details_for_item(
    scope: &ContinuationScope,
    item_id: &str,
) -> Option<Value> {
    let mut store = continuation_store().lock().ok()?;
    store.remove_expired(Instant::now());
    let key = ContinuationKey {
        scope: scope.clone(),
        reference: ContinuationReference::ReasoningItem(item_id.to_string()),
    };
    store
        .entries
        .get(&key)?
        .reasoning_details
        .as_ref()
        .map(|details| details.as_ref().clone())
}

pub(super) fn bounded_details(value: Option<&Value>) -> Option<Arc<Value>> {
    let value = value?;
    if value.as_array()?.is_empty() || value.to_string().len() > MAX_REASONING_BYTES {
        return None;
    }
    Some(Arc::new(value.clone()))
}

pub(super) fn restore_details(message: &mut Value, continuations: &[Option<ContinuationEntry>]) {
    if message.get("reasoning_details").is_some() {
        return;
    }
    let details = continuations
        .iter()
        .filter_map(Option::as_ref)
        .find_map(|entry| entry.reasoning_details.as_ref());
    if let Some(details) = details {
        message["reasoning_details"] = details.as_ref().clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn opaque_reasoning_stays_scoped_and_restores_for_item_and_tool_call() {
        let session = uuid::Uuid::new_v4().to_string();
        let scope = ContinuationScope::new("source", &session);
        let foreign = ContinuationScope::new("foreign", &session);
        let details = json!([{ "type": "reasoning.encrypted", "data": "opaque", "future": { "version": 2 } }]);
        capture_reasoning(&scope, "reason", "summary");
        capture_reasoning_details(&scope, "reason", &details);
        assert_eq!(
            reasoning_details_for_item(&scope, "reason"),
            Some(details.clone())
        );
        assert_eq!(
            reasoning_for_item(&scope, "reason").as_deref(),
            Some("summary")
        );
        assert!(reasoning_details_for_item(&foreign, "reason").is_none());
        capture_message(
            &scope,
            &json!({ "reasoning_details": details, "tool_calls": [{ "id": "call" }] }),
        );
        let mut messages = vec![json!({ "role": "assistant", "tool_calls": [{ "id": "call" }] })];
        restore_messages(&foreign, &mut messages);
        assert!(messages[0].get("reasoning_details").is_none());
        restore_messages(&scope, &mut messages);
        assert_eq!(messages[0]["reasoning_details"], details);
    }
}
