//! Requests only the host-created loopback GUI route; account credentials stay in the proxy.
use super::{
    error::{GuiError, Result},
    prediction::filter_suggestion,
};
use crate::codex_config::{
    LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_REQUEST_PURPOSE_HEADER, LOCAL_PROXY_TOKEN,
    PREDICTION_REQUEST_PURPOSE,
};
use serde_json::Value;
use std::time::Duration;

pub(super) const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: usize = 128 * 1024;

pub(super) async fn generate(base_url: &str, body: Value) -> Result<Option<String>> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| GuiError::Rpc)?;
    let mut response = client
        .post(format!("{base_url}/responses"))
        .bearer_auth(LOCAL_PROXY_TOKEN)
        .header(LOCAL_PROXY_ACTOR_AUTHORIZATION_HEADER, LOCAL_PROXY_TOKEN)
        .header(
            LOCAL_PROXY_REQUEST_PURPOSE_HEADER,
            PREDICTION_REQUEST_PURPOSE,
        )
        .header("originator", super::identity::CLI_ORIGINATOR)
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|_| GuiError::Rpc)?;
    if !response.status().is_success() {
        return Err(GuiError::Rpc);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| GuiError::Rpc)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(GuiError::Rpc);
        }
        bytes.extend_from_slice(&chunk);
    }
    parse_response(&bytes)
}

fn message_text(value: &Value) -> String {
    value["output"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"] == "message")
        .filter_map(|item| item["content"].as_array())
        .flatten()
        .filter(|part| part["type"] == "output_text")
        .filter_map(|part| part["text"].as_str())
        .collect()
}

pub(super) fn parse_response(bytes: &[u8]) -> Result<Option<String>> {
    let text = std::str::from_utf8(bytes).map_err(|_| GuiError::Rpc)?;
    let mut output = String::new();
    let mut completed = false;
    for line in text.lines().filter_map(|line| line.strip_prefix("data:")) {
        if line.trim() == "[DONE]" {
            continue;
        }
        let event: Value = serde_json::from_str(line.trim()).map_err(|_| GuiError::Rpc)?;
        match event["type"].as_str() {
            Some("response.output_text.done") => {
                output = event["text"].as_str().unwrap_or_default().into()
            }
            Some("response.completed") => {
                completed = event["response"]["status"] == "completed";
                let final_text = message_text(&event["response"]);
                if !final_text.is_empty() {
                    output = final_text;
                }
            }
            Some("response.failed" | "response.incomplete" | "error") => return Err(GuiError::Rpc),
            _ => {}
        }
    }
    if !completed {
        return Err(GuiError::Rpc);
    }
    Ok(filter_suggestion(&output))
}
