use super::*;
use serde_json::json;

fn workspace(name: &str) -> WorkspaceKey {
    WorkspaceKey(name.to_owned())
}

async fn submit(
    activity: &WorkspaceActivity,
    session: &str,
    key: &WorkspaceKey,
    id: u64,
) -> Result<()> {
    activity
        .begin(
            session,
            WorkspaceRequest {
                id,
                method: "turn/start",
                params: &json!({"threadId": "chat"}),
            },
            Some(key.clone()),
        )
        .await
}

async fn acknowledge(activity: &WorkspaceActivity, id: u64) {
    activity
        .response(
            "host",
            id,
            Some(&json!({"turn": {"id": "turn", "status": "inProgress"}})),
        )
        .await;
}

async fn complete(activity: &WorkspaceActivity) {
    activity
        .event(
            "host",
            "turn/completed",
            &json!({"threadId": "chat",
        "turn": {"id": "turn", "status": "completed"}}),
        )
        .await;
}

#[tokio::test]
async fn acknowledged_tasks_block_their_worktree_until_completion() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    submit(&activity, "host", &main, 1).await.unwrap();
    assert!(matches!(
        activity.change(main.clone()).await,
        Err(GuiError::WorkspaceConflict(_))
    ));
    acknowledge(&activity, 1).await;
    assert!(matches!(
        activity.change(main.clone()).await,
        Err(GuiError::WorkspaceConflict(_))
    ));
    let other = activity
        .change(workspace("another-worktree"))
        .await
        .unwrap();
    complete(&activity).await;
    assert!(activity.change(main).await.is_ok());
    drop(other);
}

#[tokio::test]
async fn branch_changes_reject_new_tasks_on_every_client_but_allow_other_worktrees() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    let change = activity.change(main.clone()).await.unwrap();
    for session in ["desktop", "phone", "web"] {
        assert!(matches!(
            submit(&activity, session, &main, 1).await,
            Err(GuiError::WorkspaceBusy)
        ));
        submit(&activity, session, &workspace("other"), 2)
            .await
            .unwrap();
    }
    assert!(activity.change(main.clone()).await.is_err());
    drop(change);
    submit(&activity, "phone", &main, 3).await.unwrap();
}

#[tokio::test]
async fn simultaneous_checkout_and_admission_cannot_both_succeed() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    let (task, change) = tokio::join!(
        submit(&activity, "host", &main, 1),
        activity.change(main.clone())
    );
    assert_ne!(task.is_ok(), change.is_ok());
}

#[tokio::test]
async fn early_completion_is_not_resurrected_by_a_late_acknowledgement() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    submit(&activity, "host", &main, 1).await.unwrap();
    activity
        .event(
            "host",
            "turn/started",
            &json!({"threadId": "chat",
        "turn": {"id": "turn", "status": "inProgress"}}),
        )
        .await;
    complete(&activity).await;
    // Admission stays closed until the outstanding request itself is acknowledged.
    assert!(activity.change(main.clone()).await.is_err());
    acknowledge(&activity, 1).await;
    assert!(activity.change(main).await.is_ok());
}

#[tokio::test]
async fn failures_release_requests_without_unlocking_an_already_started_turn() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    submit(&activity, "host", &main, 1).await.unwrap();
    activity.response("host", 1, None).await;
    assert!(activity.change(main.clone()).await.is_ok());
    submit(&activity, "host", &main, 2).await.unwrap();
    activity
        .event(
            "host",
            "turn/started",
            &json!({"threadId": "chat",
        "turn": {"id": "turn", "status": "inProgress"}}),
        )
        .await;
    activity.response("host", 2, None).await;
    assert!(activity.change(main.clone()).await.is_err());
    complete(&activity).await;
    assert!(activity.change(main).await.is_ok());
}

#[tokio::test]
async fn goals_remain_protected_between_turns_and_ignore_stale_replies() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    activity
        .begin(
            "host",
            WorkspaceRequest {
                id: 1,
                method: "thread/goal/set",
                params: &json!({"threadId": "chat", "status": "active"}),
            },
            Some(main.clone()),
        )
        .await
        .unwrap();
    activity
        .response("host", 1, Some(&json!({"goal": {"status": "active"}})))
        .await;
    complete(&activity).await;
    assert!(activity.change(main.clone()).await.is_err());
    activity
        .begin(
            "host",
            WorkspaceRequest {
                id: 2,
                method: "thread/goal/get",
                params: &json!({"threadId": "chat"}),
            },
            None,
        )
        .await
        .unwrap();
    activity
        .event(
            "host",
            "thread/goal/updated",
            &json!({"threadId": "chat",
        "goal": {"status": "complete"}}),
        )
        .await;
    activity
        .response("host", 2, Some(&json!({"goal": {"status": "active"}})))
        .await;
    assert!(activity.change(main).await.is_ok());
}

#[tokio::test]
async fn disconnect_releases_only_its_own_tasks_and_unknown_tasks_fail_closed() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    submit(&activity, "host", &main, 1).await.unwrap();
    activity
        .event(
            "other-session",
            "turn/started",
            &json!({"threadId": "child",
        "turn": {"id": "child-turn", "status": "inProgress"}}),
        )
        .await;
    activity.disconnect("host").await;
    assert!(activity.change(main.clone()).await.is_err());
    activity
        .event(
            "other-session",
            "turn/completed",
            &json!({"threadId": "child",
        "turn": {"id": "child-turn", "status": "completed"}}),
        )
        .await;
    assert!(activity.change(main).await.is_ok());
}

#[test]
fn directory_aliases_and_subdirectories_share_a_key_but_worktrees_do_not() {
    let root = std::env::temp_dir().join(format!("workspace-admission-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join(".git")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    let linked = root.join("linked");
    std::fs::create_dir_all(linked.join("src")).unwrap();
    std::fs::write(linked.join(".git"), "gitdir: ../.git/worktrees/linked").unwrap();
    let key = |path: &std::path::Path| WorkspaceKey::resolve(path.to_str().unwrap()).unwrap();
    assert_eq!(key(&root), key(&root.join("src/..")));
    assert_eq!(key(&root), key(&root.join("src")));
    assert_ne!(key(&root), key(&linked));
    assert_eq!(key(&linked), key(&linked.join("src")));
    #[cfg(windows)]
    assert_eq!(
        key(&root),
        key(&std::path::PathBuf::from(
            root.to_str().unwrap().to_uppercase()
        ))
    );
    assert!(root.starts_with(std::env::temp_dir()));
    std::fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn late_snapshots_do_not_restore_finished_tasks_or_move_failed_submissions() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    submit(&activity, "host", &main, 1).await.unwrap();
    acknowledge(&activity, 1).await;
    activity
        .begin(
            "host",
            WorkspaceRequest {
                id: 2,
                method: "thread/read",
                params: &json!({"threadId": "chat"}),
            },
            None,
        )
        .await
        .unwrap();
    complete(&activity).await;
    activity
        .response(
            "host",
            2,
            Some(&json!({"thread": {"id": "chat",
        "status": {"type": "active"}, "turns": [{"id": "turn", "status": "inProgress"}]}})),
        )
        .await;
    assert!(activity.change(main.clone()).await.is_ok());
    submit(&activity, "host", &workspace("rejected-folder"), 3)
        .await
        .unwrap();
    activity.response("host", 3, None).await;
    assert_eq!(activity.workspace("host", "chat").await, Some(main));
}

#[tokio::test]
async fn observed_active_threads_stay_protected_without_a_turn_id() {
    let activity = WorkspaceActivity::default();
    let main = workspace("main");
    activity
        .begin(
            "host",
            WorkspaceRequest {
                id: 1,
                method: "thread/resume",
                params: &json!({"threadId": "chat"}),
            },
            Some(main.clone()),
        )
        .await
        .unwrap();
    activity
        .response(
            "host",
            1,
            Some(&json!({"thread": {"id": "chat", "status": {"type": "active"}}})),
        )
        .await;
    assert!(activity.change(main.clone()).await.is_err());
    activity
        .event(
            "host",
            "thread/status/changed",
            &json!({"threadId": "chat", "status": {"type": "idle"}}),
        )
        .await;
    assert!(activity.change(main).await.is_ok());
}
