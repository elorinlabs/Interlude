//! Build the same selected working-tree snapshot that a commit would stage, without publishing it.
use super::{changes, commit, history, GitError, Result, SelectedFile};
use serde_json::json;
use std::path::Path;

const MAX_DIFF_BYTES: u64 = 96 * 1024;
const MAX_FILE_LIST_BYTES: usize = 32 * 1024;

pub(super) fn validate(
    root: &Path,
    head: Option<&str>,
    files: &[SelectedFile],
) -> Result<Vec<String>> {
    commit::require_idle(root)?;
    let current = changes::read(root)?;
    if current.head.as_deref() != head {
        return Err(GitError::Changed);
    }
    if current.files.iter().any(|file| file.conflict) {
        return Err(GitError::Conflict);
    }
    commit::selected_paths(&current, files)
}

pub(super) fn collect(root: &Path, head: Option<&str>, files: &[SelectedFile]) -> Result<String> {
    let paths = validate(root, head, files)?;
    let file_list = serde_json::to_string(&paths).map_err(|_| GitError::MessageGeneration)?;
    if file_list.len() > MAX_FILE_LIST_BYTES {
        return Err(GitError::MessageSize);
    }
    let transaction = commit::IndexTransaction::new(root)?;
    commit::stage(&transaction, root, &paths)?;
    let mut command = transaction.command(root);
    command.args([
        "--no-pager",
        "diff",
        "--cached",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--find-renames",
    ]);
    if let Some(head) = head {
        command.arg(head);
    }
    command.arg("--").args(&paths);
    let (bytes, truncated) = history::bounded_command(command, MAX_DIFF_BYTES, false)?;
    validate(root, head, files)?;
    Ok(json!({
        "selectedFiles": paths,
        "diff": String::from_utf8_lossy(&bytes),
        "diffTruncated": truncated,
    })
    .to_string())
}
