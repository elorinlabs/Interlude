//! Read native Codex usage events; never infer billing identity from the current login.
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs,
    io::{BufRead, BufReader},
    path::Path,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    timestamp: i64,
    account_id: Option<String>,
    model: String,
    input: u64,
    output: u64,
    cached: u64,
    reasoning: u64,
    total: u64,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    entries: Vec<Entry>,
    unreadable_files: usize,
}

fn scan(path: &Path, result: &mut History, seen: &mut BTreeSet<String>) {
    let items = match fs::read_dir(path) {
        Ok(items) => items,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                result.unreadable_files += 1;
            }
            return;
        }
    };
    for item in items.flatten() {
        let path = item.path();
        let Ok(kind) = item.file_type() else {
            continue;
        };
        if kind.is_dir() {
            scan(&path, result, seen);
        } else if kind.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            if read(&path, result, seen).is_err() {
                result.unreadable_files += 1;
            }
        }
    }
}
fn read(path: &Path, result: &mut History, seen: &mut BTreeSet<String>) -> std::io::Result<()> {
    let reader = BufReader::new(fs::File::open(path)?);
    let mut session = String::new();
    let mut model = String::from("unknown");
    let mut previous = [0_u64; 5];
    let mut first = true;
    let mut forked = false;
    let mut forked_at = None;
    for line in reader.lines() {
        let line = line?;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if value["type"] == "session_meta" {
            forked = value["payload"]["forked_from_id"].is_string();
            forked_at = value["timestamp"]
                .as_str()
                .and_then(|ts| chrono::DateTime::parse_from_rfc3339(ts).ok());
            session = value["payload"]["id"]
                .as_str()
                .unwrap_or_default()
                .to_owned();
        }
        if value["type"] == "turn_context" {
            model = value["payload"]["model"]
                .as_str()
                .unwrap_or("unknown")
                .to_owned();
        }
        if value["payload"]["type"] != "token_count" {
            continue;
        }
        let Some(usage) = value.pointer("/payload/info/total_token_usage") else {
            continue;
        };
        let Some(timestamp) = value["timestamp"]
            .as_str()
            .and_then(|ts| chrono::DateTime::parse_from_rfc3339(ts).ok())
        else {
            continue;
        };
        let keys = [
            "input_tokens",
            "output_tokens",
            "cached_input_tokens",
            "reasoning_output_tokens",
            "total_tokens",
        ];
        let current = keys.map(|key| usage[key].as_u64().unwrap_or(0));
        if forked && forked_at.is_some_and(|start| timestamp < start) {
            previous = current;
            first = false;
            continue;
        }
        let delta: [u64; 5] = if first && forked {
            keys.map(|key| {
                value
                    .pointer("/payload/info/last_token_usage")
                    .and_then(|last| last[key].as_u64())
                    .unwrap_or(0)
            })
        } else if current[4] < previous[4] {
            current
        } else {
            std::array::from_fn(|i| current[i].saturating_sub(previous[i]))
        };
        first = false;
        previous = current;
        if delta[4] == 0 || session.is_empty() {
            continue;
        }
        let identity = format!("{session}:{}:{current:?}", timestamp.timestamp_millis());
        if !seen.insert(identity) {
            continue;
        }
        result.entries.push(Entry {
            timestamp: timestamp.timestamp(),
            model: model.clone(),
            account_id: usage["account_id"]
                .as_str()
                .or_else(|| value["payload"]["account_id"].as_str())
                .map(str::to_owned),
            input: delta[0],
            output: delta[1],
            cached: delta[2],
            reasoning: delta[3],
            total: delta[4],
        });
    }
    Ok(())
}
pub fn read_home(home: &Path) -> History {
    let mut result = History::default();
    let mut seen = BTreeSet::new();
    for folder in ["sessions", "archived_sessions"] {
        scan(&home.join(folder), &mut result, &mut seen);
    }
    result.entries.sort_by_key(|entry| entry.timestamp);
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cumulative_events_are_differenced_and_copies_are_deduplicated() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("usage.jsonl");
        let mut lines =
            vec![serde_json::json!({"type":"session_meta","payload":{"id":"thread"}}).to_string()];
        for total in [10, 10, 25] {
            lines.push(serde_json::json!({"timestamp":"2026-10-30T00:00:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":total}}}}).to_string());
        }
        fs::write(&path, lines.join("\n")).unwrap();
        let mut history = History::default();
        let mut seen = BTreeSet::new();
        read(&path, &mut history, &mut seen).unwrap();
        read(&path, &mut history, &mut seen).unwrap();
        assert_eq!(history.entries.iter().map(|e| e.total).sum::<u64>(), 25);
        assert!(history.entries.iter().all(|e| e.account_id.is_none()));
    }
    #[test]
    fn fork_baseline_is_not_charged_again_and_categories_remain_subsets() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("fork.jsonl");
        let meta = serde_json::json!({"type":"session_meta","payload":{"id":"fork","forked_from_id":"parent"}});
        let event = serde_json::json!({"timestamp":"2026-10-30T00:00:00Z","payload":{"type":"token_count","account_id":"account-a","info":{
            "total_token_usage":{"input_tokens":1000,"output_tokens":200,"total_tokens":1200},
            "last_token_usage":{"input_tokens":100,"output_tokens":20,"cached_input_tokens":50,"reasoning_output_tokens":10,"total_tokens":120}
        }}});
        fs::write(&path, format!("{meta}\n{event}")).unwrap();
        let mut history = History::default();
        read(&path, &mut history, &mut BTreeSet::new()).unwrap();
        let entry = &history.entries[0];
        assert_eq!(
            (
                entry.total,
                entry.input,
                entry.output,
                entry.cached,
                entry.reasoning
            ),
            (120, 100, 20, 50, 10)
        );
        assert_eq!(entry.account_id.as_deref(), Some("account-a"));
    }
}
