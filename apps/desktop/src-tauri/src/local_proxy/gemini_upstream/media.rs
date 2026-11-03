use super::BridgeError;
use base64::Engine;
use serde_json::{json, Value};

pub(super) fn parts(value: &Value) -> Result<Vec<Value>, BridgeError> {
    match value {
        Value::Null => Ok(Vec::new()),
        Value::String(text) => Ok(vec![json!({ "text": text })]),
        Value::Array(values) => values.iter().map(part).collect(),
        Value::Object(_) => part(value).map(|part| vec![part]),
        _ => Err(BridgeError::UnsupportedContent),
    }
}

fn part(value: &Value) -> Result<Value, BridgeError> {
    match value["type"].as_str() {
        Some("input_text" | "output_text" | "text") => {
            let text = value["text"]
                .as_str()
                .ok_or(BridgeError::UnsupportedContent)?;
            Ok(json!({ "text": text }))
        }
        Some("input_image" | "image_url") => {
            let url = value["image_url"]
                .as_str()
                .or_else(|| value["image_url"]["url"].as_str())
                .ok_or(BridgeError::InvalidMedia)?;
            media_uri(url, None)
        }
        Some("input_file") => file(value),
        Some("file") => file(&value["file"]),
        Some("input_audio") => audio(value),
        _ => Err(BridgeError::UnsupportedContent),
    }
}

fn file(value: &Value) -> Result<Value, BridgeError> {
    let mime = value["mime_type"]
        .as_str()
        .or_else(|| value["filename"].as_str().and_then(mime_for_path));
    if let Some(data) = value["file_data"].as_str() {
        return if data.starts_with("data:") {
            media_uri(data, mime)
        } else {
            inline(mime.ok_or(BridgeError::InvalidMedia)?, data)
        };
    }
    let uri = value["file_url"]
        .as_str()
        .ok_or(BridgeError::InvalidMedia)?;
    media_uri(uri, mime)
}

fn audio(value: &Value) -> Result<Value, BridgeError> {
    let audio = value.get("input_audio").unwrap_or(value);
    let mime = match audio["format"].as_str() {
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("ogg") => "audio/ogg",
        _ => return Err(BridgeError::InvalidMedia),
    };
    inline(
        mime,
        audio["data"].as_str().ok_or(BridgeError::InvalidMedia)?,
    )
}

fn media_uri(uri: &str, mime: Option<&str>) -> Result<Value, BridgeError> {
    if let Some(data) = uri.strip_prefix("data:") {
        let (mime, data) = data
            .split_once(";base64,")
            .ok_or(BridgeError::InvalidMedia)?;
        return inline(mime, data);
    }
    let url = ::url::Url::parse(uri).map_err(|_| BridgeError::InvalidMedia)?;
    if !matches!(url.scheme(), "https" | "http" | "gs") || url.host_str().is_none() {
        return Err(BridgeError::InvalidMedia);
    }
    let mime = mime.or_else(|| mime_for_path(url.path()));
    let mut part = json!({ "fileData": { "fileUri": uri } });
    if let Some(mime) = mime {
        if !supported_mime(mime) {
            return Err(BridgeError::InvalidMedia);
        }
        part["fileData"]["mimeType"] = json!(mime);
    }
    Ok(part)
}

fn inline(mime: &str, data: &str) -> Result<Value, BridgeError> {
    if !supported_mime(mime)
        || data.is_empty()
        || base64::engine::general_purpose::STANDARD
            .decode(data)
            .is_err()
    {
        return Err(BridgeError::InvalidMedia);
    }
    Ok(json!({ "inlineData": { "mimeType": mime, "data": data } }))
}

fn supported_mime(mime: &str) -> bool {
    matches!(
        mime,
        "image/png"
            | "image/jpeg"
            | "image/webp"
            | "image/gif"
            | "image/heic"
            | "image/heif"
            | "application/pdf"
            | "audio/wav"
            | "audio/mpeg"
            | "audio/flac"
            | "audio/ogg"
            | "video/mp4"
            | "video/webm"
            | "text/plain"
            | "text/csv"
    )
}

fn mime_for_path(path: &str) -> Option<&'static str> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "pdf" => Some("application/pdf"),
        "wav" => Some("audio/wav"),
        "mp3" => Some("audio/mpeg"),
        "mp4" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "txt" => Some("text/plain"),
        _ => None,
    }
}
