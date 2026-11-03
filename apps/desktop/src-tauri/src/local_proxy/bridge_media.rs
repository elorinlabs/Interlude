//! Preserve supported media blocks and reject formats a bridge cannot represent.

use serde_json::{json, Value};

pub(super) fn responses_to_chat(part: &Value) -> Option<Value> {
    match part["type"].as_str()? {
        "input_file" => {
            let mut file = serde_json::Map::new();
            for field in ["file_id", "file_data", "file_url", "filename"] {
                if let Some(value) = part.get(field) {
                    file.insert(field.to_string(), value.clone());
                }
            }
            Some(json!({ "type": "file", "file": file }))
        }
        "input_audio" => Some(json!({ "type": "input_audio", "input_audio": part["input_audio"] })),
        _ => None,
    }
}

pub(super) fn validate_responses(input: &Value, allow_audio: bool) -> Result<(), String> {
    match input {
        Value::Array(items) => {
            for item in items {
                validate_responses(item, allow_audio)?;
            }
        }
        Value::Object(object) => {
            validate_response_part(input, allow_audio)?;
            // Tool payloads are data, not declarations; inspect only protocol content arrays.
            for key in ["input", "content", "output"] {
                if let Some(value) = object
                    .get(key)
                    .filter(|value| value.is_array() || value.is_object())
                {
                    validate_responses(value, allow_audio)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_response_part(part: &Value, allow_audio: bool) -> Result<(), String> {
    let valid = match part["type"].as_str() {
        Some("input_file") => {
            let fields: &[&str] = if allow_audio {
                &["file_data", "file_id"]
            } else {
                &["file_data", "file_url"]
            };
            fields
                .iter()
                .any(|key| part[*key].as_str().is_some_and(|value| !value.is_empty()))
        }
        Some("input_audio") => {
            allow_audio
                && part["input_audio"]["data"].is_string()
                && matches!(part["input_audio"]["format"].as_str(), Some("wav" | "mp3"))
        }
        Some("input_image") => {
            part["image_url"].is_string() || part["image_url"]["url"].is_string()
        }
        Some("input_video" | "video") => false,
        _ => true,
    };
    if valid {
        Ok(())
    } else {
        Err("The selected service cannot read this attachment format".into())
    }
}

pub(super) fn chat_file_to_anthropic(part: &Value) -> Option<Value> {
    let file = part.get("file")?;
    let source = if let Some(url) = file["file_url"].as_str() {
        let parsed = url::Url::parse(url).ok()?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return None;
        }
        json!({ "type": "url", "url": url })
    } else {
        let data = file["file_data"].as_str()?;
        let encoded = data.strip_prefix("data:application/pdf;base64,")?;
        json!({ "type": "base64", "media_type": "application/pdf", "data": encoded })
    };
    let mut document = json!({ "type": "document", "source": source });
    if let Some(filename) = file["filename"].as_str() {
        document["title"] = json!(filename);
    }
    Some(document)
}

pub(super) fn anthropic_document(part: &Value) -> Option<Value> {
    let source = part.get("source")?;
    let filename = part["title"].as_str().unwrap_or("document.pdf");
    match source["type"].as_str()? {
        "url" => Some(
            json!({ "type": "input_file", "file_url": source.get("url")?.as_str()?,
            "filename": filename }),
        ),
        "base64" if source["media_type"] == "application/pdf" => {
            Some(json!({ "type": "input_file",
            "file_data": format!("data:application/pdf;base64,{}", source.get("data")?.as_str()?),
            "filename": filename }))
        }
        "text" => Some(json!({ "type": "input_text", "text": source.get("data")?.as_str()? })),
        _ => None,
    }
}

pub(super) fn validate_anthropic(request: &Value) -> Result<(), String> {
    match request {
        Value::Array(parts) => {
            for part in parts {
                validate_anthropic(part)?;
            }
        }
        Value::Object(object) => {
            if (request["type"] == "document" && anthropic_document(request).is_none())
                || matches!(request["type"].as_str(), Some("audio" | "video"))
            {
                return Err("The selected service cannot read this attachment format".into());
            }
            for key in ["messages", "content"] {
                if let Some(value) = object.get(key) {
                    validate_anthropic(value)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn documents_and_audio_keep_their_content_across_the_supported_bridges() {
        let document = json!({"type":"document", "title":"report.pdf", "source": {
            "type":"base64", "media_type":"application/pdf", "data":"JVBERi0="}});
        let response = anthropic_document(&document).unwrap();
        let chat = responses_to_chat(&response).unwrap();
        assert_eq!(
            chat["file"]["file_data"],
            "data:application/pdf;base64,JVBERi0="
        );
        assert_eq!(chat_file_to_anthropic(&chat).unwrap(), document);
        let audio = json!({"type":"input_audio", "input_audio":{"data":"AAAA", "format":"wav"}});
        assert_eq!(responses_to_chat(&audio).unwrap(), audio);
        assert!(validate_responses(&audio, true).is_ok());
        assert!(validate_responses(&audio, false).is_err());
    }

    #[test]
    fn unsupported_media_is_rejected_before_a_bridge_can_drop_it() {
        for part in [
            json!({"type":"input_image", "file_id":"file-1"}),
            json!({"type":"input_video", "url":"https://example.com/movie.mp4"}),
            json!({"type":"input_file"}),
            json!({"type":"input_audio", "input_audio":{"format":"bad"}}),
        ] {
            let request = json!({"input":[{"role":"user", "content":[part]}]});
            assert!(validate_responses(&request, true).is_err());
        }
        let remote = json!({"type":"input_file", "file_url":"https://example.com/report.pdf"});
        assert!(validate_responses(&remote, true).is_err());
        assert!(validate_responses(&remote, false).is_ok());
        assert!(
            validate_anthropic(&json!({"messages":[{"content":[{"type":"document",
            "source":{"type":"file", "file_id":"file-1"}}]}]}))
            .is_err()
        );
    }

    #[test]
    fn regular_and_tool_content_both_preserve_file_and_audio_blocks() {
        let request = json!({"input":[{"role":"user", "content":[
            {"type":"input_text", "text":"Summarize"},
            {"type":"input_file", "filename":"report.pdf", "file_data":"data:application/pdf;base64,AAAA"},
            {"type":"input_audio", "input_audio":{"data":"BBBB", "format":"mp3"}}
        ]}]});
        let converted = super::super::responses_to_chat_completions(&request);
        assert_eq!(
            converted["messages"][0]["content"][1]["file"]["filename"],
            "report.pdf"
        );
        assert_eq!(
            converted["messages"][0]["content"][2]["input_audio"]["data"],
            "BBBB"
        );
        let converted = super::super::responses_to_chat_completions(&json!({"input":[
            {"type":"function_call_output", "call_id":"one", "output":[request["input"][0]["content"][1].clone()]},
            {"type":"function_call_output", "call_id":"two", "output":[request["input"][0]["content"][2].clone()]}
        ]}));
        assert_eq!(converted["messages"][0]["role"], "tool");
        assert_eq!(converted["messages"][1]["role"], "tool");
        assert_eq!(converted["messages"][2]["role"], "user");
    }
}
