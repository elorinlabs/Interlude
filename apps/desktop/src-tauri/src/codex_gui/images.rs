use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use serde_json::{json, Value};

use super::error::{GuiError, Result};

pub(super) const MAX_IMAGES: usize = 8;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

// Clipboard and file-picker images travel inline, without granting the WebView filesystem access.
pub(super) fn input(image: String) -> Result<Value> {
    input_limited(image, MAX_IMAGE_BYTES as u64)
}

pub(super) fn input_limited(image: String, max_bytes: u64) -> Result<Value> {
    if image.starts_with("data:") {
        let (_, format) = decode_payload(&image, max_bytes)?;
        let (_, encoded) = image.split_once(',').ok_or(GuiError::ImageInput)?;
        // Old queues can contain valid image bytes with incorrect picker MIME metadata.
        let url = format!("data:{};base64,{encoded}", format.to_mime_type());
        return Ok(json!({"type": "image", "url": url}));
    }
    let path = Path::new(&image);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !path.is_absolute()
        || !path.is_file()
        || path
            .metadata()
            // Local image inputs carry only a path. Byte limits apply to inline uploads, not this reference.
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(true)
        || !["png", "jpg", "jpeg", "webp", "gif"].contains(&extension.as_str())
    {
        return Err(GuiError::ImageInput);
    }
    Ok(json!({"type": "localImage", "path": image}))
}

pub(super) fn decode_data_url(url: &str, max_bytes: u64) -> Result<Vec<u8>> {
    let (bytes, format) = decode_payload(url, max_bytes)?;
    if !url.starts_with(&format!("data:{};base64,", format.to_mime_type())) {
        return Err(GuiError::ImageInput);
    }
    Ok(bytes)
}

fn decode_payload(url: &str, max_bytes: u64) -> Result<(Vec<u8>, ImageFormat)> {
    let (header, encoded) = url.split_once(',').ok_or(GuiError::ImageInput)?;
    if !matches!(
        header,
        "data:image/png;base64"
            | "data:image/jpeg;base64"
            | "data:image/webp;base64"
            | "data:image/gif;base64"
    ) || encoded.is_empty()
    {
        return Err(GuiError::ImageInput);
    }
    if encoded.len() as u64 > max_bytes.div_ceil(3).saturating_mul(4) {
        return Err(GuiError::ImageInputTooLarge);
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| GuiError::ImageInput)?;
    if bytes.len() as u64 > max_bytes {
        return Err(GuiError::ImageInputTooLarge);
    }
    let format = image::guess_format(&bytes).map_err(|_| GuiError::ImageInput)?;
    if !matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP | ImageFormat::Gif
    ) {
        return Err(GuiError::ImageInput);
    }
    Ok((bytes, format))
}

#[cfg(test)]
#[path = "images_tests.rs"]
mod tests;
