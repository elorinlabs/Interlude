#[cfg(test)]
use super::types::MAX_ANSWER_CHARS;
use super::types::{HelpError, Result};
use crate::codex_config::{
    HELP_ACCOUNT_REVISION_HEADER, HELP_REQUEST_PURPOSE, LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER,
    LOCAL_PROXY_REQUEST_PURPOSE_HEADER, LOCAL_PROXY_TOKEN,
};
use serde_json::Value;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[cfg(test)]
pub(super) async fn answer(base_url: &str, body: Value, revision: u64) -> Result<String> {
    completed_text(&response_streaming(base_url, body, revision, &mut |_| {}).await?)
}

#[cfg(test)]
pub(super) async fn answer_streaming(
    base_url: &str,
    body: Value,
    revision: u64,
    progress: &mut (impl FnMut(&str) + Send),
) -> Result<String> {
    completed_text(&response_streaming(base_url, body, revision, progress).await?)
}

pub(super) async fn response_streaming(
    base_url: &str,
    body: Value,
    revision: u64,
    progress: &mut (impl FnMut(&str) + Send),
) -> Result<Value> {
    tokio::time::timeout(REQUEST_TIMEOUT, request(base_url, body, revision, progress))
        .await
        .map_err(|_| HelpError::AnswerFailed)?
}

async fn request(
    base_url: &str,
    body: Value,
    revision: u64,
    progress: &mut (impl FnMut(&str) + Send),
) -> Result<Value> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| HelpError::AnswerFailed)?;
    let response = client
        .post(format!("{base_url}/responses"))
        .bearer_auth(LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_REQUEST_PURPOSE_HEADER, HELP_REQUEST_PURPOSE)
        .header(HELP_ACCOUNT_REVISION_HEADER, revision.to_string())
        .header("originator", crate::codex_gui::identity::CLI_ORIGINATOR)
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| HelpError::AnswerFailed)?;
    read_response(response, progress).await
}

async fn read_response(
    mut response: reqwest::Response,
    progress: &mut impl FnMut(&str),
) -> Result<Value> {
    let success = response.status().is_success();
    let mut bytes = Vec::new();
    let mut stream = super::streaming::AnswerStream::default();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| HelpError::AnswerFailed)?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(HelpError::AnswerFailed);
        }
        bytes.extend_from_slice(&chunk);
        if success {
            stream.push(&chunk, progress)?;
        }
    }
    if !success {
        return Err(serde_json::from_slice::<Value>(&bytes)
            .ok()
            .map(|value| response_error(&value))
            .unwrap_or(HelpError::AnswerFailed));
    }
    parse_completion(&bytes)
}

pub(super) fn message_text(value: &Value) -> String {
    value["output"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"] == "message")
        .filter_map(|item| item["content"].as_array())
        .flatten()
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
pub(super) fn parse_response(bytes: &[u8]) -> Result<String> {
    completed_text(&parse_completion(bytes)?)
}

pub(super) fn parse_completion(bytes: &[u8]) -> Result<Value> {
    let text = std::str::from_utf8(bytes).map_err(|_| HelpError::AnswerFailed)?;
    if let Ok(response) = serde_json::from_str::<Value>(text) {
        return validate_completion(response);
    }
    for line in text.lines().filter_map(|line| line.strip_prefix("data:")) {
        if line.trim() == "[DONE]" {
            continue;
        }
        let event: Value =
            serde_json::from_str(line.trim()).map_err(|_| HelpError::AnswerFailed)?;
        match event["type"].as_str() {
            Some("response.completed") => return validate_completion(event["response"].clone()),
            Some("response.failed" | "response.incomplete") => {
                return Err(response_error(&event["response"]))
            }
            Some("error") => return Err(response_error(&event)),
            _ => {}
        }
    }
    Err(HelpError::AnswerFailed)
}

fn validate_completion(value: Value) -> Result<Value> {
    if value["status"] != "completed" || !value["output"].is_array() {
        return Err(response_error(&value));
    }
    Ok(value)
}

#[cfg(test)]
fn completed_text(value: &Value) -> Result<String> {
    if value["status"] == "failed" {
        return Err(response_error(value));
    }
    let text = message_text(value);
    if value["status"] != "completed"
        || text.trim().is_empty()
        || text.chars().count() > MAX_ANSWER_CHARS
    {
        return Err(HelpError::AnswerFailed);
    }
    Ok(text.trim().to_owned())
}

fn response_error(value: &Value) -> HelpError {
    let error = value.get("error").unwrap_or(value);
    let code = error["code"].as_str().unwrap_or_default();
    if matches!(
        code,
        "model_not_found" | "unsupported_model" | "model_not_supported" | "invalid_model"
    ) || error["param"] == "model"
    {
        HelpError::ModelUnsupported
    } else {
        HelpError::AnswerFailed
    }
}
