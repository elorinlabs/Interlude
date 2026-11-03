//! Bounded native history isolated by provider, endpoint, model and session.
use super::{continuation::Scope, BridgeError, Context};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

const MAX_ENTRIES: usize = 128;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone)]
pub(super) struct Snapshot {
    pub(super) contents: Vec<Value>,
    pub(super) system: Vec<Value>,
    pub(super) calls: HashMap<String, String>,
    pub(super) tools: super::CodexToolContext,
}

struct Entry {
    scope: Scope,
    response_id: String,
    snapshot: Snapshot,
    expires: Instant,
    bytes: usize,
}

fn store() -> &'static Mutex<VecDeque<Entry>> {
    static STORE: OnceLock<Mutex<VecDeque<Entry>>> = OnceLock::new();
    STORE.get_or_init(Mutex::default)
}

pub(super) fn restore(
    input: &Value,
    scope: Option<&Scope>,
) -> Result<Option<Snapshot>, BridgeError> {
    let previous = input["previous_response_id"]
        .as_str()
        .filter(|id| !id.is_empty());
    let missing = missing_calls(input);
    if previous.is_none() && missing.is_empty() {
        return Ok(None);
    }
    let scope = scope.ok_or(BridgeError::MissingHistory)?;
    let mut entries = store().lock().map_err(|_| BridgeError::MissingHistory)?;
    entries.retain(|entry| entry.expires > Instant::now());
    let mut matching = entries.iter().filter(|entry| {
        entry.scope == *scope
            && previous.is_none_or(|id| entry.response_id == id)
            && missing
                .iter()
                .all(|id| entry.snapshot.calls.contains_key(id))
    });
    let found = matching.next().ok_or(BridgeError::MissingHistory)?;
    if matching.next().is_some() {
        return Err(BridgeError::MissingHistory);
    }
    Ok(Some(found.snapshot.clone()))
}

fn missing_calls(input: &Value) -> HashSet<String> {
    let items = input["input"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let declared = items
        .iter()
        .filter(|item| {
            matches!(
                item["type"].as_str(),
                Some("function_call" | "custom_tool_call" | "tool_search_call")
            )
        })
        .filter_map(|item| item["call_id"].as_str())
        .collect::<HashSet<_>>();
    items
        .iter()
        .filter(|item| {
            matches!(
                item["type"].as_str(),
                Some("function_call_output" | "custom_tool_call_output" | "tool_search_output")
            )
        })
        .filter_map(|item| item["call_id"].as_str())
        .filter(|id| !declared.contains(id))
        .map(str::to_string)
        .collect()
}

pub(super) fn merge_contents(previous: &[Value], incoming: Vec<Value>) -> Vec<Value> {
    merge_overlapping(previous, incoming, comparable_content)
}

pub(super) fn merge_system(previous: &[Value], incoming: Vec<Value>) -> Vec<Value> {
    merge_overlapping(previous, incoming, Value::clone)
}

fn merge_overlapping(
    previous: &[Value],
    incoming: Vec<Value>,
    key: fn(&Value) -> Value,
) -> Vec<Value> {
    let overlap = (1..=previous.len().min(incoming.len()))
        .rev()
        .find(|count| {
            previous[previous.len() - count..]
                .iter()
                .zip(&incoming[..*count])
                .all(|(old, new)| key(old) == key(new))
        })
        .unwrap_or(0);
    let mut result = previous.to_vec();
    result.extend(incoming.into_iter().skip(overlap));
    result
}

fn comparable_content(content: &Value) -> Value {
    let parts = content["parts"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let text = parts
        .iter()
        .filter(|part| part["thought"] != true)
        .filter_map(|part| part["text"].as_str())
        .collect::<String>();
    let calls = parts
        .iter()
        .filter_map(|part| part.get("functionCall"))
        .map(|call| {
            let mut call = call.clone();
            if call.get("args").is_none() {
                call["args"] = json!({});
            }
            call
        })
        .collect::<Vec<_>>();
    let media = parts
        .iter()
        .filter(|part| {
            part.get("inlineData").is_some()
                || part.get("fileData").is_some()
                || part.get("functionResponse").is_some()
        })
        .collect::<Vec<_>>();
    json!({"role":content["role"],"text":text,"calls":calls,"media":media})
}

#[derive(Clone)]
pub(super) struct Pending {
    scope: Scope,
    snapshot: Snapshot,
    response_id: Arc<OnceLock<String>>,
}

impl Pending {
    pub(super) fn new(context: &Context, body: &Value) -> Option<Self> {
        Some(Self {
            scope: context.scope.clone()?,
            snapshot: Snapshot {
                contents: body["contents"].as_array().cloned().unwrap_or_default(),
                system: body["systemInstruction"]["parts"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                calls: HashMap::new(),
                tools: context.tools.clone(),
            },
            response_id: Arc::new(OnceLock::new()),
        })
    }

    pub(super) fn bind(&self, id: &str) {
        // The ID is bound once before the native stream is read.
        if self.response_id.set(id.into()).is_err() {
            debug_assert_eq!(self.response_id.get().map(String::as_str), Some(id));
        }
    }

    pub(super) fn capture(&self, parts: &[Value], calls: &[Value]) {
        let Some(id) = self.response_id.get() else {
            return;
        };
        let mut snapshot = self.snapshot.clone();
        if !parts.is_empty() {
            snapshot
                .contents
                .push(json!({"role":"model","parts":parts}));
        }
        for call in calls {
            if let (Some(id), Some(name)) = (call["id"].as_str(), call["function"]["name"].as_str())
            {
                snapshot.calls.insert(id.into(), name.into());
            }
        }
        let bytes = serde_json::to_vec(&snapshot.contents)
            .map(|data| data.len())
            .unwrap_or(MAX_BYTES)
            .saturating_add(
                serde_json::to_vec(&snapshot.system)
                    .map(|data| data.len())
                    .unwrap_or(MAX_BYTES),
            )
            .saturating_add(
                serde_json::to_vec(snapshot.tools.chat_tools())
                    .map(|data| data.len())
                    .unwrap_or(MAX_BYTES),
            )
            .saturating_add(
                snapshot
                    .calls
                    .iter()
                    .map(|(id, name)| id.len() + name.len())
                    .sum::<usize>(),
            );
        if bytes > MAX_BYTES {
            return;
        }
        // Optional history must not prevent delivery when a cache lock is poisoned.
        let Ok(mut entries) = store().lock() else {
            return;
        };
        let now = Instant::now();
        entries.retain(|entry| {
            entry.expires > now && !(entry.scope == self.scope && entry.response_id == *id)
        });
        entries.push_back(Entry {
            scope: self.scope.clone(),
            response_id: id.clone(),
            snapshot,
            bytes,
            expires: now + TTL,
        });
        while entries.len() > MAX_ENTRIES
            || entries.iter().map(|entry| entry.bytes).sum::<usize>() > MAX_BYTES
        {
            entries.pop_front();
        }
    }
}
