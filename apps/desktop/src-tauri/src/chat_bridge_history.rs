//! Restore conversation history without sharing it between providers or sessions.

use super::ContinuationScope;
use serde_json::{json, Value};
use std::{
    collections::{HashSet, VecDeque},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const MAX_ENTRIES: usize = 512;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_ID_BYTES: usize = 1024;
const TTL: Duration = Duration::from_secs(30 * 60);

struct Entry {
    scope: ContinuationScope,
    response_id: String,
    request_history: Vec<Value>,
    message: Value,
    bytes: usize,
    expires: Instant,
}

fn store() -> &'static Mutex<VecDeque<Entry>> {
    static STORE: OnceLock<Mutex<VecDeque<Entry>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(VecDeque::new()))
}

pub(crate) fn capture_response(
    scope: &ContinuationScope,
    response_id: &str,
    message: &Value,
    request_history: &[Value],
) {
    if response_id.is_empty() || response_id.len() > MAX_ID_BYTES {
        return;
    }
    let bytes = message.to_string().len()
        + response_id.len()
        + request_history
            .iter()
            .map(|message| message.to_string().len())
            .sum::<usize>();
    if bytes > MAX_BYTES {
        return;
    }
    let Ok(mut entries) = store().lock() else {
        return;
    };
    let now = Instant::now();
    entries.retain(|entry| {
        entry.expires > now && !(entry.scope == *scope && entry.response_id == response_id)
    });
    let mut message = message.clone();
    message["role"] = json!("assistant");
    entries.push_back(Entry {
        scope: scope.clone(),
        response_id: response_id.into(),
        request_history: request_history.to_vec(),
        message,
        bytes,
        expires: now + TTL,
    });
    prune(&mut entries, now);
}

fn prune(entries: &mut VecDeque<Entry>, now: Instant) {
    entries.retain(|entry| entry.expires > now);
    while entries.len() > MAX_ENTRIES
        || entries.iter().map(|entry| entry.bytes).sum::<usize>() > MAX_BYTES
    {
        entries.pop_front();
    }
}

pub(crate) fn restore_tool_history(
    scope: Option<&ContinuationScope>,
    previous_response_id: Option<&str>,
    body: &mut Value,
) -> Result<(), String> {
    let Some(messages) = body["messages"].as_array_mut() else {
        return Ok(());
    };
    let missing = "The previous conversation is unavailable. Resend the conversation history or start a new conversation.";
    let previous = if let Some(response) = previous_response_id {
        let scope = scope.ok_or(missing)?;
        let mut entries = store()
            .lock()
            .map_err(|_| "Conversation history is temporarily unavailable")?;
        prune(&mut entries, Instant::now());
        let entry = entries
            .iter()
            .find(|entry| entry.scope == *scope && entry.response_id == response)
            .ok_or(missing)?;
        let mut history = entry.request_history.clone();
        history.push(entry.message.clone());
        Some(history)
    } else {
        None
    };
    restore_declarations(scope, previous_response_id, messages)?;
    if let Some(previous) = previous {
        merge_previous(previous, messages);
    }
    Ok(())
}

fn restore_declarations(
    scope: Option<&ContinuationScope>,
    previous_response_id: Option<&str>,
    messages: &mut Vec<Value>,
) -> Result<(), String> {
    let requested = messages
        .iter()
        .filter(|message| message["role"] == "tool")
        .filter_map(|message| message["tool_call_id"].as_str().map(str::to_string))
        .collect::<HashSet<_>>();
    let mut declared = messages.iter().flat_map(call_ids).collect::<HashSet<_>>();
    if requested.is_subset(&declared) {
        return Ok(());
    }
    let missing = "The previous tool call is unavailable. Resend the conversation history or start a new conversation.";
    let scope = scope.ok_or(missing)?;
    let mut entries = store()
        .lock()
        .map_err(|_| "Conversation history is temporarily unavailable")?;
    prune(&mut entries, Instant::now());
    let mut restored = Vec::new();
    for message in messages.iter() {
        if let Some(id) = message["tool_call_id"]
            .as_str()
            .filter(|id| !declared.contains(*id))
        {
            let mut original = lookup(&entries, scope, previous_response_id, id).ok_or(missing)?;
            original["tool_calls"]
                .as_array_mut()
                .ok_or(missing)?
                .retain(|call| {
                    call["id"]
                        .as_str()
                        .is_some_and(|id| requested.contains(id) && !declared.contains(id))
                });
            declared.extend(call_ids(&original));
            restored.push(original);
        }
        restored.push(message.clone());
    }
    *messages = restored;
    Ok(())
}

fn merge_previous(previous: Vec<Value>, messages: &mut Vec<Value>) {
    let prior_instructions = instruction_count(&previous);
    let current_instructions = instruction_count(messages);
    let instructions = if current_instructions > 0 {
        &messages[..current_instructions]
    } else {
        &previous[..prior_instructions]
    };
    let prior = &previous[prior_instructions..];
    let current = &messages[current_instructions..];
    // Full-history clients may already include all or a suffix of the previous turn.
    let overlap = history_overlap(prior, current);
    *messages = instructions
        .iter()
        .chain(&prior[..prior.len() - overlap])
        .chain(current)
        .cloned()
        .collect();
}

fn instruction_count(messages: &[Value]) -> usize {
    messages
        .iter()
        .take_while(|message| matches!(message["role"].as_str(), Some("system" | "developer")))
        .count()
}

fn same_message(left: &Value, right: &Value) -> bool {
    if left["role"] != right["role"] || left["tool_call_id"] != right["tool_call_id"] {
        return false;
    }
    if message_content(left) != message_content(right) {
        return false;
    }
    let left = left["tool_calls"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let right = right["tool_calls"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(left, right)| left["id"] == right["id"] && left["function"] == right["function"])
}

fn message_content(value: &Value) -> Option<&Value> {
    value
        .get("content")
        .filter(|content| !content.is_null() && content.as_str() != Some(""))
}

fn history_overlap(prior: &[Value], current: &[Value]) -> usize {
    if current.is_empty() {
        return 0;
    }
    // Prefix matching keeps repeated long conversations linear in the number of messages.
    let mut prefix = vec![0; current.len()];
    for index in 1..current.len() {
        let mut matched = prefix[index - 1];
        while matched > 0 && !same_message(&current[index], &current[matched]) {
            matched = prefix[matched - 1];
        }
        prefix[index] = matched + usize::from(same_message(&current[index], &current[matched]));
    }
    let mut matched = 0;
    for message in prior {
        if matched == current.len() {
            matched = prefix[matched - 1];
        }
        while matched > 0 && !same_message(message, &current[matched]) {
            matched = prefix[matched - 1];
        }
        matched += usize::from(same_message(message, &current[matched]));
    }
    matched
}

fn lookup(
    entries: &VecDeque<Entry>,
    scope: &ContinuationScope,
    response: Option<&str>,
    id: &str,
) -> Option<Value> {
    let mut matching = entries.iter().filter(|entry| {
        entry.scope == *scope
            && response.is_none_or(|response| entry.response_id == response)
            && call_ids(&entry.message)
                .iter()
                .any(|candidate| candidate == id)
    });
    let first = matching.next()?;
    // Reused call IDs without a response cursor must never pick an arbitrary earlier request.
    matching.next().is_none().then(|| first.message.clone())
}

fn call_ids(message: &Value) -> Vec<String> {
    message["tool_calls"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|call| call["id"].as_str().map(str::to_string))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_eviction_enforces_expiry_and_both_memory_bounds() {
        let now = Instant::now();
        let entry = |id: usize, bytes: usize, expires: Instant| Entry {
            scope: ContinuationScope::new("bounded", "session"),
            response_id: id.to_string(),
            request_history: Vec::new(),
            message: json!({}),
            bytes,
            expires,
        };
        let mut entries = VecDeque::from([
            entry(0, 1, now),
            entry(1, MAX_BYTES, now + TTL),
            entry(2, 1, now + TTL),
        ]);
        prune(&mut entries, now);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].response_id, "2");
        entries = (0..=MAX_ENTRIES)
            .map(|id| entry(id, 1, now + TTL))
            .collect();
        prune(&mut entries, now);
        assert_eq!(entries.len(), MAX_ENTRIES);
        assert_eq!(entries[0].response_id, "1");
    }

    #[test]
    fn ambiguous_call_ids_need_an_explicit_response_cursor_and_missing_scopes_are_rejected() {
        let scope = ContinuationScope::new("ambiguous-provider", "session");
        for response in ["first", "second"] {
            capture_response(
                &scope,
                response,
                &json!({"tool_calls":[{"id":"reused",
                "function":{"name":"read", "arguments":format!("{{\"path\":\"{response}\"}}")}}]}),
                &[],
            );
        }
        let mut body =
            json!({"messages":[{"role":"tool", "tool_call_id":"reused", "content":"ok"}]});
        assert!(restore_tool_history(Some(&scope), None, &mut body).is_err());
        assert!(restore_tool_history(None, Some("first"), &mut body).is_err());
        restore_tool_history(Some(&scope), Some("first"), &mut body).unwrap();
        assert!(
            body["messages"][0]["tool_calls"][0]["function"]["arguments"]
                .as_str()
                .unwrap()
                .contains("first")
        );
        let before = body.clone();
        restore_tool_history(Some(&scope), Some("first"), &mut body).unwrap();
        assert_eq!(body, before);
    }

    #[test]
    fn restores_parallel_calls_with_metadata_and_rejects_other_scopes() {
        let scope = ContinuationScope::new("history-provider", "history-session");
        capture_response(
            &scope,
            "response",
            &json!({ "reasoning_content": "plan", "tool_calls": [
                {"id":"one", "type":"function", "function":{"name":"read", "arguments":"{}"}},
                {"id":"two", "type":"function", "function":{"name":"list", "arguments":"{}"}}
            ]}),
            &[],
        );
        let mut body = json!({"messages":[{"role":"tool", "tool_call_id":"one", "content":"1"},
            {"role":"tool", "tool_call_id":"two", "content":"2"}]});
        let mut foreign = body.clone();
        assert!(restore_tool_history(
            Some(&ContinuationScope::new("other", "history-session")),
            Some("response"),
            &mut foreign
        )
        .is_err());
        assert!(restore_tool_history(Some(&scope), Some("wrong"), &mut foreign).is_err());
        restore_tool_history(Some(&scope), Some("response"), &mut body).unwrap();
        assert_eq!(
            body["messages"][0]["tool_calls"].as_array().unwrap().len(),
            2
        );
        assert_eq!(body["messages"][0]["reasoning_content"], "plan");
        assert_eq!(body["messages"].as_array().unwrap().len(), 3);
    }
}

#[cfg(test)]
#[path = "chat_bridge_history_tests.rs"]
mod chain_tests;
