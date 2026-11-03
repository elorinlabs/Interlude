//! Provider changes must not invalidate byte-addressed Codex history.
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
};

use serde_json::Value;

/// Keeps filesystem and JSON diagnostics out of user-facing provider errors.
#[derive(Debug, thiserror::Error)]
pub(crate) enum MetadataError {
    #[error("暂时无法更新会话，请稍后重试")]
    Io(#[from] std::io::Error),
    #[error("会话信息无法读取，请从备份恢复后重试")]
    Json(#[from] serde_json::Error),
    #[error("会话信息不完整，请从备份恢复后重试")]
    InvalidMetadata,
}

/// Paginated rollouts are immutable here: their first line contributes to every
/// subsequent byte offset, including cutoffs stored in other threads' history_base.
/// Routing is changed in the state database/configuration by the caller instead.
pub(crate) fn update_provider(
    path: &Path,
    source_provider: Option<&str>,
    target_provider: &str,
) -> Result<bool, MetadataError> {
    let mut reader = open_reader(path)?;
    let mut first = String::new();
    reader.read_line(&mut first)?;
    let mut meta: Value = serde_json::from_str(first.trim_end())?;
    if meta.get("type").and_then(Value::as_str) != Some("session_meta")
        || !meta.get("payload").is_some_and(Value::is_object)
    {
        return Err(MetadataError::InvalidMetadata);
    }
    if requires_stable_bytes(&meta) {
        return Ok(false);
    }
    let payload = meta
        .get_mut("payload")
        .and_then(Value::as_object_mut)
        .ok_or(MetadataError::InvalidMetadata)?;
    let current = payload.get("model_provider").and_then(Value::as_str);
    if source_provider.is_some() && current.is_none() {
        return Err(MetadataError::InvalidMetadata);
    }
    if current == Some(target_provider)
        || source_provider.is_some_and(|source| current != Some(source))
    {
        return Ok(false);
    }
    payload.insert(
        "model_provider".to_string(),
        Value::String(target_provider.to_string()),
    );
    replace_metadata(path, &meta, reader)?;
    Ok(true)
}

fn replace_metadata(
    path: &Path,
    meta: &Value,
    mut reader: Box<dyn BufRead>,
) -> Result<(), MetadataError> {
    let parent = path.parent().ok_or(MetadataError::InvalidMetadata)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    write_metadata(path, temporary.as_file_mut(), meta, &mut reader)?;
    temporary.as_file().sync_all()?;
    // Release the original handle before replacing it on Windows.
    drop(reader);
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

/// Unknown history formats are left untouched rather than treated as legacy.
pub(crate) fn requires_stable_bytes(meta: &Value) -> bool {
    meta.pointer("/payload/history_mode")
        .is_some_and(|mode| !mode.is_null() && mode.as_str() != Some("legacy"))
        || meta
            .pointer("/payload/history_base")
            .is_some_and(|base| !base.is_null())
        || meta
            .pointer("/payload/forked_from_ordinal_exclusive")
            .is_some_and(|cutoff| !cutoff.is_null())
}

fn open_reader(path: &Path) -> Result<Box<dyn BufRead>, MetadataError> {
    let file = File::open(path)?;
    if path.extension().and_then(|extension| extension.to_str()) == Some("zst") {
        let decoder = zstd::stream::read::Decoder::new(file)?;
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        Ok(Box::new(BufReader::new(file)))
    }
}

fn write_metadata(
    path: &Path,
    output: &mut File,
    meta: &Value,
    reader: &mut impl Read,
) -> Result<(), MetadataError> {
    if path.extension().and_then(|extension| extension.to_str()) == Some("zst") {
        let mut encoder = zstd::stream::write::Encoder::new(output, 3)?;
        write_contents(&mut encoder, meta, reader)?;
        encoder.finish()?;
        Ok(())
    } else {
        write_contents(output, meta, reader)
    }
}

fn write_contents(
    mut output: impl Write,
    meta: &Value,
    reader: &mut impl Read,
) -> Result<(), MetadataError> {
    serde_json::to_writer(&mut output, meta)?;
    output.write_all(b"\n")?;
    std::io::copy(reader, &mut output)?;
    Ok(())
}

#[cfg(test)]
#[path = "rollout_metadata_tests.rs"]
mod tests;
