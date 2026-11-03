//! Apply model defaults at conversation boundaries without interrupting active work.
use super::Client;
use crate::codex_gui::{
    context_settings::{self, ContextSettings},
    error::{GuiError, Result},
    model_context,
};
use serde_json::{json, Value};

fn selected_model(params: &Value) -> Option<&str> {
    params
        .pointer("/collaborationMode/settings/model")
        .and_then(Value::as_str)
        .or_else(|| params["model"].as_str())
}

impl Client {
    pub(super) async fn effective_context(
        &self,
        settings: &ContextSettings,
        params: &Value,
    ) -> Result<ContextSettings> {
        if settings.capacity.is_some() {
            return Ok(settings.clone());
        }
        let Some(model) = selected_model(params) else {
            return Ok(settings.clone());
        };
        let capacity = model_context::capacity(self.app.clone(), model.to_owned())
            .await
            .map_err(|_| GuiError::ContextSettings)?;
        Ok(ContextSettings { capacity })
    }

    pub(super) async fn context_model_params(&self, id: &str, params: &Value) -> Result<Value> {
        if let Some(model) = selected_model(params) {
            return Ok(json!({"model": model}));
        }
        let mut request = json!({"threadId": id, "excludeTurns": true});
        crate::codex_gui::home::scope_thread_request("thread/resume", &mut request);
        self.request_raw("thread/resume", request).await
    }

    pub(super) async fn start_with_context(&self, mut params: Value) -> Result<Value> {
        let settings = self
            .effective_context(&ContextSettings::default(), &params)
            .await?;
        // Explicit caller configuration remains a conversation override.
        if params.pointer("/config/model_context_window").is_none() {
            context_settings::apply_capacity(&mut params, &settings);
        }
        let result = self.request_raw("thread/start", params).await?;
        if let Some(id) = result.pointer("/thread/id").and_then(Value::as_str) {
            *self.context_capacity.thread(id).await.applied.lock().await = settings;
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collaboration_model_takes_precedence_and_missing_models_are_not_guessed() {
        assert_eq!(
            selected_model(&json!({"model": "base",
            "collaborationMode": {"settings": {"model": "plan"}}})),
            Some("plan")
        );
        assert_eq!(selected_model(&json!({"model": "base"})), Some("base"));
        assert_eq!(selected_model(&json!({})), None);
    }
}
