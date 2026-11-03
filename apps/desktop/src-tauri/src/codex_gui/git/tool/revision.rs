//! Revision mutations validate the confirmation snapshot before invoking Git without a shell.
use super::super::{command_options, output};
use super::{changes, commit, commit_files, GitError, Result, SelectedFile};
use serde::Deserialize;
use std::{path::Path, process::Stdio};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ResetMode {
    Soft,
    Mixed,
    Hard,
    Keep,
}

impl ResetMode {
    fn argument(&self) -> &'static str {
        match self {
            Self::Soft => "--soft",
            Self::Mixed => "--mixed",
            Self::Hard => "--hard",
            Self::Keep => "--keep",
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum Action {
    Checkout,
    Reset { mode: ResetMode },
}

#[derive(Deserialize)]
pub(crate) struct Request {
    #[serde(flatten)]
    action: Action,
    commit: String,
    head: Option<String>,
    branch: Option<String>,
    files: Vec<SelectedFile>,
}

pub(super) fn validate_commit(root: &Path, hash: &str) -> Result<()> {
    commit_files::validate_commit(hash)?;
    if output(root, &["cat-file", "-t", hash])? != "commit" {
        return Err(GitError::File);
    }
    Ok(())
}

fn check_snapshot(root: &Path, request: &Request) -> Result<()> {
    let current = changes::read(root)?;
    if current.head != request.head
        || current.branch != request.branch
        || current.files.len() != request.files.len()
        || current.files.iter().any(|file| {
            !request
                .files
                .iter()
                .any(|selected| selected.path == file.path && selected.version == file.version)
        })
    {
        return Err(GitError::RevisionChanged);
    }
    if current.files.iter().any(|file| file.conflict) {
        return Err(GitError::Conflict);
    }
    Ok(())
}

pub(super) fn execute(root: &Path, request: &Request) -> Result<()> {
    validate_commit(root, &request.commit)?;
    commit::require_idle(root)?;
    check_snapshot(root, request)?;
    let args = match &request.action {
        Action::Checkout => vec![
            "switch",
            "--detach",
            "--no-overwrite-ignore",
            &request.commit,
        ],
        Action::Reset { mode } => {
            if request.branch.is_none() {
                return Err(GitError::DetachedReset);
            }
            vec!["reset", mode.argument(), &request.commit, "--"]
        }
    };
    let status = command_options(root, false)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| GitError::Unavailable)?;
    if status.success() {
        return Ok(());
    }
    Err(match request.action {
        Action::Checkout => GitError::RevisionCheckout,
        Action::Reset { .. } => GitError::Reset,
    })
}
