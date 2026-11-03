//! Bounded thumbnails keep image synchronization independent of original image size.
use std::{
    fs::File,
    io::{BufRead, BufReader, Cursor, Seek},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView, ImageFormat, ImageReader};
use serde::Deserialize;

use super::error::{GuiError, Result};

// Includes base64 overhead, so the complete thumbnail URL stays below 100 kB on the wire.
pub(super) const MAX_THUMBNAIL_BYTES: usize = 74_000;
const MAX_DECODE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const PREVIEW_WORKERS: usize = 2;
const MAX_THUMBNAIL_EDGE: u32 = 1600;
const MIN_THUMBNAIL_EDGE: u32 = 100;
const JPEG_QUALITIES: [u8; 3] = [82, 65, 45];

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ImageVariant {
    #[default]
    Original,
    Thumbnail,
}

/// Keep concurrent large image decodes off the UI thread and within a small worker budget.
pub(super) async fn preview_task<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    static WORKERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(PREVIEW_WORKERS);
    let permit = WORKERS
        .acquire()
        .await
        .map_err(|_| GuiError::ImagePreview)?;
    tauri::async_runtime::spawn_blocking(move || {
        // Retain the permit even if the caller cancels while this blocking task is running.
        let _permit = permit;
        work()
    })
    .await
    .map_err(|_| GuiError::ImagePreview)?
}

pub(super) fn render_file(file: File) -> Result<String> {
    let bytes = file.metadata().map_err(|_| GuiError::ImagePreview)?.len();
    let decoded = decode_reader(BufReader::new(file), bytes)?;
    render_decoded(decoded)
}

pub(super) fn render(url: String, variant: ImageVariant) -> Result<String> {
    if matches!(variant, ImageVariant::Original) {
        return Ok(url);
    }
    render_decoded(decode(&url)?)
}

fn render_decoded(decoded: DynamicImage) -> Result<String> {
    let transparent =
        decoded.color().has_alpha() && decoded.pixels().any(|(_, _, pixel)| pixel[3] < u8::MAX);
    let mut size = MAX_THUMBNAIL_EDGE.min(decoded.width().max(decoded.height()));
    loop {
        let (output, mime) = encode_thumbnail(&decoded.thumbnail(size, size), transparent)?;
        if output.len() <= MAX_THUMBNAIL_BYTES {
            return Ok(format!("data:{mime};base64,{}", STANDARD.encode(output)));
        }
        if size <= MIN_THUMBNAIL_EDGE {
            return Err(GuiError::ImagePreview);
        }
        size /= 2;
    }
}

fn decode(url: &str) -> Result<DynamicImage> {
    let (header, encoded) = url.split_once(',').ok_or(GuiError::ImagePreview)?;
    if !header.starts_with("data:image/") {
        return Err(GuiError::ImagePreview);
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| GuiError::ImagePreview)?;
    decode_reader(Cursor::new(&bytes), bytes.len() as u64)
}

fn decode_reader(reader: impl BufRead + Seek, encoded_bytes: u64) -> Result<DynamicImage> {
    let mut reader = ImageReader::new(reader)
        .with_guessed_format()
        .map_err(|_| GuiError::ImagePreview)?;
    // The JPEG decoder retains compressed input. Account for it before allocating pixel storage;
    // PNG/GIF/WebP can read the file directly without an extra Base64 copy of the entire source.
    let buffered_bytes = if reader.format() == Some(ImageFormat::Jpeg) {
        encoded_bytes
    } else {
        0
    };
    let available = MAX_DECODE_BYTES
        .checked_sub(buffered_bytes)
        .filter(|available| *available > 0)
        .ok_or(GuiError::ImagePreviewResources)?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(available);
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    reader.limits(limits);
    reader.decode().map_err(|error| match error {
        image::ImageError::Limits(_) => GuiError::ImagePreviewResources,
        _ => GuiError::ImagePreview,
    })
}

fn encode_thumbnail(image: &DynamicImage, transparent: bool) -> Result<(Vec<u8>, &'static str)> {
    // JPEG discards alpha rather than compositing it, which turns transparent backgrounds black.
    if transparent {
        let mut output = Cursor::new(Vec::new());
        image
            .to_rgba8()
            .write_to(&mut output, ImageFormat::Png)
            .map_err(|_| GuiError::ImagePreview)?;
        return Ok((output.into_inner(), "image/png"));
    }
    let rgb = image.to_rgb8();
    let mut output = Vec::new();
    for quality in JPEG_QUALITIES {
        output.clear();
        JpegEncoder::new_with_quality(&mut output, quality)
            .encode_image(&rgb)
            .map_err(|_| GuiError::ImagePreview)?;
        if output.len() <= MAX_THUMBNAIL_BYTES {
            break;
        }
    }
    Ok((output, "image/jpeg"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_excessive_pixel_allocations_before_decoding_image_data() {
        let mut bytes = Vec::new();
        JpegEncoder::new(&mut bytes)
            .encode_image(&image::RgbImage::new(1, 1))
            .unwrap();
        let frame = bytes
            .windows(2)
            .position(|marker| marker == [0xff, 0xc0])
            .unwrap();
        let dimension = 8_000_u16.to_be_bytes();
        bytes[frame + 5..frame + 7].copy_from_slice(&dimension);
        bytes[frame + 7..frame + 9].copy_from_slice(&dimension);
        assert!(matches!(
            decode_reader(Cursor::new(&bytes), bytes.len() as u64),
            Err(GuiError::ImagePreviewResources)
        ));
    }

    #[test]
    fn accounts_for_jpeg_input_buffer_before_reading_large_files() {
        let mut file = tempfile::tempfile().unwrap();
        JpegEncoder::new(&mut file)
            .encode_image(&image::RgbImage::new(1, 1))
            .unwrap();
        file.set_len(MAX_DECODE_BYTES).unwrap();
        file.rewind().unwrap();
        assert!(matches!(
            render_file(file),
            Err(GuiError::ImagePreviewResources)
        ));
    }

    fn png_url(image: &image::RgbaImage) -> String {
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        format!(
            "data:image/png;base64,{}",
            STANDARD.encode(bytes.into_inner())
        )
    }

    fn decode_url(url: &str) -> image::DynamicImage {
        let (_, encoded) = url.split_once(',').unwrap();
        image::load_from_memory(&STANDARD.decode(encoded).unwrap()).unwrap()
    }

    #[test]
    fn preserves_transparent_and_translucent_pixels() {
        let image = image::RgbaImage::from_fn(128, 80, |x, _| {
            image::Rgba([24, 180, 72, [0, 64, 128, 255][x as usize % 4]])
        });
        let original = png_url(&image);
        let thumbnail = render(original.clone(), ImageVariant::Thumbnail).unwrap();
        assert!(thumbnail.starts_with("data:image/png;base64,"));
        assert!(thumbnail.len() < 100_000);
        let decoded = decode_url(&thumbnail).to_rgba8();
        assert_eq!(decoded.dimensions(), image.dimensions());
        for (actual, expected) in decoded.pixels().zip(image.pixels()) {
            assert_eq!(actual, expected);
        }
        assert_eq!(
            render(original.clone(), ImageVariant::Original).unwrap(),
            original
        );
    }

    #[test]
    fn bounds_high_detail_transparent_thumbnail_without_flattening_alpha() {
        let image = image::RgbaImage::from_fn(1800, 1400, |x, y| {
            let seed = x.wrapping_mul(1664525) ^ y.wrapping_mul(1013904223);
            image::Rgba([seed as u8, (seed >> 8) as u8, (seed >> 16) as u8, 128])
        });
        let thumbnail = render(png_url(&image), ImageVariant::Thumbnail).unwrap();
        assert!(thumbnail.len() < 100_000);
        let decoded = decode_url(&thumbnail);
        assert!(decoded.width() <= 1600 && decoded.height() <= 1600);
        assert!(decoded.to_rgba8().pixels().all(|pixel| pixel[3] == 128));
    }

    #[test]
    fn keeps_jpeg_compression_for_fully_opaque_rgba_images() {
        let image = image::RgbaImage::from_pixel(64, 64, image::Rgba([24, 180, 72, 255]));
        let thumbnail = render(png_url(&image), ImageVariant::Thumbnail).unwrap();
        assert!(thumbnail.starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn bounds_high_detail_thumbnail_and_preserves_original() {
        let image = image::RgbImage::from_fn(1800, 1400, |x, y| {
            let seed = x.wrapping_mul(1664525) ^ y.wrapping_mul(1013904223);
            image::Rgb([seed as u8, (seed >> 8) as u8, (seed >> 16) as u8])
        });
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let original = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(bytes.into_inner())
        );
        assert!(original.len() > 100_000);
        let thumbnail = render(original.clone(), ImageVariant::Thumbnail).unwrap();
        assert!(thumbnail.len() < 100_000);
        assert_eq!(
            render(original.clone(), ImageVariant::Original).unwrap(),
            original
        );
        assert!(render("data:image/png;base64,YmFk".into(), ImageVariant::Thumbnail).is_err());
    }
}
