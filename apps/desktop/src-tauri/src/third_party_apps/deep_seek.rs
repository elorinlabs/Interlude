//! DeepSeek Harness 0.2 profile patches and versioned managed credentials.
mod config;
mod credentials;
#[cfg(test)]
mod tests;

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use crate::models::ProviderProfile;
use serde_yaml::{Mapping, Value};

const API_KEY_REF: &str = "CODEX_SWITCH_API_KEY";
const PROVIDERS_ENTRY: &str = "llm-pi-ai";
const SELECTOR_ENTRY: &str = "agent-default-model";
const PATCH_FILE: &str = "cordis.patch.yml";

#[derive(Debug, thiserror::Error)]
enum SyncError {
    #[error("deep_seek_io")]
    Io(#[from] std::io::Error),
    #[error("deep_seek_yaml")]
    Yaml(#[from] serde_yaml::Error),
    #[error("deep_seek_config_shape")]
    InvalidConfig,
    #[error("deep_seek_credentials_version")]
    UnsupportedVersion,
}

type SyncResult<T> = Result<T, SyncError>;

pub(super) fn sync(home: &Path, provider: Option<&ProviderProfile>) -> Result<(), String> {
    let home = std::env::var_os("DSH_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".dsh"));
    sync_home(&home, provider).map_err(|error| {
        // Parser errors can contain credentials. Log only the error category.
        eprintln!("DeepSeek Harness sync failed: {error}");
        super::messages::deep_seek_sync_error().to_string()
    })
}

fn sync_home(home: &Path, provider: Option<&ProviderProfile>) -> SyncResult<()> {
    let credentials_path = home.join(".credentials.yaml");
    let mut credentials = read_yaml(&credentials_path, Value::Mapping(Mapping::new()))?;
    credentials::update(&mut credentials, provider)?;
    let legacy_path = home.join("settings.yaml");
    let mut legacy = read_yaml(&legacy_path, Value::Mapping(Mapping::new()))?;
    let migrated = config::take_legacy(&mut legacy)?;
    let mut writes = Vec::new();
    for path in profile_paths(home)? {
        let mut patch = read_yaml(&path, Value::Sequence(Vec::new()))?;
        config::update(&mut patch, &migrated, provider)?;
        writes.push((path, serde_yaml::to_string(&patch)?));
    }
    // Validate every document before changing any file. Publish credentials first,
    // so a profile watcher never sees a new route without its credential.
    let credentials_text = serde_yaml::to_string(&credentials)?;
    let legacy_text = serde_yaml::to_string(&legacy)?;
    write_yaml(&credentials_path, &credentials_text)?;
    for (path, contents) in writes {
        write_yaml(&path, &contents)?;
    }
    if !migrated.is_empty() {
        // Leave unrelated sections for Harness's one-time importer, but prevent it
        // from replacing the provider entry we have just merged into the profile.
        write_yaml(&legacy_path, &legacy_text)?;
    }
    Ok(())
}

fn profile_paths(home: &Path) -> SyncResult<Vec<PathBuf>> {
    let directory = home.join("profiles");
    let mut paths = Vec::new();
    match fs::read_dir(&directory) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry?;
                if !entry.file_type()?.is_dir() {
                    continue;
                }
                let path = entry.path();
                if path.join(PATCH_FILE).exists() || path.join("package.json").exists() {
                    paths.push(path.join(PATCH_FILE));
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    if paths.is_empty() {
        paths.push(directory.join("desktop").join(PATCH_FILE));
    }
    paths.sort();
    Ok(paths)
}

fn read_yaml(path: &Path, default: Value) -> SyncResult<Value> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(default),
        Err(error) => return Err(error.into()),
    };
    let parsed: Value = serde_yaml::from_str(&content)?;
    Ok(if parsed.is_null() { default } else { parsed })
}

fn write_yaml(path: &Path, contents: &str) -> SyncResult<()> {
    if fs::read(path).is_ok_and(|bytes| bytes == contents.as_bytes()) {
        return Ok(());
    }
    let parent = path.parent().ok_or(SyncError::InvalidConfig)?;
    fs::create_dir_all(parent)?;
    // NamedTempFile is owner-only on Unix, as required by credentials-local.
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(contents.as_bytes())?;
    temporary.flush()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

fn text(value: &str) -> Value {
    Value::String(value.to_string())
}

fn object(value: &mut Value) -> SyncResult<&mut Mapping> {
    value.as_mapping_mut().ok_or(SyncError::InvalidConfig)
}

fn child<'a>(parent: &'a mut Mapping, key: &str) -> SyncResult<&'a mut Mapping> {
    object(
        parent
            .entry(text(key))
            .or_insert_with(|| Value::Mapping(Mapping::new())),
    )
}
