//! Preview local images on the authenticated computer and validated public image URLs.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use base64::engine::general_purpose::STANDARD;
#[cfg(test)]
use base64::Engine;
use image::ImageFormat;
use serde_json::json;

use super::{
    client::Client,
    error::{GuiError, Result},
    image_thumbnail::{preview_task, ImageVariant},
    protocol::{thread_params, GuiResponse},
};

const DEFAULT_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_SOURCE_LENGTH: usize = 4096;

pub(super) struct PreviewOptions {
    pub variant: super::image_thumbnail::ImageVariant,
    pub max_bytes: Option<u64>,
}

fn render_limited(source: String, options: PreviewOptions) -> Result<String> {
    let limit = options.max_bytes.unwrap_or(DEFAULT_IMAGE_BYTES).max(1);
    let encoded = source.split_once(',').ok_or(GuiError::ImagePreview)?.1;
    let padding = encoded
        .chars()
        .rev()
        .take_while(|character| *character == '=')
        .count();
    if (encoded.len() * 3 / 4).saturating_sub(padding) as u64 > limit {
        return Err(GuiError::ImagePreview);
    }
    super::image_thumbnail::render(source, options.variant)
}

pub(super) async fn preview(
    client: &Client,
    thread_id: String,
    source: String,
    options: PreviewOptions,
) -> Result<GuiResponse> {
    uuid::Uuid::parse_str(&thread_id).map_err(|_| GuiError::InvalidRequest)?;
    let limit = options.max_bytes.unwrap_or(DEFAULT_IMAGE_BYTES).max(1);
    let source = if source.starts_with("https://") || source.starts_with("http://") {
        super::image_download::download(&source, limit).await?
    } else {
        source
    };
    if source.starts_with("data:image/") {
        // Inline bytes grant no filesystem access; use the same input validation as attachments.
        let data = preview_task(move || {
            super::images::input_limited(source.clone(), limit)?;
            render_limited(source, options)
        })
        .await?;
        return Ok(GuiResponse {
            data: json!({ "url": data }),
        });
    }
    let params = thread_params(thread_id)?;
    // Read the actual workspace before the presentation layer hides projectless paths.
    let response = client.request("thread/read", params).await?;
    let workspace = response["thread"]["cwd"]
        .as_str()
        .ok_or(GuiError::ImagePreview)?;
    let workspace = PathBuf::from(workspace);
    let data = preview_task(move || read_image(&source, &workspace, options)).await?;
    Ok(GuiResponse {
        data: json!({ "url": data }),
    })
}

pub(super) fn source_path(source: &str) -> Result<PathBuf> {
    if source.is_empty() || source.len() > MAX_SOURCE_LENGTH || source.contains('\0') {
        return Err(GuiError::ImagePreview);
    }
    let path = if source
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:"))
    {
        let url = url::Url::parse(source).map_err(|_| GuiError::ImagePreview)?;
        if url.host_str().is_some_and(|host| host != "localhost")
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(GuiError::ImagePreview);
        }
        url.to_file_path().map_err(|_| GuiError::ImagePreview)?
    } else {
        PathBuf::from(source)
    };
    // Do not turn model-provided image references into network shares or device access.
    super::local_file::validate(&path.to_string_lossy()).map_err(|_| GuiError::ImagePreview)?;
    Ok(path)
}

fn read_image(source: &str, workspace: &Path, options: PreviewOptions) -> Result<String> {
    let source = source_path(source)?;
    let path = super::local_file::resolve(workspace, &source.to_string_lossy())
        .map_err(|_| GuiError::ImagePreview)?;
    render_file(&path, options)
}

/// Local previews have no transport byte cap; remote callers can supply their own policy limit.
pub(super) fn render_file(path: &Path, options: PreviewOptions) -> Result<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif"].contains(&extension.as_str()) {
        return Err(GuiError::ImagePreview);
    }
    let limit = options.max_bytes.unwrap_or(u64::MAX).max(1);
    let file = open_image(path, limit)?;
    match options.variant {
        ImageVariant::Thumbnail => super::image_thumbnail::render_file(file),
        ImageVariant::Original => encode_file(file, limit),
    }
}

#[cfg(test)]
fn encode_image(path: &Path, max_bytes: u64) -> Result<String> {
    encode_file(open_image(path, max_bytes)?, max_bytes)
}

fn open_image(path: &Path, max_bytes: u64) -> Result<File> {
    let file = File::open(path).map_err(|_| GuiError::ImagePreview)?;
    let metadata = file.metadata().map_err(|_| GuiError::ImagePreview)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > max_bytes {
        return Err(GuiError::ImagePreview);
    }
    Ok(file)
}

fn encode_file(mut file: File, max_bytes: u64) -> Result<String> {
    const FORMAT_HEADER_BYTES: usize = 16;
    let mut header = [0; FORMAT_HEADER_BYTES];
    let size = file.read(&mut header).map_err(|_| GuiError::ImagePreview)?;
    let mime = match image::guess_format(&header[..size]).map_err(|_| GuiError::ImagePreview)? {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        _ => return Err(GuiError::ImagePreview),
    };
    file.seek(SeekFrom::Start(0))
        .map_err(|_| GuiError::ImagePreview)?;
    // Originals are requested explicitly. Stream into the final URL without retaining another
    // full-size source buffer or copying the encoded string again with format!.
    let prefix = format!("data:{mime};base64,").into_bytes();
    let mut output = base64::write::EncoderWriter::new(prefix, &STANDARD);
    let copied = std::io::copy(&mut file.take(max_bytes.saturating_add(1)), &mut output)
        .map_err(|_| GuiError::ImagePreview)?;
    if copied > max_bytes {
        return Err(GuiError::ImagePreview);
    }
    let encoded = output.finish().map_err(|_| GuiError::ImagePreview)?;
    String::from_utf8(encoded).map_err(|_| GuiError::ImagePreview)
}

#[cfg(test)]
#[path = "image_preview_tests.rs"]
mod tests;
