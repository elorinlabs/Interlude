//! Read Codex's own compaction estimate from its structured diagnostics, without polling databases.
mod state;
#[cfg(test)]
mod tests;

use std::{collections::HashMap, path::Path, sync::Arc};

use chrono::Utc;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{ChildStderr, Command},
};

use super::Client;
use crate::codex_gui::protocol::GuiEvent;
use state::{Estimate, Snapshot};

const DIRECTORY: &str = "gui-context-usage";
const MAX_CACHED_THREADS: usize = 256;
const MAX_LOG_BYTES: usize = 64 * 1024;
const MAX_THREAD_ID_BYTES: usize = 200;
#[derive(Default)]
pub(super) struct UsageCache {
    snapshots: HashMap<String, Snapshot>,
    pending: HashMap<String, Estimate>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_THREAD_ID_BYTES
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

pub(super) fn configure(command: &mut Command) {
    // Previously stderr was discarded. Keep it restricted to the two supported engine targets;
    // SQLite logging is independent, and raw diagnostic text is never sent to a UI or remote client.
    command.env("LOG_FORMAT", "json").env(
        "RUST_LOG",
        "off,codex_core::session::turn=trace,codex_core::codex=trace",
    );
}

pub(super) fn tracks(event: &GuiEvent) -> bool {
    matches!(
        event.method.as_str(),
        "thread/tokenUsage/updated"
            | "turn/started"
            | "thread/compacted"
            | "thread/historyChanged"
            | "thread/deleted"
    ) || (event.method == "item/completed" && event.params["item"]["type"] == "contextCompaction")
}

impl Client {
    pub(super) async fn read_context_usage(self: Arc<Self>, stderr: ChildStderr) {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            let line = match lines.next_line().await {
                Ok(Some(line)) => line,
                Ok(None) => break,
                Err(_) => {
                    eprintln!("Codex context diagnostic stream stopped");
                    break;
                }
            };
            if line.len() > MAX_LOG_BYTES {
                continue;
            }
            if let Some(estimate) = state::parse(&line) {
                self.emit_context_estimate(estimate).await;
            }
        }
    }

    async fn emit_context_estimate(&self, estimate: Estimate) {
        let turn_id = estimate.turn_id.clone();
        // stdout and stderr are independent pipes. Serialize updates and publishing so an API
        // usage event cannot overwrite a newer engine estimate, whichever pipe arrives first.
        let mut cache = self.context_usage.lock().await;
        let Some(id) = resolve_thread(&mut cache, &estimate) else {
            return;
        };
        let snapshot = load(&mut cache, &self.home, &id).await;
        if !snapshot.estimate(estimate) {
            return;
        }
        if let Some(usage) = snapshot.usage() {
            let event = usage_event(&id, Some(&turn_id), usage);
            self.publish_event(event.clone());
            crate::local_proxy::gui_context::record_usage(&event.params).await;
        }
        save(&self.home, &id, snapshot).await;
    }

    pub(super) async fn emit_context_usage(&self, mut event: GuiEvent) {
        let Some(id) = event.params["threadId"]
            .as_str()
            .map(str::to_owned)
            .filter(|id| valid_id(id))
        else {
            self.publish_event(event);
            return;
        };
        let mut cache = self.context_usage.lock().await;
        let turn_id = event.params["turnId"]
            .as_str()
            .or_else(|| event.params["turn"]["id"].as_str());
        let pending = turn_id.and_then(|id| cache.pending.remove(id));
        let snapshot = load(&mut cache, &self.home, &id).await;
        update(snapshot, &mut event);
        if let Some(estimate) = pending {
            snapshot.estimate(estimate);
        }
        if event.method == "thread/tokenUsage/updated" {
            if let Some(usage) = snapshot.usage() {
                event.params["tokenUsage"] = usage;
            }
        }
        self.publish_event(event.clone());
        if event.method == "thread/tokenUsage/updated" {
            crate::local_proxy::gui_context::record_usage(&event.params).await;
        }
        save(&self.home, &id, snapshot).await;
    }

    pub(super) async fn restore_context_usage(&self, method: &str, result: &mut Value) {
        if !matches!(method, "thread/read" | "thread/resume") {
            return;
        }
        let Some(id) = result["thread"]["id"]
            .as_str()
            .map(str::to_owned)
            .filter(|id| valid_id(id))
        else {
            return;
        };
        let mut cache = self.context_usage.lock().await;
        if let Some(usage) = load(&mut cache, &self.home, &id).await.usage() {
            result["thread"]["tokenUsage"] = usage;
        }
    }
}

fn resolve_thread(cache: &mut UsageCache, estimate: &Estimate) -> Option<String> {
    let id = estimate.thread_id.clone().or_else(|| {
        cache
            .snapshots
            .iter()
            .find(|(_, snapshot)| snapshot.turn_id() == Some(&estimate.turn_id))
            .map(|(id, _)| id.clone())
    });
    if id.is_none() {
        // Narrow diagnostics filters can omit parent spans. Turn IDs still identify the
        // conversation; buffer an early stderr event until stdout announces that turn.
        if cache.pending.len() >= MAX_CACHED_THREADS {
            if let Some(old) = cache.pending.keys().next().cloned() {
                cache.pending.remove(&old);
            }
        }
        let pending = cache
            .pending
            .entry(estimate.turn_id.clone())
            .or_insert_with(|| estimate.clone());
        if estimate.timestamp > pending.timestamp {
            *pending = estimate.clone();
        }
    }
    id
}

fn update(snapshot: &mut Snapshot, event: &mut GuiEvent) {
    let now = Utc::now();
    match event.method.as_str() {
        "thread/tokenUsage/updated" if event.params["tokenUsage"].is_object() => {
            snapshot.update(
                &event.params["tokenUsage"],
                event.params["turnId"].as_str(),
                now,
            );
            if let Some(usage) = snapshot.usage() {
                event.params["tokenUsage"] = usage;
            }
        }
        "turn/started" => snapshot.start(
            event.params["turn"]["id"]
                .as_str()
                .or_else(|| event.params["turnId"].as_str()),
        ),
        "thread/deleted" | "thread/historyChanged" => snapshot.clear(now),
        "thread/compacted" | "item/completed" => snapshot.reset(now),
        _ => {}
    }
}

fn usage_event(id: &str, turn_id: Option<&str>, usage: Value) -> GuiEvent {
    GuiEvent {
        method: "thread/tokenUsage/updated".into(),
        id: None,
        params: json!({"threadId": id, "turnId": turn_id, "tokenUsage": usage}),
    }
}

async fn load<'a>(cache: &'a mut UsageCache, home: &Path, id: &str) -> &'a mut Snapshot {
    if !cache.snapshots.contains_key(id) {
        let path = home.join(DIRECTORY).join(format!("{id}.json"));
        let restored = tauri::async_runtime::spawn_blocking(move || {
            let bytes = match std::fs::read(path) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return Snapshot::default()
                }
                Err(_) => {
                    eprintln!("Could not read Codex context estimate");
                    return Snapshot::default();
                }
            };
            match serde_json::from_slice::<Snapshot>(&bytes) {
                Ok(mut snapshot) => {
                    snapshot.restored = true;
                    snapshot
                }
                Err(_) => {
                    eprintln!("Could not decode Codex context estimate");
                    Snapshot::default()
                }
            }
        })
        .await
        .unwrap_or_else(|_| {
            eprintln!("Codex context estimate reader stopped");
            Snapshot::default()
        });
        if cache.snapshots.len() >= MAX_CACHED_THREADS {
            // Snapshots are persisted before releasing the guard; eviction cannot lose an estimate.
            if let Some(old) = cache.snapshots.keys().next().cloned() {
                cache.snapshots.remove(&old);
            }
        }
        cache.snapshots.insert(id.to_owned(), restored);
    }
    cache.snapshots.entry(id.to_owned()).or_default()
}

async fn save(home: &Path, id: &str, snapshot: &Snapshot) {
    let path = home.join(DIRECTORY).join(format!("{id}.json"));
    let snapshot = snapshot.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), SnapshotError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let value = serde_json::to_value(snapshot)?;
        crate::storage::write_json_atomic(&path, &value).map_err(|_| SnapshotError::Write)
    })
    .await;
    if !matches!(result, Ok(Ok(()))) {
        eprintln!("Could not save Codex context estimate");
    }
}

#[derive(Debug, thiserror::Error)]
enum SnapshotError {
    #[error("Could not create context snapshot directory")]
    Directory(#[from] std::io::Error),
    #[error("Could not encode context snapshot")]
    Encoding(#[from] serde_json::Error),
    #[error("Could not write context snapshot")]
    Write,
}
