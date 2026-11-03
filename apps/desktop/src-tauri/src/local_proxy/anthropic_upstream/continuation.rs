//! Signed thinking blocks remain in memory and are replayed only for identical tool turns.

use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use serde_json::{json, Value};

use crate::models::ProviderProfile;

const MAX_ENTRIES: usize = 128;
const MAX_BYTES: usize = 16 * 1024 * 1024;
const TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Scope {
    provider: String,
    endpoint: String,
    model: String,
    session: Option<String>,
}

impl Scope {
    pub(super) fn new(
        provider: &ProviderProfile,
        headers: &[(String, String)],
        model: &str,
    ) -> Self {
        Self {
            provider: provider.id.clone(),
            endpoint: provider.base_url.clone(),
            model: model.to_string(),
            session: super::super::proxy_session_id(headers).filter(|session| {
                !session.trim().is_empty()
                    && session.len() <= super::super::MAX_CONTINUATION_SCOPE_ID_BYTES
                    && !session.chars().any(char::is_control)
            }),
        }
    }

    #[cfg(test)]
    pub(super) fn fixture(session: &str) -> Self {
        Self {
            provider: "fixture".into(),
            endpoint: "fixture".into(),
            model: "claude".into(),
            session: (!session.is_empty()).then(|| session.into()),
        }
    }
}

struct Entry {
    scope: Scope,
    fingerprint: Value,
    content: Vec<Value>,
    expires: Instant,
    bytes: usize,
}

#[derive(Default)]
struct Store {
    entries: VecDeque<Entry>,
    bytes: usize,
}

fn store() -> &'static Mutex<Store> {
    static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
    STORE.get_or_init(Mutex::default)
}

pub(super) fn capture(scope: &Scope, content: &[Value]) {
    if scope.session.is_none() {
        return;
    }
    if !content.iter().any(|block| {
        matches!(
            block["type"].as_str(),
            Some("thinking" | "redacted_thinking")
        )
    }) {
        return;
    }
    let Some(fingerprint) = fingerprint(content) else {
        return;
    };
    let bytes = content
        .iter()
        .map(|block| block.to_string().len())
        .sum::<usize>()
        .saturating_add(fingerprint.to_string().len());
    if bytes > MAX_BYTES {
        return;
    }
    // This optional cache must never prevent a successfully completed response from being delivered.
    let Ok(mut store) = store().lock() else {
        return;
    };
    store.prune(Instant::now());
    store.entries.push_back(Entry {
        scope: scope.clone(),
        fingerprint,
        content: content.to_vec(),
        expires: Instant::now() + TTL,
        bytes,
    });
    store.bytes = store.bytes.saturating_add(bytes);
    while store.entries.len() > MAX_ENTRIES || store.bytes > MAX_BYTES {
        store.remove_oldest();
    }
}

pub(super) fn restore(scope: &Scope, content: &mut Vec<Value>) {
    if scope.session.is_none() {
        return;
    }
    let Some(fingerprint) = fingerprint(content) else {
        return;
    };
    // A missing or expired cache entry simply leaves unsigned history unchanged.
    let Ok(mut store) = store().lock() else {
        return;
    };
    store.prune(Instant::now());
    if let Some(entry) = store
        .entries
        .iter()
        .rev()
        .find(|entry| entry.scope == *scope && entry.fingerprint == fingerprint)
    {
        *content = entry.content.clone();
    }
}

fn fingerprint(content: &[Value]) -> Option<Value> {
    let calls = content
        .iter()
        .filter(|block| block["type"] == "tool_use")
        .map(|block| json!({ "id": block["id"], "name": block["name"], "input": block["input"] }))
        .collect::<Vec<_>>();
    if calls.is_empty() {
        return None;
    }
    let text = content
        .iter()
        .filter(|block| block["type"] == "text")
        .filter_map(|block| block["text"].as_str())
        .collect::<String>();
    Some(json!({ "text": text, "calls": calls }))
}

impl Store {
    fn prune(&mut self, now: Instant) {
        while self
            .entries
            .front()
            .is_some_and(|entry| entry.expires <= now)
        {
            self.remove_oldest();
        }
    }

    fn remove_oldest(&mut self) {
        if let Some(entry) = self.entries.pop_front() {
            self.bytes = self.bytes.saturating_sub(entry.bytes);
        }
    }
}
