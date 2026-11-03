use super::types::{HelpError, Result};
use serde_json::{json, Value};

const MAX_TOOL_TEXT_CHARS: usize = 24_000;
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_IMAGES: usize = 2;

/// Keep tool images in the model conversation; never turn returned paths into filesystem access.
pub(super) fn content(result: Value) -> Vec<Value> {
    let mut output = Vec::new();
    let mut images = 0;
    let mut text_remaining = MAX_TOOL_TEXT_CHARS;
    if result["isError"] == true {
        output.push(json!({"type": "input_text", "text": "The desktop action failed. Inspect before retrying."}));
    }
    for item in result["content"].as_array().into_iter().flatten() {
        match item["type"].as_str() {
            Some("text") if text_remaining > 0 => {
                let text: String = item["text"]
                    .as_str()
                    .unwrap_or_default()
                    .chars()
                    .take(text_remaining)
                    .collect();
                text_remaining -= text.chars().count();
                output.push(json!({"type": "input_text", "text": text}));
            }
            Some("image") if images < MAX_IMAGES => {
                if let Some(image) = image_content(item) {
                    output.push(image);
                    images += 1;
                }
            }
            _ => {}
        }
    }
    if output.is_empty() {
        output.push(json!({"type": "input_text", "text": "No supported content was returned by the desktop tool."}));
    }
    output
}

fn image_content(item: &Value) -> Option<Value> {
    let mime = item["mimeType"].as_str()?;
    let data = item["data"].as_str()?;
    if !matches!(mime, "image/png" | "image/jpeg" | "image/webp") || data.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some(json!({"type": "input_image", "image_url": format!("data:{mime};base64,{data}")}))
}

pub(super) fn append(body: &mut Value, output: Vec<Value>) -> Result<()> {
    let input = body["input"]
        .as_array_mut()
        .ok_or(HelpError::AnswerFailed)?;
    // Only the latest two tool results retain screenshots; prior text and call IDs stay intact.
    let mut recent = 0;
    for item in input
        .iter_mut()
        .rev()
        .filter(|item| item["type"] == "function_call_output")
    {
        recent += 1;
        if recent < 2 {
            continue;
        }
        if let Some(parts) = item["output"].as_array_mut() {
            parts.retain(|part| part["type"] != "input_image");
            if parts.is_empty() {
                parts.push(json!({"type": "input_text", "text": "Earlier screenshot omitted."}));
            }
        }
    }
    input.extend(output);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn returns_images_and_errors_without_loading_file_paths() {
        let result = content(json!({"isError": true, "content": [
            {"type": "text", "text": "Window unavailable"},
            {"type": "image", "mimeType": "image/png", "data": "dGVzdA=="},
            {"type": "resource_link", "uri": "file:///private/key"}]}));
        assert_eq!(result.len(), 3);
        assert_eq!(result[2]["image_url"], "data:image/png;base64,dGVzdA==");
        assert!(!serde_json::to_string(&result).unwrap().contains("private"));
    }
    #[test]
    fn trims_only_old_tool_images_and_preserves_call_pairing() {
        let mut body = json!({"input": [
            {"type": "function_call_output", "call_id": "old", "output": [{"type": "input_image"}]},
            {"type": "function_call_output", "call_id": "new", "output": [{"type": "input_image"}]}]});
        append(
            &mut body,
            vec![json!({"type": "function_call", "call_id": "next"})],
        )
        .unwrap();
        assert_eq!(body["input"][0]["call_id"], "old");
        assert_eq!(body["input"][0]["output"][0]["type"], "input_text");
        assert_eq!(body["input"][1]["output"][0]["type"], "input_image");
    }
}
