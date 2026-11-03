use serde_json::{json, Value};

use super::{continuation, request::ConversionError};
use super::{Problem, RequestError, Stage};

pub(super) fn to_chat(
    value: &Value,
    scope: &continuation::Scope,
) -> Result<Value, ConversionError> {
    if value.get("error").is_some() {
        return Err(ConversionError::Detailed(
            crate::local_proxy::request_error::upstream(Stage::Anthropic, value),
        ));
    }
    let content = value["content"]
        .as_array()
        .ok_or(ConversionError::Detailed(RequestError::new(
            Stage::Anthropic,
            Problem::MissingContent,
        )))?;
    let stop = value["stop_reason"]
        .as_str()
        .ok_or(ConversionError::Detailed(RequestError::new(
            Stage::Anthropic,
            Problem::MissingStopReason,
        )))?;
    let mut text = String::new();
    let mut reasoning = String::new();
    let mut calls = Vec::new();
    for block in content {
        match block["type"].as_str() {
            Some("text") => text.push_str(block["text"].as_str().unwrap_or_default()),
            Some("thinking") => reasoning.push_str(block["thinking"].as_str().unwrap_or_default()),
            Some("redacted_thinking") => {}
            Some("tool_use") => calls.push(tool_call(block)?),
            _ => {
                return Err(ConversionError::Detailed(RequestError::new(
                    Stage::Anthropic,
                    Problem::UnsupportedResponseContent,
                )))
            }
        }
    }
    if matches!(stop, "end_turn" | "stop_sequence" | "tool_use") {
        continuation::capture(scope, content);
    }
    Ok(
        json!({ "id": value["id"], "model": value["model"], "choices": [{ "index": 0,
        "message": { "role": "assistant", "content": text, "reasoning_content": reasoning,
            "tool_calls": calls }, "finish_reason": finish_reason(stop) }],
        "usage": chat_usage(&value["usage"]) }),
    )
}

pub(super) fn tool_call(block: &Value) -> Result<Value, ConversionError> {
    if !block["input"].is_object()
        || block["id"].as_str().is_none()
        || block["name"].as_str().is_none()
    {
        return Err(ConversionError::Detailed(RequestError::new(
            Stage::Anthropic,
            Problem::InvalidTool,
        )));
    }
    Ok(json!({ "id": block["id"], "type": "function", "function": {
        "name": block["name"], "arguments": block["input"].to_string()
    } }))
}

pub(super) fn finish_reason(reason: &str) -> &'static str {
    match reason {
        "end_turn" | "stop_sequence" => "stop",
        "tool_use" => "tool_calls",
        "max_tokens" | "model_context_window_exceeded" => "length",
        "refusal" => "content_filter",
        _ => "error",
    }
}

/// A buffered response still needs the full incremental Responses event sequence.
pub(super) fn single_chunk(chat: &Value) -> Value {
    let mut delta = chat["choices"][0]["message"].clone();
    if let Some(calls) = delta["tool_calls"].as_array_mut() {
        for (index, call) in calls.iter_mut().enumerate() {
            call["index"] = json!(index);
        }
    }
    json!({ "id": chat["id"], "model": chat["model"], "usage": chat["usage"],
        "choices": [{ "index": 0, "delta": delta, "finish_reason": chat["choices"][0]["finish_reason"] }] })
}

pub(super) fn chat_usage(usage: &Value) -> Value {
    if !usage.is_object() {
        return Value::Null;
    }
    let cached = usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
    let created = usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
    let input = usage["input_tokens"]
        .as_u64()
        .unwrap_or(0)
        .saturating_add(cached)
        .saturating_add(created);
    let output = usage["output_tokens"].as_u64().unwrap_or(0);
    json!({ "prompt_tokens": input, "completion_tokens": output,
        "total_tokens": input.saturating_add(output), "prompt_tokens_details": { "cached_tokens": cached } })
}
