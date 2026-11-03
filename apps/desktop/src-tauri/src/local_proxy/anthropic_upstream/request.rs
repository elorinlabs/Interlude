use serde_json::{json, Value};

use super::super::CodexToolContext;
use super::{continuation, request_options};

#[derive(Debug, thiserror::Error)]
pub(super) enum ConversionError {
    #[error("A tool call contains invalid arguments")]
    InvalidToolArguments,
    #[error("An image uses an unsupported format")]
    InvalidImage,
    #[error("The request contains unsupported message content")]
    UnsupportedContent,
    #[error(transparent)]
    Detailed(super::RequestError),
    #[error("The output limit is too small for the selected thinking budget")]
    InvalidThinkingBudget,
    #[error("The output limit must be a positive integer")]
    InvalidOutputLimit,
    #[error("Forced tool use cannot be combined with thinking")]
    IncompatibleToolChoice,
}

impl ConversionError {
    pub(super) fn wire(self) -> String {
        match self {
            Self::Detailed(error) => error.wire(),
            _ => self.to_string(),
        }
    }
}

pub(super) fn convert(
    input: &Value,
    tools: &CodexToolContext,
    scope: &continuation::Scope,
) -> Result<Value, ConversionError> {
    super::super::bridge_media::validate_responses(input, false)
        .map_err(|_| ConversionError::UnsupportedContent)?;
    let mut chat_messages = Vec::new();
    if let Some(instructions) = input
        .get("instructions")
        .and_then(super::super::value_to_text)
    {
        chat_messages.push(json!({ "role": "system", "content": instructions }));
    }
    if let Some(items) = input.get("input") {
        super::super::append_input_messages(items, &mut chat_messages, tools, None);
    }
    let mut messages = Vec::new();
    let mut system = Vec::new();
    for message in chat_messages {
        let role = message["role"].as_str().unwrap_or("user");
        let mut content = message_content(&message)?;
        if matches!(role, "system" | "developer") {
            system.extend(content);
            continue;
        }
        if role == "assistant" {
            continuation::restore(scope, &mut content);
        }
        append_message(
            &mut messages,
            if role == "tool" { "user" } else { role },
            content,
        );
    }
    let mut result = json!({ "model": input["model"], "messages": messages });
    if !system.is_empty() {
        result["system"] = Value::Array(system);
    }
    request_options::apply(input, &mut result, tools);
    Ok(result)
}

fn message_content(message: &Value) -> Result<Vec<Value>, ConversionError> {
    if message["role"] == "tool" {
        let raw = &message["content"];
        let parsed = raw
            .as_str()
            .and_then(|text| serde_json::from_str::<Value>(text).ok());
        let content = match parsed.as_ref().filter(|value| is_content_array(value)) {
            Some(parts) => content_parts(parts)?,
            None => content_parts(raw)?,
        };
        return Ok(vec![
            json!({ "type": "tool_result", "tool_use_id": message["tool_call_id"],
            "content": content }),
        ]);
    }
    let mut content = content_parts(&message["content"])?;
    for call in message["tool_calls"].as_array().into_iter().flatten() {
        let arguments = call
            .pointer("/function/arguments")
            .and_then(Value::as_str)
            .unwrap_or("{}");
        let arguments: Value =
            serde_json::from_str(arguments).map_err(|_| ConversionError::InvalidToolArguments)?;
        if !arguments.is_object() {
            return Err(ConversionError::InvalidToolArguments);
        }
        content.push(json!({ "type": "tool_use", "id": call["id"],
            "name": call["function"]["name"], "input": arguments }));
    }
    Ok(content)
}

fn is_content_array(value: &Value) -> bool {
    value.as_array().is_some_and(|parts| {
        !parts.is_empty()
            && parts.iter().all(|part| {
                matches!(
                    part["type"].as_str(),
                    Some(
                        "text"
                            | "input_text"
                            | "output_text"
                            | "image_url"
                            | "input_image"
                            | "input_file"
                            | "file"
                    )
                )
            })
    })
}

fn append_message(messages: &mut Vec<Value>, role: &str, mut content: Vec<Value>) {
    if content.is_empty() {
        return;
    }
    if let Some(previous) = messages
        .last_mut()
        .filter(|message| message["role"] == role)
    {
        if let Some(parts) = previous["content"].as_array_mut() {
            parts.append(&mut content);
            return;
        }
    }
    messages.push(json!({ "role": role, "content": content }));
}

fn content_parts(value: &Value) -> Result<Vec<Value>, ConversionError> {
    match value {
        Value::Null => Ok(Vec::new()),
        Value::String(text) if text.is_empty() => Ok(Vec::new()),
        Value::String(text) => Ok(vec![json!({ "type": "text", "text": text })]),
        Value::Array(parts) => parts.iter().map(content_part).collect(),
        _ => Err(ConversionError::UnsupportedContent),
    }
}

fn content_part(part: &Value) -> Result<Value, ConversionError> {
    match part["type"].as_str() {
        Some("text" | "input_text" | "output_text") => {
            Ok(json!({ "type": "text", "text": part["text"] }))
        }
        Some("image_url" | "input_image") => image_part(part),
        Some("file") => super::super::bridge_media::chat_file_to_anthropic(part)
            .ok_or(ConversionError::UnsupportedContent),
        Some("input_file") => super::super::bridge_media::responses_to_chat(part)
            .and_then(|part| super::super::bridge_media::chat_file_to_anthropic(&part))
            .ok_or(ConversionError::UnsupportedContent),
        _ => Err(ConversionError::UnsupportedContent),
    }
}

fn image_part(part: &Value) -> Result<Value, ConversionError> {
    let url = part["image_url"]
        .as_str()
        .or_else(|| part["image_url"]["url"].as_str())
        .ok_or(ConversionError::InvalidImage)?;
    let source = if let Some(data) = url.strip_prefix("data:") {
        let (media_type, encoded) = data
            .split_once(";base64,")
            .ok_or(ConversionError::InvalidImage)?;
        if !matches!(
            media_type,
            "image/png" | "image/jpeg" | "image/gif" | "image/webp"
        ) {
            return Err(ConversionError::InvalidImage);
        }
        json!({ "type": "base64", "media_type": media_type, "data": encoded })
    } else {
        let parsed = url::Url::parse(url).map_err(|_| ConversionError::InvalidImage)?;
        if !matches!(parsed.scheme(), "https" | "http") {
            return Err(ConversionError::InvalidImage);
        }
        json!({ "type": "url", "url": url })
    };
    Ok(json!({ "type": "image", "source": source }))
}
