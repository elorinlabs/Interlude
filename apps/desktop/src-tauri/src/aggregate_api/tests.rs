use super::*;
use serde_json::{json, Value};

pub(super) struct Fixture {
    _directory: tempfile::TempDir,
    pub(super) paths: Paths,
}

impl Fixture {
    pub(super) fn new() -> Self {
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
        for id in ["a", "b"] {
            write_json_atomic(
                &paths.providers.join(format!("{id}.json")),
                &json!({
                    "id": id, "name": id, "baseUrl": "https://provider.example/v1",
                    "apiKey": "test-key", "model": "test-model", "apiFormat": "openaiResponses",
                }),
            )
            .unwrap();
        }
        Self {
            _directory: directory,
            paths,
        }
    }

    fn save_json(&self, configs: Value) {
        write_json_atomic(&store_path(&self.paths).unwrap(), &configs).unwrap();
    }
}

fn config_json() -> Value {
    json!({
        "id": "group-one", "name": "Group one", "model": "test-model",
        "memberProviderIds": ["a", "b"], "enabled": true,
    })
}

fn custom_policy() -> AggregateFailoverPolicy {
    AggregateFailoverPolicy {
        enabled: false,
        max_attempts: 7,
        failure_threshold: 4,
        initial_cooldown_seconds: 12,
        max_cooldown_seconds: 120,
        retry_status_codes: vec![429, 503],
        retry_on_network_errors: false,
        respect_retry_after: false,
        ..Default::default()
    }
}

#[test]
fn old_configuration_uses_defaults_without_requiring_a_file_migration() {
    let fixture = Fixture::new();
    assert!(read_configs(&fixture.paths).unwrap().is_empty());
    fixture.save_json(json!([config_json()]));
    let configs = read_configs(&fixture.paths).unwrap();
    assert_eq!(configs.len(), 1);
    assert_eq!(
        configs[0].failover_policy,
        AggregateFailoverPolicy::default()
    );
    assert_eq!(
        read_active_config(&fixture.paths, "aggregate:group-one").unwrap(),
        configs[0]
    );
}

#[test]
fn custom_policy_survives_file_roundtrip() {
    let fixture = Fixture::new();
    let mut config: AggregateApiConfig = serde_json::from_value(config_json()).unwrap();
    config.failover_policy = custom_policy();
    write_configs(&fixture.paths, std::slice::from_ref(&config)).unwrap();
    assert_eq!(read_configs(&fixture.paths).unwrap(), [config]);
    let saved = read_json(&store_path(&fixture.paths).unwrap()).unwrap();
    assert_eq!(saved[0]["failoverPolicy"]["maxAttempts"], 7);
    assert_eq!(saved[0]["failoverPolicy"]["respectRetryAfter"], false);
}

#[test]
fn legacy_update_without_policy_preserves_saved_settings() {
    let fixture = Fixture::new();
    let mut existing: AggregateApiConfig = serde_json::from_value(config_json()).unwrap();
    existing.failover_policy = custom_policy();
    write_configs(&fixture.paths, &[existing.clone()]).unwrap();
    let configs = read_configs(&fixture.paths).unwrap();
    let mut update = config_json();
    update["name"] = json!("Renamed group");
    let input: AggregateApiInput = serde_json::from_value(update).unwrap();
    let updated = normalize_update(input, &fixture.paths, &configs).unwrap();
    assert_eq!(updated.failover_policy, existing.failover_policy);
    assert_eq!(updated.name, "Renamed group");
    write_configs(&fixture.paths, std::slice::from_ref(&updated)).unwrap();
    assert_eq!(read_configs(&fixture.paths).unwrap(), [updated]);
}

#[test]
fn explicit_update_replaces_policy_and_normalizes_status_codes() {
    let fixture = Fixture::new();
    let mut existing: AggregateApiConfig = serde_json::from_value(config_json()).unwrap();
    existing.failover_policy = custom_policy();
    let mut update = config_json();
    update["failoverPolicy"] = json!({ "maxAttempts": 1, "retryStatusCodes": [503, 429, 503] });
    let input: AggregateApiInput = serde_json::from_value(update).unwrap();
    let updated = normalize_update(input, &fixture.paths, &[existing]).unwrap();
    assert_eq!(updated.failover_policy.max_attempts, 1);
    assert_eq!(updated.failover_policy.retry_status_codes, [429, 503]);
    assert!(updated.failover_policy.enabled);
    assert!(updated.failover_policy.retry_on_network_errors);
}

#[test]
fn new_group_without_policy_uses_defaults() {
    let fixture = Fixture::new();
    let mut input = config_json();
    input.as_object_mut().unwrap().remove("id");
    let input: AggregateApiInput = serde_json::from_value(input).unwrap();
    let updated = normalize_update(input, &fixture.paths, &[]).unwrap();
    assert!(Uuid::parse_str(&updated.id).is_ok());
    assert_eq!(updated.failover_policy, AggregateFailoverPolicy::default());
}

#[test]
fn invalid_policy_is_rejected_before_an_update_can_be_saved() {
    let fixture = Fixture::new();
    fixture.save_json(json!([config_json()]));
    let saved = read_configs(&fixture.paths).unwrap();
    for policy in [
        json!({"maxAttempts": 0}),
        json!({"failureThreshold": 11}),
        json!({"initialCooldownSeconds": 301}),
        json!({"maxCooldownSeconds": 4}),
        json!({"retryStatusCodes": [200]}),
        json!({"retryStatusCodes": vec![503; 33]}),
    ] {
        let mut input = config_json();
        input["failoverPolicy"] = policy;
        let input: AggregateApiInput = serde_json::from_value(input).unwrap();
        assert!(normalize_update(input, &fixture.paths, &saved).is_err());
    }
    assert_eq!(read_configs(&fixture.paths).unwrap(), saved);
}

#[test]
fn invalid_saved_policy_is_rejected_when_reading() {
    let fixture = Fixture::new();
    let mut config = config_json();
    config["failoverPolicy"] = json!({ "maxCooldownSeconds": 3601 });
    fixture.save_json(json!([config]));
    assert!(read_configs(&fixture.paths).is_err());
}

#[test]
fn member_aliases_validate_individually_and_survive_legacy_updates() {
    let fixture = Fixture::new();
    for (id, alias) in [("a", "deployment-a"), ("b", "vendor/model-b")] {
        write_json_atomic(&fixture.paths.providers.join(format!("{id}.json")), &json!({
            "id": id, "name": id, "baseUrl": "https://provider.example/v1", "apiKey": "test-key",
            "model": alias, "apiFormat": "openaiResponses", "modelReasoningEfforts": {alias: ["high"]},
            "modelContextWindows": {alias: 64000}, "imageInputModels": [alias],
        })).unwrap();
    }
    let mut input = config_json();
    input["model"] = json!("shared-model");
    input["memberModels"] = json!({"a": "deployment-a", "b": "vendor/model-b"});
    let config = normalize_update(
        serde_json::from_value(input.clone()).unwrap(),
        &fixture.paths,
        &[],
    )
    .unwrap();
    write_configs(&fixture.paths, std::slice::from_ref(&config)).unwrap();
    let profiles = member_profiles(&fixture.paths, &config).unwrap();
    let logical = logical_profile(&config, &profiles).unwrap();
    assert_eq!(logical.model, "shared-model");
    assert_eq!(logical.model_context_windows["shared-model"], 64000);
    assert_eq!(logical.image_input_models, ["shared-model"]);
    input.as_object_mut().unwrap().remove("memberModels");
    let updated = normalize_update(
        serde_json::from_value(input).unwrap(),
        &fixture.paths,
        std::slice::from_ref(&config),
    )
    .unwrap();
    assert_eq!(updated.member_models, config.member_models);
    let mut invalid = config;
    invalid
        .member_models
        .insert("b".into(), "unsupported".into());
    assert!(member_profiles(&fixture.paths, &invalid).is_err());
}
