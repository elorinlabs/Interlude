use super::*;

async fn observed_workspace(value: &Value) -> Option<WorkspaceKey> {
    let cwd = value["thread"]["cwd"].as_str()?;
    // Missing/deleted directories remain unknown and conservatively block branch changes while active.
    WorkspaceKey::from_cwd(cwd.to_owned()).await.ok()
}

impl WorkspaceActivity {
    /// Apply replies before waking their callers; notifications can arrive before acknowledgements.
    pub(in crate::codex_gui) async fn response(
        &self,
        session: &str,
        id: u64,
        result: Option<&Value>,
    ) {
        let workspace = match result {
            Some(result) => observed_workspace(result).await,
            None => None,
        };
        let mut state = self.0.lock().await;
        let Some(session) = state.sessions.get_mut(session) else {
            return;
        };
        session.response(id, result, workspace);
    }

    pub(in crate::codex_gui) async fn event(&self, session: &str, method: &str, params: &Value) {
        if !matches!(
            method,
            "thread/started"
                | "turn/started"
                | "turn/completed"
                | "thread/goal/updated"
                | "thread/goal/cleared"
                | "thread/status/changed"
                | "thread/name/updated"
                | "item/started"
                | "item/completed"
        ) {
            return;
        }
        let workspace = observed_workspace(params).await;
        let id = params["threadId"]
            .as_str()
            .or(params["thread"]["id"].as_str());
        let Some(id) = id else {
            return;
        };
        let mut state = self.0.lock().await;
        let session = state.sessions.entry(session.to_owned()).or_default();
        session.event(id, method, params, workspace);
    }
}

impl Session {
    fn response(&mut self, id: u64, result: Option<&Value>, workspace: Option<WorkspaceKey>) {
        let Some(mut pending) = self.requests.remove(&id) else {
            return;
        };
        let Some(result) = result else {
            return;
        };
        let id = result["thread"]["id"]
            .as_str()
            .or(pending.thread_id.as_deref());
        let Some(id) = id else {
            return;
        };
        if pending.thread_id.as_deref() != Some(id) {
            // A fork's new thread has its own event sequence, independent of its parent.
            pending.turn_revision = 0;
            pending.goal_revision = 0;
        }
        let thread = self.threads.entry(id.to_owned()).or_default();
        thread.name = result["thread"]["name"]
            .as_str()
            .map(str::to_owned)
            .or(pending.name.take())
            .or_else(|| thread.name.take());
        thread.cwd = result["thread"]["cwd"]
            .as_str()
            .map(str::to_owned)
            .or(pending.cwd.take())
            .or_else(|| thread.cwd.take());
        if let Some(workspace) = workspace.or_else(|| pending.workspace.clone()) {
            thread.workspace = Some(workspace);
        }
        thread.apply_snapshot(result, &pending);
        if let Some(turn) = result.get("turn") {
            thread.accept_turn(turn, pending.workspace, &pending.completed);
        }
        if thread.goal_revision == pending.goal_revision {
            if let Some(goal) = result.get("goal") {
                thread.set_goal(goal["status"] == "active");
            }
        }
    }

    fn event(&mut self, id: &str, method: &str, params: &Value, workspace: Option<WorkspaceKey>) {
        if method == "turn/completed" {
            self.complete_turn(id, &params["turn"]);
            return;
        }
        let starting = self
            .requests
            .iter()
            .filter(|(_, request)| request.blocks && request.thread_id.as_deref() == Some(id))
            .max_by_key(|(id, _)| *id)
            .map(|(_, request)| request);
        let starting_workspace = starting.and_then(|request| request.workspace.clone());
        let thread = self.threads.entry(id.to_owned()).or_default();
        if let Some(cwd) = params["thread"]["cwd"].as_str() {
            thread.cwd = Some(cwd.to_owned());
        } else if method == "turn/started" {
            if let Some(cwd) = starting.and_then(|request| request.cwd.clone()) {
                thread.cwd = Some(cwd);
            }
        }
        if let Some(name) = params["thread"]["name"].as_str() {
            thread.name = Some(name.to_owned());
        }
        if workspace.is_some() {
            thread.workspace = workspace;
        }
        thread.event(method, params, starting_workspace);
    }

    fn complete_turn(&mut self, id: &str, turn: &Value) {
        let thread = self.threads.entry(id.to_owned()).or_default();
        thread.turn_revision += 1;
        thread.active_snapshot = false;
        let Some(turn_id) = turn["id"].as_str() else {
            return;
        };
        for item in turn["items"].as_array().into_iter().flatten() {
            thread.observe_files(turn_id, item);
        }
        thread.turns.remove(turn_id);
        for request in self
            .requests
            .values_mut()
            .filter(|request| request.thread_id.as_deref() == Some(id))
        {
            request.completed.insert(turn_id.to_owned());
        }
    }
}

impl Thread {
    fn event(&mut self, method: &str, params: &Value, starting_workspace: Option<WorkspaceKey>) {
        match method {
            "turn/started" => {
                self.turn_revision += 1;
                if starting_workspace.is_some() {
                    self.workspace = starting_workspace;
                }
                self.accept_turn(&params["turn"], self.workspace.clone(), &HashSet::new());
            }
            "thread/goal/updated" | "thread/goal/cleared" => {
                self.goal_revision += 1;
                self.set_goal(params["goal"]["status"] == "active");
                if self.goal_active && starting_workspace.is_some() {
                    self.workspace = starting_workspace;
                }
            }
            "thread/status/changed" => {
                if let Some(status) = params["status"]["type"].as_str() {
                    self.turn_revision += 1;
                    self.active_snapshot = status == "active";
                }
            }
            "thread/name/updated" => {
                self.name = params["threadName"].as_str().map(str::to_owned);
            }
            "item/started" | "item/completed" => {
                if let Some(turn_id) = params["turnId"].as_str() {
                    self.observe_files(turn_id, &params["item"]);
                }
            }
            _ => {}
        }
    }
}

impl Thread {
    fn set_goal(&mut self, active: bool) {
        self.goal_active = active;
        if active {
            self.goal_files.extend(
                self.turns
                    .values()
                    .flat_map(|turn| turn.files.iter().cloned()),
            );
        } else {
            self.goal_files.clear();
        }
    }

    fn accept_turn(
        &mut self,
        turn: &Value,
        workspace: Option<WorkspaceKey>,
        completed: &HashSet<String>,
    ) {
        let Some(id) = turn["id"].as_str() else {
            return;
        };
        if turn["status"] == "inProgress" && !completed.contains(id) {
            self.turns.entry(id.to_owned()).or_default().workspace =
                workspace.or_else(|| self.workspace.clone());
            for item in turn["items"].as_array().into_iter().flatten() {
                self.observe_files(id, item);
            }
        }
    }

    fn apply_snapshot(&mut self, result: &Value, pending: &Pending) {
        if self.turn_revision != pending.turn_revision {
            return;
        }
        let Some(snapshot) = result.get("thread") else {
            return;
        };
        if let Some(status) = snapshot["status"]["type"].as_str() {
            self.active_snapshot = status == "active";
        }
        if let Some(turns) = snapshot["turns"].as_array() {
            for turn in turns {
                self.accept_turn(turn, self.workspace.clone(), &pending.completed);
            }
        }
    }
}
