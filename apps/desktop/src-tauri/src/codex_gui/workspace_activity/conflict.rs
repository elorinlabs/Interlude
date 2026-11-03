use super::{conflicts, Activity, Thread, WorkspaceKey};
use std::{collections::BTreeSet, fmt};

/// Safe, localized error data survives both Tauri's string errors and the remote RPC transport.
#[derive(Debug)]
pub(in crate::codex_gui) struct Conflict {
    pub(super) code: &'static str,
    pub(super) details: String,
}

impl fmt::Display for Conflict {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = serde_json::json!({"code": self.code, "params": {"details": self.details}});
        write!(formatter, "{value}")
    }
}

impl std::error::Error for Conflict {}

impl Conflict {
    pub(super) fn tasks(state: &Activity, key: &WorkspaceKey) -> Self {
        let mut tasks = BTreeSet::new();
        for session in state.sessions.values() {
            for (id, thread) in &session.threads {
                if thread.busy(key) {
                    tasks.insert(thread.label(id));
                }
            }
            for request in session.requests.values() {
                if !request.blocks || !conflicts(&request.workspace, key) {
                    continue;
                }
                if let Some(id) = &request.thread_id {
                    let thread = session.threads.get(id);
                    tasks.insert(thread.map_or_else(|| id.clone(), |thread| thread.label(id)));
                }
            }
        }
        Self {
            code: if tasks.is_empty() {
                "client.gitActivity.preparing"
            } else {
                "client.gitActivity.tasksBusy"
            },
            details: tasks.into_iter().collect::<Vec<_>>().join("\n"),
        }
    }
}

impl Thread {
    pub(super) fn label(&self, id: &str) -> String {
        match self.name.as_deref().filter(|name| !name.trim().is_empty()) {
            Some(name) => format!("{name} ({id})"),
            None => id.to_owned(),
        }
    }

    pub(super) fn busy(&self, key: &WorkspaceKey) -> bool {
        ((self.active_snapshot || self.goal_active) && conflicts(&self.workspace, key))
            || self
                .turns
                .values()
                .any(|turn| conflicts(&turn.workspace, key))
    }
}
