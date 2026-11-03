use super::*;
use crate::{
    models::ProviderApiFormat,
    third_party_apps::{tests::provider, MANAGED_PROVIDER_ID},
};

fn yaml(source: &str) -> Value {
    serde_yaml::from_str(source).unwrap()
}

fn entry<'a>(patch: &'a Value, id: &str) -> &'a Value {
    &patch
        .as_sequence()
        .unwrap()
        .iter()
        .find(|entry| entry["id"] == id)
        .unwrap()["config"]
}

fn write_fixture(home: &Path, relative: &str, contents: &str) {
    let path = home.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

fn read_fixture(home: &Path, relative: &str) -> Value {
    yaml(&fs::read_to_string(home.join(relative)).unwrap())
}

#[test]
fn feedback_chat_only_provider_has_a_resolvable_key_and_correct_api() {
    let home = tempfile::tempdir().unwrap();
    let mut provider = provider();
    provider.api_format = ProviderApiFormat::OpenaiResponses;
    provider
        .model_api_formats
        .insert(provider.model.clone(), ProviderApiFormat::OpenaiChat);
    sync_home(home.path(), Some(&provider)).unwrap();
    let credentials = read_fixture(home.path(), ".credentials.yaml");
    assert_eq!(credentials["version"], 1);
    assert_eq!(credentials["refs"][API_KEY_REF], "secret");
    assert!(credentials.get(API_KEY_REF).is_none());
    let patch = read_fixture(home.path(), "profiles/desktop/cordis.patch.yml");
    let route = &entry(&patch, PROVIDERS_ENTRY)["providers"][MANAGED_PROVIDER_ID];
    assert_eq!(route["api"], "openai-completions");
    assert_eq!(route["apiKeyEnv"], API_KEY_REF);
    assert_eq!(route["baseURL"], provider.base_url);
    assert_eq!(route["models"][0]["id"], provider.model);
    assert_eq!(entry(&patch, SELECTOR_ENTRY)["model"], provider.model);
    assert!(!home.path().join("settings.yaml").exists());
}

#[test]
fn credentials_upgrade_and_clear_preserve_other_refs_records_and_metadata() {
    let mut credentials = yaml(concat!(
        "version: 1\nrefs:\n  KEEP: keep-key\nrecords:\n",
        "  owner/account:\n    kind: api-key\n    key: record-secret\n",
        "CODEX_SWITCH_API_KEY: old-key\ncustom: true\n",
    ));
    let original_record = credentials["records"].clone();
    credentials::update(&mut credentials, Some(&provider())).unwrap();
    assert_eq!(credentials["refs"][API_KEY_REF], "secret");
    assert!(credentials.get(API_KEY_REF).is_none());
    credentials::update(&mut credentials, None).unwrap();
    assert!(credentials["refs"].get(API_KEY_REF).is_none());
    assert_eq!(credentials["refs"]["KEEP"], "keep-key");
    assert_eq!(credentials["records"], original_record);
    assert_eq!(credentials["custom"], true);
}

#[test]
fn flat_credentials_are_migrated_without_losing_other_keys() {
    let mut credentials = yaml("KEEP: keep-key\nCODEX_SWITCH_API_KEY: old-key\n");
    credentials::update(&mut credentials, Some(&provider())).unwrap();
    assert_eq!(credentials["version"], 1);
    assert_eq!(credentials["refs"]["KEEP"], "keep-key");
    assert_eq!(credentials["refs"][API_KEY_REF], "secret");
    assert!(credentials.get("KEEP").is_none());
}

#[test]
fn patch_updates_preserve_user_fields_and_other_plugins() {
    let mut patch = yaml(
        r#"
- id: other
  config: {enabled: true}
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    timeout: 300
    providers:
      keep: {api: openai-responses}
      codex-switch:
        displayName: My relay
        headers: {X-Custom: keep}
        models: [{id: test-model, name: My model, contextWindow: 128000}]
- id: agent-default-model
  config: {provider: keep, model: previous, reasoningEffort: high}
"#,
    );
    let other = patch[0].clone();
    config::update(&mut patch, &Mapping::new(), Some(&provider())).unwrap();
    assert_eq!(patch[0], other);
    let llm = entry(&patch, PROVIDERS_ENTRY);
    assert_eq!(llm["timeout"], 300);
    assert_eq!(llm["providers"]["keep"]["api"], "openai-responses");
    let route = &llm["providers"][MANAGED_PROVIDER_ID];
    assert_eq!(route["displayName"], "My relay");
    assert_eq!(route["headers"]["X-Custom"], "keep");
    assert_eq!(route["models"][0]["contextWindow"], 128000);
    assert_eq!(entry(&patch, SELECTOR_ENTRY)["reasoningEffort"], "high");
    let first = patch.clone();
    config::update(&mut patch, &Mapping::new(), Some(&provider())).unwrap();
    assert_eq!(patch, first);
    config::update(&mut patch, &Mapping::new(), None).unwrap();
    assert!(entry(&patch, PROVIDERS_ENTRY)["providers"]
        .get(MANAGED_PROVIDER_ID)
        .is_none());
    assert!(!patch
        .as_sequence()
        .unwrap()
        .iter()
        .any(|entry| entry["id"] == SELECTOR_ENTRY));
}

#[test]
fn sync_migrates_owned_legacy_sections_into_existing_profiles() {
    let home = tempfile::tempdir().unwrap();
    write_fixture(
        home.path(),
        "settings.yaml",
        concat!(
            "llm-pi-ai:\n  timeout: 50\n  providers:\n    legacy: {api: openai-completions}\n",
            "    codex-switch: {api: openai-responses}\n",
            "agent-default-model: {provider: codex-switch, model: old}\nother: {keep: true}\n",
        ),
    );
    for profile in ["desktop", "web"] {
        write_fixture(home.path(), &format!("profiles/{profile}/cordis.patch.yml"),
            "- id: llm-pi-ai\n  config:\n    timeout: 90\n    providers:\n      keep: {api: anthropic-messages}\n");
    }
    sync_home(home.path(), Some(&provider())).unwrap();
    for profile in ["desktop", "web"] {
        let patch = read_fixture(home.path(), &format!("profiles/{profile}/cordis.patch.yml"));
        let llm = entry(&patch, PROVIDERS_ENTRY);
        assert_eq!(llm["timeout"], 90);
        assert_eq!(llm["providers"]["legacy"]["api"], "openai-completions");
        assert_eq!(llm["providers"]["keep"]["api"], "anthropic-messages");
        assert_eq!(
            llm["providers"][MANAGED_PROVIDER_ID]["api"],
            "openai-completions"
        );
    }
    assert_eq!(
        read_fixture(home.path(), "settings.yaml"),
        yaml("other: {keep: true}")
    );
    sync_home(home.path(), None).unwrap();
    assert!(read_fixture(home.path(), ".credentials.yaml")["refs"]
        .get(API_KEY_REF)
        .is_none());
}

#[test]
fn clear_preserves_an_unmanaged_default_selection() {
    let mut patch = yaml("- id: agent-default-model\n  config: {provider: keep, model: keep}\n");
    let original = patch.clone();
    config::update(&mut patch, &Mapping::new(), None).unwrap();
    assert_eq!(patch, original);
}

#[test]
fn legacy_user_providers_cannot_overwrite_the_new_route_on_next_boot() {
    let home = tempfile::tempdir().unwrap();
    write_fixture(
        home.path(),
        "settings.yaml",
        "llm-pi-ai: {providers: {keep: {api: openai-completions}}}\nother: true\n",
    );
    sync_home(home.path(), Some(&provider())).unwrap();
    let patch = read_fixture(home.path(), "profiles/desktop/cordis.patch.yml");
    assert_eq!(
        entry(&patch, PROVIDERS_ENTRY)["providers"]["keep"]["api"],
        "openai-completions"
    );
    assert_eq!(
        read_fixture(home.path(), "settings.yaml"),
        yaml("other: true")
    );
}

#[test]
fn malformed_or_future_documents_are_rejected_before_any_write() {
    for (path, contents) in [
        (".credentials.yaml", "version: 2\nrefs: {}"),
        (".credentials.yaml", "version: 1\nrefs: []"),
        ("profiles/desktop/cordis.patch.yml", "unexpected: mapping"),
        (
            "profiles/desktop/cordis.patch.yml",
            "- id: llm-pi-ai\n  config: {providers: []}",
        ),
        (
            "profiles/desktop/cordis.patch.yml",
            "- id: llm-pi-ai\n- id: llm-pi-ai",
        ),
        ("profiles/desktop/cordis.patch.yml", "[broken"),
    ] {
        let home = tempfile::tempdir().unwrap();
        write_fixture(home.path(), path, contents);
        assert!(sync_home(home.path(), Some(&provider())).is_err(), "{path}");
        assert_eq!(
            fs::read_to_string(home.path().join(path)).unwrap(),
            contents
        );
        let peer = if path == ".credentials.yaml" {
            "profiles/desktop/cordis.patch.yml"
        } else {
            ".credentials.yaml"
        };
        assert!(!home.path().join(peer).exists());
    }
}

#[cfg(unix)]
#[test]
fn credentials_are_owner_only() {
    use std::os::unix::fs::PermissionsExt;
    let home = tempfile::tempdir().unwrap();
    sync_home(home.path(), Some(&provider())).unwrap();
    let mode = fs::metadata(home.path().join(".credentials.yaml"))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600);
}
