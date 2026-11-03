use super::{GitError, Result};
use crate::codex_config::{
    GIT_MESSAGE_REQUEST_PURPOSE, HELP_ACCOUNT_REVISION_HEADER,
    LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_REQUEST_PURPOSE_HEADER, LOCAL_PROXY_TOKEN,
};
use serde_json::Value;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_RESPONSE_BYTES: usize = 256 * 1024;
const MAX_MESSAGE_CHARS: usize = 4000;

pub(super) async fn generate(base_url: &str, body: Value, revision: u64) -> Result<String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| GitError::MessageGeneration)?;
    let mut response = client
        .post(format!("{base_url}/responses"))
        .bearer_auth(LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_TOKEN)
        .header(
            LOCAL_PROXY_REQUEST_PURPOSE_HEADER,
            GIT_MESSAGE_REQUEST_PURPOSE,
        )
        .header(HELP_ACCOUNT_REVISION_HEADER, revision.to_string())
        .header("originator", crate::codex_gui::identity::CLI_ORIGINATOR)
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| GitError::MessageGeneration)?;
    if !response.status().is_success() {
        return Err(GitError::MessageGeneration);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| GitError::MessageGeneration)?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(GitError::MessageGeneration);
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_response(&bytes)
}

pub(super) fn parse_response(bytes: &[u8]) -> Result<String> {
    let text = std::str::from_utf8(bytes).map_err(|_| GitError::MessageGeneration)?;
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        return completed_text(&value);
    }
    let mut completed = None;
    for line in text.lines().filter_map(|line| line.strip_prefix("data:")) {
        if line.trim() == "[DONE]" {
            continue;
        }
        let event: Value =
            serde_json::from_str(line.trim()).map_err(|_| GitError::MessageGeneration)?;
        match event["type"].as_str() {
            Some("response.completed") => completed = Some(completed_text(&event["response"])?),
            Some("response.failed" | "response.incomplete" | "error") => {
                return Err(GitError::MessageGeneration)
            }
            _ => {}
        }
    }
    completed.ok_or(GitError::MessageGeneration)
}

fn completed_text(value: &Value) -> Result<String> {
    if value["status"] != "completed" {
        return Err(GitError::MessageGeneration);
    }
    let text = value["output"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"] == "message")
        .filter_map(|item| item["content"].as_array())
        .flatten()
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let text = text.trim();
    if text.is_empty()
        || text.encode_utf16().count() > MAX_MESSAGE_CHARS
        || text.contains("```")
        || text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(GitError::MessageGeneration);
    }
    Ok(text.to_owned())
}
