use super::types::{HelpError, Result, MAX_ANSWER_CHARS};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::AppHandle;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(50);

pub(super) fn activity(app: &AppHandle, request_id: Option<&str>, activity: Option<&str>) {
    if let Some(request_id) = request_id {
        crate::codex_gui::web::publish(
            app,
            "remote-ai-help-activity",
            serde_json::json!({"requestId": request_id, "activity": activity}),
        );
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HelpProgress<'a> {
    request_id: &'a str,
    text: &'a str,
}

pub(super) fn publisher(app: AppHandle, request_id: Option<String>) -> impl FnMut(&str) {
    let mut last_update: Option<Instant> = None;
    move |text| {
        let Some(request_id) = request_id.as_deref() else {
            return;
        };
        if last_update.is_some_and(|time| time.elapsed() < PROGRESS_INTERVAL) {
            return;
        }
        last_update = Some(Instant::now());
        crate::codex_gui::web::publish(
            &app,
            "remote-ai-help-progress",
            HelpProgress { request_id, text },
        );
    }
}

/// Decode only complete SSE lines so network chunks can split JSON or UTF-8 characters.
#[derive(Default)]
pub(super) struct AnswerStream {
    pending: Vec<u8>,
    text: String,
    characters: usize,
}

impl AnswerStream {
    pub(super) fn push(&mut self, chunk: &[u8], progress: &mut impl FnMut(&str)) -> Result<()> {
        self.pending.extend_from_slice(chunk);
        let previous_length = self.text.len();
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<_> = self.pending.drain(..=end).collect();
            self.line(&line)?;
        }
        if self.text.len() != previous_length {
            progress(&self.text);
        }
        Ok(())
    }

    fn line(&mut self, bytes: &[u8]) -> Result<()> {
        let line = std::str::from_utf8(bytes).map_err(|_| HelpError::AnswerFailed)?;
        let Some(data) = line.strip_prefix("data:") else {
            return Ok(());
        };
        if data.trim() == "[DONE]" {
            return Ok(());
        }
        let event: Value =
            serde_json::from_str(data.trim()).map_err(|_| HelpError::AnswerFailed)?;
        if event["type"] != "response.output_text.delta" {
            return Ok(());
        }
        let delta = event["delta"].as_str().ok_or(HelpError::AnswerFailed)?;
        self.characters = self.characters.saturating_add(delta.chars().count());
        if self.characters > MAX_ANSWER_CHARS {
            return Err(HelpError::AnswerFailed);
        }
        self.text.push_str(delta);
        Ok(())
    }
}
