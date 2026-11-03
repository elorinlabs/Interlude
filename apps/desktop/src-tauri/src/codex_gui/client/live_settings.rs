use super::Client;
use crate::codex_gui::model_settings::{LiveModelUpdate, ModelSelection};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum UpdateStatus {
    Applied,
    TargetUnavailable,
}

#[derive(Deserialize)]
struct UpdateResponse {
    status: UpdateStatus,
}

impl Client {
    pub(super) async fn track_live_turn(&self, event: &super::GuiEvent) {
        let Some(id) = event.params["turn"]["id"].as_str() else {
            return;
        };
        let mut active = self.active_turns.lock().await;
        if event.method == "turn/completed" {
            active.retain(|_, turn_id| turn_id != id);
        } else if let Some(thread_id) = event.params["threadId"].as_str() {
            active.insert(thread_id.to_owned(), id.to_owned());
        }
    }

    /// Update the next inference step without restarting the task or changing child sessions.
    pub(in crate::codex_gui) async fn update_live_model(
        &self,
        thread_id: &str,
        selection: &ModelSelection,
    ) -> LiveModelUpdate {
        let context = self.context_capacity.thread(thread_id).await;
        let _guard = context.applied.lock().await;
        let turn_id = self.active_turns.lock().await.get(thread_id).cloned();
        let Some(turn_id) = turn_id else {
            return LiveModelUpdate::NextTurn;
        };
        // Goals may start another turn without a frontend send; keep their defaults in sync too.
        if self
            .request_raw(
                "thread/settings/update",
                json!({
                    "threadId": thread_id, "model": selection.model, "effort": selection.effort,
                }),
            )
            .await
            .is_err()
        {
            return LiveModelUpdate::Failed;
        }
        let result = self
            .request_raw(
                "turn/settings/update",
                json!({
                    "threadId": thread_id, "turnId": turn_id,
                    "model": selection.model, "effort": selection.effort,
                }),
            )
            .await;
        match result {
            Ok(value) => publication_result(value),
            // Older CLIs may reject this experimental operation; do not claim it took effect.
            Err(_) => LiveModelUpdate::Failed,
        }
    }
}

fn publication_result(value: serde_json::Value) -> LiveModelUpdate {
    match serde_json::from_value::<UpdateResponse>(value) {
        Ok(UpdateResponse {
            status: UpdateStatus::Applied,
        }) => LiveModelUpdate::Applied,
        Ok(UpdateResponse {
            status: UpdateStatus::TargetUnavailable,
        }) => LiveModelUpdate::NextTurn,
        Err(_) => LiveModelUpdate::Failed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_acknowledged_updates_are_reported_as_applied() {
        assert!(matches!(
            publication_result(json!({"status": "applied"})),
            LiveModelUpdate::Applied
        ));
        assert!(matches!(
            publication_result(json!({"status": "targetUnavailable"})),
            LiveModelUpdate::NextTurn
        ));
        for value in [json!({}), json!({"status": "unknown"}), json!(null)] {
            assert!(matches!(publication_result(value), LiveModelUpdate::Failed));
        }
    }
}
