use super::*;
use chrono::{DateTime, Duration};

fn time() -> chrono::DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-10-16T08:20:49Z")
        .unwrap()
        .with_timezone(&Utc)
}

fn usage() -> Value {
    json!({"total": {"totalTokens": 8744228}, "last": {"totalTokens": 206357},
        "modelContextWindow": 258400})
}

fn estimate() -> Estimate {
    Estimate {
        thread_id: Some("thread-one".into()),
        turn_id: "turn-one".into(),
        tokens: 247017,
        timestamp: time(),
    }
}

fn diagnostic() -> Value {
    json!({"timestamp": "2026-10-16T08:20:49Z", "target": "codex_core::session::turn",
        "fields": {"message": "post sampling token usage", "turn_id": "turn-one",
            "total_usage_tokens": 247017, "auto_compact_scope_limit": "Some(244800)"},
        "spans": [{"name": "session_loop", "thread_id": "thread-one"}]})
}

#[test]
fn reads_engine_estimate_without_forwarding_diagnostics_or_billing_changes() {
    let parsed = state::parse(&diagnostic().to_string()).unwrap();
    assert_eq!(parsed.tokens, 247017);
    let mut snapshot = Snapshot::default();
    snapshot.update(&usage(), Some("turn-one"), time());
    assert!(snapshot.estimate(parsed));
    let value = snapshot.usage().unwrap();
    assert_eq!(value["contextTokens"], 247017);
    assert_eq!(value["last"], usage()["last"]);
    assert_eq!(value["total"], usage()["total"]);
    assert_eq!(value["modelContextWindow"], 258400);
}

#[test]
fn both_pipe_orders_and_duplicate_api_events_preserve_the_estimate() {
    for log_first in [true, false] {
        let mut snapshot = Snapshot::default();
        if log_first {
            assert!(snapshot.estimate(estimate()));
        }
        snapshot.update(&usage(), Some("turn-one"), time());
        if !log_first {
            assert!(snapshot.estimate(estimate()));
        }
        snapshot.update(&usage(), Some("turn-one"), time());
        assert_eq!(snapshot.usage().unwrap()["contextTokens"], 247017);
    }
}

#[test]
fn diagnostics_without_spans_resolve_by_turn_and_buffer_before_the_start_event() {
    let mut diagnostic = diagnostic();
    diagnostic.as_object_mut().unwrap().remove("spans");
    let estimate = state::parse(&diagnostic.to_string()).unwrap();
    let mut cache = UsageCache::default();
    assert!(resolve_thread(&mut cache, &estimate).is_none());
    assert!(cache.pending.contains_key("turn-one"));
    let mut snapshot = Snapshot::default();
    snapshot.start(Some("turn-one"));
    cache.snapshots.insert("thread-one".into(), snapshot);
    assert_eq!(
        resolve_thread(&mut cache, &estimate).as_deref(),
        Some("thread-one")
    );
    assert!(!cache.snapshots.contains_key("thread-two"));
}

#[test]
fn a_smaller_api_count_does_not_replace_a_newer_engine_estimate() {
    let mut snapshot = Snapshot::default();
    snapshot.update(&usage(), Some("turn-one"), time());
    snapshot.estimate(estimate());
    let mut next = usage();
    next["total"]["totalTokens"] = json!(9000000);
    next["last"]["totalTokens"] = json!(205000);
    snapshot.update(&next, Some("turn-one"), time());
    assert_eq!(snapshot.usage().unwrap()["contextTokens"], 247017);
}

#[test]
fn compaction_and_rollback_discard_high_estimates_and_late_pipe_messages() {
    let mut snapshot = Snapshot::default();
    snapshot.update(&usage(), Some("turn-one"), time());
    snapshot.estimate(estimate());
    let reset = time() + Duration::seconds(1);
    snapshot.reset(reset);
    assert!(!snapshot.estimate(estimate()));
    let compacted = json!({"total": {"totalTokens": 8953669}, "last": {"totalTokens": 16273},
        "modelContextWindow": 258400});
    snapshot.update(&compacted, Some("turn-one"), reset);
    assert_eq!(snapshot.usage().unwrap(), compacted);
    assert!(!snapshot.estimate(estimate()));
    let newer = Estimate {
        tokens: 22000,
        timestamp: reset + Duration::seconds(1),
        ..estimate()
    };
    assert!(snapshot.estimate(newer));
    snapshot.clear(reset + Duration::seconds(2));
    assert!(snapshot.usage().is_none());
}

#[test]
fn new_turn_rejects_old_turn_logs_and_out_of_order_estimates() {
    let mut snapshot = Snapshot::default();
    snapshot.update(&usage(), Some("turn-one"), time());
    snapshot.estimate(estimate());
    assert!(!snapshot.estimate(estimate()));
    snapshot.start(Some("turn-two"));
    assert!(!snapshot.estimate(Estimate {
        timestamp: time() + Duration::seconds(1),
        ..estimate()
    }));
    assert!(snapshot.estimate(Estimate {
        turn_id: "turn-two".into(),
        tokens: 250000,
        timestamp: time() + Duration::seconds(2),
        ..estimate()
    }));
}

#[test]
fn malformed_or_unrelated_logs_are_ignored() {
    assert!(state::parse("not json").is_none());
    for (pointer, replacement) in [
        ("/target", json!("tool_output")),
        ("/fields/message", json!("new")),
        ("/fields/total_usage_tokens", json!(-1)),
        ("/fields/total_usage_tokens", Value::Null),
        ("/timestamp", json!("invalid")),
        ("/spans/0/thread_id", json!("../escape")),
    ] {
        let mut value = diagnostic();
        *value.pointer_mut(pointer).unwrap() = replacement;
        assert!(state::parse(&value.to_string()).is_none(), "{pointer}");
    }
    let mut older = diagnostic();
    older["target"] = json!("codex_core::codex");
    older["spans"] = json!([{"thread.id": "thread-one"}]);
    assert!(state::parse(&older.to_string()).is_some());
}

#[tokio::test]
async fn reopening_restores_estimates_and_replay_invalidates_changed_history() {
    let root = tempfile::tempdir().unwrap();
    let mut snapshot = Snapshot::default();
    snapshot.update(&usage(), Some("turn-one"), time());
    snapshot.estimate(estimate());
    save(root.path(), "thread-one", &snapshot).await;
    let mut cache = UsageCache::default();
    let restored = load(&mut cache, root.path(), "thread-one").await;
    restored.update(&usage(), Some("turn-one"), time());
    assert_eq!(restored.usage().unwrap()["contextTokens"], 247017);
    assert!(load(&mut cache, root.path(), "thread-two")
        .await
        .usage()
        .is_none());
    cache = UsageCache::default();
    let restored = load(&mut cache, root.path(), "thread-one").await;
    let mut changed = usage();
    changed["last"]["totalTokens"] = json!(210000);
    restored.update(&changed, Some("turn-one"), time() + Duration::seconds(1));
    assert!(restored.usage().unwrap().get("contextTokens").is_none());
}

#[test]
fn lifecycle_events_clear_the_estimate_without_changing_unrelated_events() {
    let mut snapshot = Snapshot::default();
    let mut raw = usage_event("thread-one", Some("turn-one"), usage());
    update(&mut snapshot, &mut raw);
    snapshot.estimate(estimate());
    let mut completed = GuiEvent {
        method: "item/completed".into(),
        id: None,
        params: json!({"threadId": "thread-one", "item": {"type": "contextCompaction"}}),
    };
    assert!(tracks(&completed));
    update(&mut snapshot, &mut completed);
    assert!(snapshot.usage().unwrap().get("contextTokens").is_none());
    completed.params["item"]["type"] = json!("agentMessage");
    assert!(!tracks(&completed));
}

#[test]
#[ignore = "Set CODEX_GUI_TEST_CLI; runs real CLI with local HTTP fixtures only"]
fn real_cli_estimate_matches_compaction_with_lower_reported_usage() {
    let cli = std::env::var_os("CODEX_GUI_TEST_CLI").expect("CODEX_GUI_TEST_CLI is required");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let output = tempfile::tempdir().unwrap();
    let report = output.path().join("report.json");
    let mut command = std::process::Command::new("node");
    command
        .arg(root.join("scripts/codex-gui-context-estimate-smoke.mjs"))
        .arg(cli)
        .arg(&report);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let result = command.output().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let result: Value = serde_json::from_slice(&std::fs::read(report).unwrap()).unwrap();
    let estimate = state::parse(&result["diagnostic"].to_string()).unwrap();
    let mut snapshot = Snapshot::default();
    snapshot.update(&result["usage"], result["turnId"].as_str(), Utc::now());
    assert!(snapshot.estimate(estimate));
    let updated = snapshot.usage().unwrap();
    assert_eq!(
        updated["contextTokens"],
        result["diagnostic"]["fields"]["total_usage_tokens"]
    );
    assert!(updated["contextTokens"].as_u64().unwrap() >= 244800);
    assert_eq!(updated["last"]["totalTokens"], 206357);
}
