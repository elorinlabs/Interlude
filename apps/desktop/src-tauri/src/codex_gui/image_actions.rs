//! Desktop image actions use preview bytes and destinations chosen by the native save dialog.
use std::{fs, io::Cursor, io::Write, path::Path};

use image::{ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DECODE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 16_384;

#[derive(Debug, thiserror::Error)]
enum ImageActionError {
    #[error("图片无法读取，请重新打开后重试。")]
    Image,
    #[error("图片未能复制，请重试。")]
    Copy,
    #[error("图片未能保存，请检查保存位置后重试。")]
    Save,
}
type Result<T> = std::result::Result<T, ImageActionError>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum ImageAction {
    Copy,
    SaveAs,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ImageActionRequest {
    source: String,
    action: ImageAction,
}

#[derive(Serialize)]
pub(crate) struct ImageActionResponse {
    completed: bool,
}

#[tauri::command]
pub(crate) async fn codex_gui_image_action(
    app: AppHandle,
    request: ImageActionRequest,
) -> std::result::Result<ImageActionResponse, String> {
    perform(app, request)
        .await
        .map_err(|error| error.to_string())
}

async fn perform(app: AppHandle, request: ImageActionRequest) -> Result<ImageActionResponse> {
    let source = if request.source.starts_with("https://") || request.source.starts_with("http://")
    {
        super::image_download::download(&request.source, MAX_IMAGE_BYTES)
            .await
            .map_err(|_| ImageActionError::Image)?
    } else {
        request.source
    };
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = super::images::decode_data_url(&source, MAX_IMAGE_BYTES)
            .map_err(|_| ImageActionError::Image)?;
        let completed = match request.action {
            ImageAction::Copy => {
                copy_image(&app, &bytes)?;
                true
            }
            ImageAction::SaveAs => save_as(&app, &bytes)?,
        };
        Ok(ImageActionResponse { completed })
    })
    .await
    .map_err(|_| ImageActionError::Image)?
}

fn decode_image(bytes: &[u8]) -> Result<image::RgbaImage> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| ImageActionError::Image)?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| ImageActionError::Image)?;
    if u64::from(image.width()) * u64::from(image.height()) * 4 > MAX_DECODE_BYTES {
        return Err(ImageActionError::Image);
    }
    Ok(image.into_rgba8())
}

fn copy_image(app: &AppHandle, bytes: &[u8]) -> Result<()> {
    let image = decode_image(bytes)?;
    let (width, height) = image.dimensions();
    let image = tauri::image::Image::new_owned(image.into_raw(), width, height);
    app.clipboard()
        .write_image(&image)
        .map_err(|_| ImageActionError::Copy)
}

fn extension(bytes: &[u8]) -> Result<&'static str> {
    match image::guess_format(bytes).map_err(|_| ImageActionError::Image)? {
        ImageFormat::Png => Ok("png"),
        ImageFormat::Jpeg => Ok("jpg"),
        ImageFormat::WebP => Ok("webp"),
        ImageFormat::Gif => Ok("gif"),
        _ => Err(ImageActionError::Image),
    }
}

fn save_as(app: &AppHandle, bytes: &[u8]) -> Result<bool> {
    let extension = extension(bytes)?;
    let image = crate::storage::native_text("图片");
    let Some(destination) = app
        .dialog()
        .file()
        .set_title(crate::storage::native_text("图片另存为"))
        .set_file_name(format!("{image}.{extension}"))
        .add_filter(image, &[extension])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let destination = destination
        .into_path()
        .map_err(|_| ImageActionError::Save)?;
    if !destination.is_absolute() {
        return Err(ImageActionError::Save);
    }
    save_bytes(bytes, &destination)?;
    Ok(true)
}

fn save_bytes(bytes: &[u8], destination: &Path) -> Result<()> {
    let parent = destination.parent().ok_or(ImageActionError::Save)?;
    let temporary = parent.join(format!(".codex-switch-image-{}", uuid::Uuid::new_v4()));
    // Finish writing before replacing an existing image, including a hard link to the original.
    let result = (|| {
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        drop(output);
        fs::rename(&temporary, destination)
    })();
    if result.is_err() && temporary.exists() && fs::remove_file(&temporary).is_err() {
        eprintln!("Could not remove an unfinished image save");
    }
    result.map_err(|_| ImageActionError::Save)
}

#[cfg(test)]
#[path = "image_actions_tests.rs"]
mod tests;
