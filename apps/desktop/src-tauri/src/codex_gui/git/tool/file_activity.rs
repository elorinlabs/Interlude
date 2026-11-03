use super::{directory, file_actions, repository, GitError, Request, Result};
use crate::codex_gui::workspace_activity::{WorkspaceActivity, WorkspaceChange, WorkspaceKey};

/// Resolve renamed paths and check task ownership only after acquiring the host's Git mutation lock.
pub(super) fn reserve(
    request: &Request,
    activity: &WorkspaceActivity,
) -> Result<Option<WorkspaceChange>> {
    let Request::FileAction {
        cwd,
        head,
        action,
        files,
    } = request
    else {
        return Ok(None);
    };
    let root = repository(&directory(cwd)?)?;
    let paths = file_actions::affected_paths(&root, head.as_deref(), *action, files)?;
    let key =
        WorkspaceKey::resolve(&root.to_string_lossy()).map_err(GitError::WorkspaceActivity)?;
    tauri::async_runtime::block_on(activity.change_files(key, &paths))
        .map(Some)
        .map_err(GitError::WorkspaceActivity)
}
