use super::types::{HelpError, HelpRequest, MessageRole, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageFormat, ImageReader, Limits};
use std::io::Cursor;

const MAX_IMAGES: usize = 4;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = MAX_IMAGES * MAX_IMAGE_BYTES;
const MAX_IMAGE_PIXELS: u64 = 16_777_216;

pub(super) fn validate(request: &HelpRequest) -> Result<()> {
    let mut total = validate_images(&request.images)?;
    for message in &request.history {
        if matches!(message.role, MessageRole::Assistant) && !message.images.is_empty() {
            return Err(HelpError::InvalidImage);
        }
        total += validate_images(&message.images)?;
        if total > MAX_TOTAL_BYTES {
            return Err(HelpError::InvalidImage);
        }
    }
    Ok(())
}

fn validate_images(images: &[String]) -> Result<usize> {
    if images.len() > MAX_IMAGES {
        return Err(HelpError::InvalidImage);
    }
    images
        .iter()
        .try_fold(0, |total, image| Ok(total + validate_image(image)?))
}

fn validate_image(url: &str) -> Result<usize> {
    let (header, data) = url.split_once(',').ok_or(HelpError::InvalidImage)?;
    let format = match header {
        "data:image/png;base64" => ImageFormat::Png,
        "data:image/jpeg;base64" => ImageFormat::Jpeg,
        "data:image/webp;base64" => ImageFormat::WebP,
        "data:image/gif;base64" => ImageFormat::Gif,
        _ => return Err(HelpError::InvalidImage),
    };
    if data.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err(HelpError::InvalidImage);
    }
    let bytes = STANDARD.decode(data).map_err(|_| HelpError::InvalidImage)?;
    if bytes.is_empty()
        || bytes.len() > MAX_IMAGE_BYTES
        || image::guess_format(&bytes).ok() != Some(format)
    {
        return Err(HelpError::InvalidImage);
    }
    let (width, height) = ImageReader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| HelpError::InvalidImage)?;
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err(HelpError::InvalidImage);
    }
    let mut reader = ImageReader::with_format(Cursor::new(&bytes), format);
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_IMAGE_PIXELS * 4);
    reader.limits(limits);
    reader.decode().map_err(|_| HelpError::InvalidImage)?;
    Ok(bytes.len())
}
