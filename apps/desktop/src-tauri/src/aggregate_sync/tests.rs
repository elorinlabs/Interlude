use super::*;
use serde_json::json;
use std::{
    sync::{mpsc, Arc},
    time::Duration,
};

struct Fixture {
    _directory: tempfile::TempDir,
    paths: Paths,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let paths = Paths {
            codex_home: root.join("home"),
            current_auth: root.join("home/auth.json"),
            current_config: root.join("home/config.toml"),
            accounts: root.join("accounts"),
            providers: root.join("providers"),
            config_backup: root.join("config-backup.toml"),
            state_file: root.join("state.json"),
        };
        Self {
            _directory: directory,
            paths,
        }
    }

    fn insert(&self, id: &str) {
        update_configs(&self.paths, |configs| {
            configs.push(config(id));
            Ok(())
        })
        .unwrap();
    }
}

fn config(id: &str) -> AggregateApiConfig {
    serde_json::from_value(json!({"id":id,"name":"Route","model":"public",
        "memberProviderIds":["one","two"],"enabled":true,
        "memberModels":{"one":"deployment-a","two":"deployment-b"},
        "failoverPolicy":{"routingStrategy":"priority","recoverySuccessThreshold":3,
            "errorRateThresholdPercent":50,"errorRateMinRequests":10}}))
    .unwrap()
}

#[test]
fn old_payload_defaults_empty_and_tombstones_win_equal_revisions() {
    assert!(serde_json::from_value::<AggregateSyncPayload>(json!({}))
        .unwrap()
        .aggregates
        .is_empty());
    let local = AggregateSyncEntry {
        id: "a".into(),
        modified_at: Utc::now(),
        config: Some(config("a")),
    };
    let remote = AggregateSyncEntry {
        config: None,
        ..local.clone()
    };
    assert!(should_replace(&local, &remote));
    assert!(!should_replace(&remote, &local));
    assert!(validate(&AggregateSyncPayload {
        aggregates: vec![local.clone(), local]
    })
    .is_err());
}

#[test]
fn policy_aliases_and_order_roundtrip_and_deletion_rejects_stale_payloads() {
    let source = Fixture::new();
    let target = Fixture::new();
    source.insert("a");
    let stale = collect(&source.paths).unwrap();
    assert_eq!(apply(&target.paths, stale.clone()).unwrap(), 1);
    assert_eq!(
        aggregate_api::read_configs(&target.paths).unwrap(),
        [config("a")]
    );
    update_configs(&source.paths, |configs| {
        configs.clear();
        Ok(())
    })
    .unwrap();
    let deleted = collect(&source.paths).unwrap();
    assert!(deleted.aggregates[0].config.is_none());
    assert!(deleted.aggregates[0].modified_at > stale.aggregates[0].modified_at);
    assert_eq!(apply(&target.paths, deleted).unwrap(), 1);
    assert_eq!(apply(&target.paths, stale).unwrap(), 0);
    assert!(aggregate_api::read_configs(&target.paths)
        .unwrap()
        .is_empty());
}

#[test]
fn official_aggregate_references_sync_before_the_accounts_arrive() {
    let source = Fixture::new();
    let target = Fixture::new();
    let mut aggregate = config("mixed");
    aggregate.member_provider_ids = vec!["account:official-one".into(), "two".into()];
    aggregate.member_models = [("account:official-one".into(), "official-model".into())].into();
    update_configs(&source.paths, |configs| {
        configs.push(aggregate.clone());
        Ok(())
    })
    .unwrap();
    let payload = collect(&source.paths).unwrap();
    assert_eq!(apply(&target.paths, payload).unwrap(), 1);
    assert_eq!(
        aggregate_api::read_configs(&target.paths).unwrap(),
        [aggregate]
    );
}

#[test]
fn local_edits_advance_only_changed_records_and_repair_interrupted_deletions() {
    let fixture = Fixture::new();
    fixture.insert("a");
    fixture.insert("b");
    let before = collect(&fixture.paths).unwrap();
    update_configs(&fixture.paths, |configs| {
        configs[0].name = "Renamed".into();
        Ok(())
    })
    .unwrap();
    let after = collect(&fixture.paths).unwrap();
    assert!(after.aggregates[0].modified_at > before.aggregates[0].modified_at);
    assert_eq!(
        after.aggregates[1].modified_at,
        before.aggregates[1].modified_at
    );
    // Simulate interruption after the configuration file was committed but before its revision file.
    aggregate_api::write_configs(&fixture.paths, &[]).unwrap();
    let repaired = collect(&fixture.paths).unwrap();
    assert!(repaired
        .aggregates
        .iter()
        .all(|entry| entry.config.is_none()));
    assert_eq!(apply(&fixture.paths, before).unwrap(), 0);
}

#[test]
fn failed_local_edit_and_invalid_remote_payload_leave_storage_unchanged() {
    let fixture = Fixture::new();
    fixture.insert("a");
    let failed: Result<(), String> = update_configs(&fixture.paths, |configs| {
        configs.clear();
        Err("Invalid edit".into())
    });
    assert!(failed.is_err());
    let mut invalid = collect(&fixture.paths).unwrap();
    invalid.aggregates[0].config.as_mut().unwrap().id = "different".into();
    assert!(apply(&fixture.paths, invalid).is_err());
    assert_eq!(
        aggregate_api::read_configs(&fixture.paths).unwrap(),
        [config("a")]
    );
}

#[test]
fn deleting_legacy_configuration_creates_a_tombstone_before_the_first_sync() {
    let fixture = Fixture::new();
    aggregate_api::write_configs(&fixture.paths, &[config("legacy")]).unwrap();
    update_configs(&fixture.paths, |configs| {
        configs.clear();
        Ok(())
    })
    .unwrap();
    let payload = collect(&fixture.paths).unwrap();
    assert_eq!(payload.aggregates.len(), 1);
    assert_eq!(payload.aggregates[0].id, "legacy");
    assert!(payload.aggregates[0].config.is_none());
}

#[test]
fn local_update_and_sync_merge_are_serialized_without_losing_records() {
    let fixture = Arc::new(Fixture::new());
    fixture.insert("a");
    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let (finished_tx, finished_rx) = mpsc::channel();
    let local = Arc::clone(&fixture);
    let editor = std::thread::spawn(move || {
        update_configs(&local.paths, |configs| {
            configs[0].name = "Edited locally".into();
            entered_tx.send(()).unwrap();
            release_rx.recv().unwrap();
            Ok(())
        })
    });
    entered_rx.recv().unwrap();
    let remote = Arc::clone(&fixture);
    let merger = std::thread::spawn(move || {
        let result = apply(
            &remote.paths,
            AggregateSyncPayload {
                aggregates: vec![AggregateSyncEntry {
                    id: "b".into(),
                    modified_at: Utc::now(),
                    config: Some(config("b")),
                }],
            },
        );
        finished_tx.send(()).unwrap();
        result
    });
    assert!(finished_rx.recv_timeout(Duration::from_millis(30)).is_err());
    release_tx.send(()).unwrap();
    editor.join().unwrap().unwrap();
    assert_eq!(merger.join().unwrap().unwrap(), 1);
    let saved = aggregate_api::read_configs(&fixture.paths).unwrap();
    assert_eq!(saved.len(), 2);
    assert_eq!(saved[0].name, "Edited locally");
    assert_eq!(saved[1], config("b"));
}
