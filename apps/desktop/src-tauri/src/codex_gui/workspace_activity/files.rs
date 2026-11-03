use super::*;
use std::{
    collections::BTreeSet,
    path::{Component, Path, PathBuf},
};

fn normalized(path: &Path) -> String {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            component => result.push(component.as_os_str()),
        }
    }
    comparable_path(&result.to_string_lossy())
}

fn item_paths(item: &Value) -> impl Iterator<Item = String> + '_ {
    item["changes"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|change| {
            [change["path"].as_str(), change["kind"]["movePath"].as_str()]
                .into_iter()
                .flatten()
                .filter(|path| !path.is_empty())
                .map(str::to_owned)
        })
}

impl Thread {
    pub(super) fn observe_files(&mut self, turn_id: &str, item: &Value) {
        if item["type"] != "fileChange" {
            return;
        }
        let Some(turn) = self.turns.get_mut(turn_id) else {
            return;
        };
        turn.files.extend(item_paths(item));
        if self.goal_active {
            self.goal_files.extend(turn.files.iter().cloned());
        }
    }

    pub(super) fn file_paths(&self) -> HashSet<String> {
        let cwd = self
            .cwd
            .as_deref()
            .or_else(|| self.workspace.as_ref().map(|key| key.0.as_str()));
        let paths = self
            .turns
            .values()
            .flat_map(|turn| &turn.files)
            .chain(self.goal_files.iter().filter(|_| self.goal_active));
        paths
            .filter_map(|path| {
                let path = Path::new(path);
                if path.is_absolute() {
                    return Some(normalized(path));
                }
                cwd.map(|cwd| normalized(&Path::new(cwd).join(path)))
            })
            .collect()
    }
}

impl WorkspaceActivity {
    /// Admit a selected-file operation without treating unrelated active tasks as file owners.
    /// Call after resolving the full selection (including rename sources) on a blocking worker.
    pub(in crate::codex_gui) async fn change_files(
        &self,
        key: WorkspaceKey,
        paths: &[String],
    ) -> Result<WorkspaceChange> {
        let selected: Vec<_> = paths
            .iter()
            .map(|path| (path, normalized(&Path::new(&key.0).join(path))))
            .collect();
        let mut state = self.0.lock().await;
        state
            .changes
            .retain(|_, active| active.load(Ordering::Acquire));
        if state.changes.contains_key(&key) {
            return Err(GuiError::WorkspaceBusy);
        }
        let details = file_conflicts(&state, &selected);
        if !details.is_empty() {
            return Err(GuiError::WorkspaceConflict(Conflict {
                code: "client.gitActivity.filesBusy",
                details,
            }));
        }
        // Keep branch changes and new submissions out of the short Git mutation transaction.
        let active = Arc::new(AtomicBool::new(true));
        state.changes.insert(key, Arc::clone(&active));
        Ok(WorkspaceChange(active))
    }
}

fn file_conflicts(state: &Activity, selected: &[(&String, String)]) -> String {
    let mut details = BTreeSet::new();
    for (id, thread) in state.sessions.values().flat_map(|session| &session.threads) {
        let files = thread.file_paths();
        for (path, absolute) in selected {
            if files.contains(absolute) {
                details.insert(format!("{} → {path}", thread.label(id)));
            }
        }
    }
    details.into_iter().collect::<Vec<_>>().join("\n")
}
