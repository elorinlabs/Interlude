use super::error::{Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};

const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;

pub(super) struct Audio {
    pub(super) bytes: Vec<u8>,
    pub(super) mime: &'static str,
    pub(super) filename: &'static str,
}

pub(super) fn decode(data: &str, mime: &str) -> Result<Audio> {
    if data.len() > MAX_AUDIO_BYTES.div_ceil(3) * 4 {
        return Err(Error::Audio);
    }
    let bytes = STANDARD.decode(data).map_err(|_| Error::Audio)?;
    if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
        return Err(Error::Audio);
    }
    let (mime, filename, valid) = match mime.split(';').next().map(str::trim) {
        Some("audio/webm") => (
            "audio/webm",
            "dictation.webm",
            bytes.starts_with(b"\x1a\x45\xdf\xa3"),
        ),
        Some("audio/mp4") => (
            "audio/mp4",
            "dictation.m4a",
            bytes.get(4..8) == Some(b"ftyp"),
        ),
        Some("audio/ogg") => ("audio/ogg", "dictation.ogg", bytes.starts_with(b"OggS")),
        Some("audio/wav") => (
            "audio/wav",
            "dictation.wav",
            bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE"),
        ),
        _ => return Err(Error::Audio),
    };
    if !valid {
        return Err(Error::Audio);
    }
    Ok(Audio {
        bytes,
        mime,
        filename,
    })
}
