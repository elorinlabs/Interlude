use super::Client;
use crate::codex_gui::{error::GuiError, protocol::GuiResponse};

impl Client {
    pub(in crate::codex_gui) async fn coze_catalog(&self) -> Result<GuiResponse, GuiError> {
        let entries = crate::coze::catalog::list(self.app.clone())
            .await
            .map_err(|error| {
                eprintln!("Coze catalog: {error}");
                GuiError::CozeUnavailable
            })?;
        Ok(GuiResponse {
            data: serde_json::json!(entries),
        })
    }
}
