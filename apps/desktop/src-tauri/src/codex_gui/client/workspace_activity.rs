use super::Client;
use crate::codex_gui::{
    error::{GuiError, Result},
    workspace_activity::{admits_work, WorkspaceKey, WorkspaceRequest},
};
use serde_json::{json, Value};

impl Client {
    pub(super) async fn reserve_workspace(
        &self,
        request: WorkspaceRequest<'_>,
        workspace: Option<WorkspaceKey>,
    ) -> Result<()> {
        self.workspaces
            .begin(&self.notification_session, request, workspace)
            .await?;
        if !self.alive.load(std::sync::atomic::Ordering::Acquire) {
            self.workspaces
                .response(&self.notification_session, request.id, None)
                .await;
            return Err(GuiError::Disconnected);
        }
        Ok(())
    }

    pub(super) async fn request_workspace(
        &self,
        method: &str,
        params: &Value,
    ) -> Result<Option<WorkspaceKey>> {
        if !admits_work(method, params) {
            return Ok(None);
        }
        if let Some(cwd) = params["cwd"].as_str() {
            return WorkspaceKey::from_cwd(cwd.to_owned()).await.map(Some);
        }
        let id = params["threadId"].as_str().ok_or(GuiError::Workspace)?;
        if let Some(key) = self
            .workspaces
            .workspace(&self.notification_session, id)
            .await
        {
            return Ok(Some(key));
        }
        // Resolve through the transport directly so admission does not recursively request admission.
        let response = self
            .exchange("thread/read", json!({"threadId": id}), None)
            .await?;
        let cwd = response["thread"]["cwd"]
            .as_str()
            .ok_or(GuiError::Workspace)?;
        WorkspaceKey::from_cwd(cwd.to_owned()).await.map(Some)
    }
}
