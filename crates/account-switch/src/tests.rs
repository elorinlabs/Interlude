use super::*;

#[test]
fn preflight_validation_does_not_mutate_credentials_or_conversation() {
    let dir = fixture();
    let current = dir.path().join("codex/auth.json");
    let state = dir.path().join("state.json");
    let before_current = fs::read(&current).ok();
    let before_state = fs::read(&state).ok();
    validate_switch(&SwitchRequest {
        accounts: &dir.path().join("accounts"),
        current_auth: &current,
        state: &state,
        id: "next",
    })
    .unwrap();
    assert_eq!(fs::read(&current).ok(), before_current);
    assert_eq!(fs::read(&state).ok(), before_state);
    assert!(validate_switch(&SwitchRequest {
        accounts: &dir.path().join("accounts"),
        current_auth: &current,
        state: &state,
        id: "missing"
    })
    .is_err());
}

fn auth(id: &str, token: &str) -> Value {
    serde_json::json!({"auth_mode":"chatgpt","tokens":{
        "id_token":"fake-id-token","access_token":token,"account_id":id}})
}

#[test]
fn sanitizing_excludes_passwords_codes_and_unrelated_metadata() {
    let mut source = auth("next", "fake-access");
    source["password"] = "fake-password".into();
    source["tokens"]["totpSecret"] = "fake-code".into();
    source["tokens"]["refresh_token"] = "fake-refresh".into();
    let clean = sanitized_oauth(&source).unwrap();
    assert!(clean.get("password").is_none());
    assert!(clean["tokens"].get("totpSecret").is_none());
    assert_eq!(clean["tokens"]["refresh_token"], "fake-refresh");
}

#[test]
fn importing_preserves_refresh_age_for_client_renewal() {
    let mut source = auth("next", "fake-access");
    source["last_refresh"] = "2026-10-30T08:00:00Z".into();
    assert_eq!(
        sanitized_oauth(&source).unwrap()["last_refresh"],
        source["last_refresh"]
    );
}

#[test]
fn switching_does_not_roll_back_a_newer_saved_login() {
    let dir = fixture();
    let root = dir.path();
    fs::create_dir_all(root.join("accounts/old")).unwrap();
    let mut live = auth("old", "old-token");
    live["last_refresh"] = "2026-10-29T01:00:00Z".into();
    let mut saved = auth("old", "new-token");
    saved["last_refresh"] = "2026-10-30T01:00:00Z".into();
    fs::write(root.join("codex/auth.json"), live.to_string()).unwrap();
    fs::write(root.join("accounts/old/auth.json"), saved.to_string()).unwrap();
    run(root, "next").unwrap();
    assert_eq!(
        read_json(&root.join("accounts/old/auth.json")).unwrap(),
        saved
    );
}

fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("accounts/next")).unwrap();
    fs::create_dir_all(dir.path().join("codex")).unwrap();
    fs::write(
        dir.path().join("accounts/next/auth.json"),
        auth("next", "fake-next").to_string(),
    )
    .unwrap();
    fs::write(
        dir.path().join("codex/auth.json"),
        auth("old", "fake-current").to_string(),
    )
    .unwrap();
    fs::write(
        dir.path().join("state.json"),
        r#"{"active_account_id":"old","unrelated":17}"#,
    )
    .unwrap();
    dir
}

fn run(dir: &Path, id: &str) -> Result<(), SwitchError> {
    switch_account(SwitchRequest {
        accounts: &dir.join("accounts"),
        current_auth: &dir.join("codex/auth.json"),
        state: &dir.join("state.json"),
        id,
    })
}

#[test]
fn replaces_only_credentials_and_active_marker() {
    let dir = fixture();
    let root = dir.path();
    let config = "cli_auth_credentials_store = 'file'\nmodel = 'unchanged'\n";
    fs::write(root.join("codex/config.toml"), config).unwrap();
    fs::write(root.join("codex/conversations.json"), "unchanged").unwrap();
    run(root, "next").unwrap();
    assert_eq!(
        read_json(&root.join("codex/auth.json")).unwrap(),
        auth("next", "fake-next")
    );
    assert_eq!(
        read_json(&root.join("state.json")).unwrap()["unrelated"],
        17
    );
    assert_eq!(
        fs::read_to_string(root.join("codex/config.toml")).unwrap(),
        config
    );
    assert_eq!(
        fs::read_to_string(root.join("codex/conversations.json")).unwrap(),
        "unchanged"
    );
}

#[test]
fn rejects_other_credential_stores_without_writes() {
    for store in ["keyring", "auto", "ephemeral"] {
        let dir = fixture();
        let root = dir.path();
        fs::write(
            root.join("codex/config.toml"),
            format!("cli_auth_credentials_store = '{store}'"),
        )
        .unwrap();
        let before = fs::read(root.join("codex/auth.json")).unwrap();
        assert_eq!(run(root, "next"), Err(SwitchError::CredentialStore));
        assert_eq!(fs::read(root.join("codex/auth.json")).unwrap(), before);
    }
}

#[test]
fn rejects_traversal_and_invalid_oauth_without_changing_current() {
    let dir = fixture();
    let root = dir.path();
    assert_eq!(run(root, "../next"), Err(SwitchError::Failed));
    fs::write(root.join("accounts/next/auth.json"), "{}").unwrap();
    assert_eq!(run(root, "next"), Err(SwitchError::Failed));
    assert_eq!(
        read_json(&root.join("codex/auth.json")).unwrap(),
        auth("old", "fake-current")
    );
}

#[test]
fn preserves_refreshed_credentials_only_for_the_same_account() {
    let dir = fixture();
    let root = dir.path();
    fs::create_dir_all(root.join("accounts/old")).unwrap();
    fs::write(
        root.join("accounts/old/auth.json"),
        auth("old", "fake-outdated").to_string(),
    )
    .unwrap();
    run(root, "next").unwrap();
    assert_eq!(
        read_json(&root.join("accounts/old/auth.json")).unwrap(),
        auth("old", "fake-current")
    );
}

#[test]
fn respects_workspace_restrictions() {
    let dir = fixture();
    let root = dir.path();
    fs::write(
        root.join("codex/config.toml"),
        "forced_chatgpt_workspace_id = 'different'",
    )
    .unwrap();
    assert_eq!(run(root, "next"), Err(SwitchError::CredentialStore));
}

#[test]
fn malformed_manager_state_leaves_credentials_untouched() {
    let dir = fixture();
    let root = dir.path();
    fs::write(root.join("state.json"), "[]").unwrap();
    assert_eq!(run(root, "next"), Err(SwitchError::Failed));
    assert_eq!(
        read_json(&root.join("codex/auth.json")).unwrap(),
        auth("old", "fake-current")
    );
}

#[test]
fn switching_both_ways_preserves_the_same_thread_and_window_context() {
    let dir = fixture();
    let root = dir.path();
    fs::create_dir_all(root.join("accounts/old")).unwrap();
    fs::write(
        root.join("accounts/old/auth.json"),
        auth("old", "fake-old").to_string(),
    )
    .unwrap();
    let home = root.join("codex");
    let session_id = "12345678-1234-4567-8901-123456789012";
    let rollout = format!(
        "{{\"type\":\"session_meta\",\"payload\":{{\"id\":\"{session_id}\"}}}}\n\
        {{\"type\":\"event_msg\",\"payload\":{{\"message\":\"original context\"}}}}\n"
    );
    fs::create_dir_all(home.join("sessions/2026/10/29")).unwrap();
    fs::create_dir_all(home.join("archived_sessions")).unwrap();
    let files = [
        ("sessions/2026/10/29/rollout.jsonl", rollout),
        (
            "archived_sessions/archived.jsonl",
            "archived context\n".to_owned(),
        ),
        (
            "session_index.jsonl",
            format!("{{\"id\":\"{session_id}\",\"thread_name\":\"same chat\"}}\n"),
        ),
        (
            ".codex-global-state.json",
            format!("{{\"active-thread-id\":\"{session_id}\",\"projects\":[\"project-a\"]}}"),
        ),
    ];
    for (path, value) in &files {
        fs::write(home.join(path), value).unwrap();
    }
    let database = home.join("state_5.sqlite");
    {
        let connection = rusqlite::Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE threads(id TEXT PRIMARY KEY,title TEXT,rollout_path TEXT);",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO threads VALUES(?1,'same chat',?2)",
                rusqlite::params![session_id, "sessions/2026/10/29/rollout.jsonl"],
            )
            .unwrap();
    }
    let before_db = fs::read(&database).unwrap();
    run(root, "next").unwrap();
    run(root, "old").unwrap();
    for (path, value) in &files {
        assert_eq!(fs::read_to_string(home.join(path)).unwrap(), *value);
    }
    assert_eq!(fs::read(&database).unwrap(), before_db);
    let connection = rusqlite::Connection::open(database).unwrap();
    let id: String = connection
        .query_row("SELECT id FROM threads", [], |row| row.get(0))
        .unwrap();
    assert_eq!(id, session_id);
}
#[cfg(windows)]
#[test]
fn atomic_write_supports_redirected_windows_appdata() {
    let appdata = std::env::var_os("APPDATA").expect("Windows APPDATA must be set");
    let directory = tempfile::tempdir_in(appdata).unwrap();
    let destination = directory.path().join("state.json");
    super::write_atomic(&destination, b"first").unwrap();
    super::write_atomic(&destination, b"second").unwrap();
    assert_eq!(std::fs::read(&destination).unwrap(), b"second");
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}
