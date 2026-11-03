//! Desktop draft previews have no thread yet; read only the explicitly attached raster image.
use serde::{Deserialize, Serialize};

use super::{
    error::{GuiError, Result},
    image_preview::{render_file, source_path, PreviewOptions},
    image_thumbnail::{preview_task, ImageVariant},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AttachmentPreviewRequest {
    path: String,
    variant: ImageVariant,
}

#[derive(Serialize)]
pub(crate) struct AttachmentPreviewResponse {
    url: String,
}

fn preview(request: AttachmentPreviewRequest) -> Result<AttachmentPreviewResponse> {
    let path = source_path(&request.path)?;
    if !path.is_absolute() {
        return Err(GuiError::ImagePreview);
    }
    let url = render_file(
        &path,
        PreviewOptions {
            variant: request.variant,
            max_bytes: None,
        },
    )?;
    Ok(AttachmentPreviewResponse { url })
}

/// Local desktop attachment previews are deliberately excluded from the web request bridge.
#[tauri::command]
pub(crate) async fn codex_gui_attachment_preview(
    request: AttachmentPreviewRequest,
) -> std::result::Result<AttachmentPreviewResponse, String> {
    preview_task(move || preview(request))
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "attachment_preview_tests.rs"]
mod tests;
