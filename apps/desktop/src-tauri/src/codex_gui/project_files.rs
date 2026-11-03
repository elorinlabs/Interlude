//! Directory browsing rooted at the current chat project, without following links outside it.
use super::{
    client::Client,
    error::{GuiError, Result},
    platform::execution_path,
    protocol::{thread_params, GuiResponse},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];

#[path = "project_file_search.rs"]
mod search;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectFilesRequest {
    thread_id: Option<String>,
    cwd: Option<String>,
    #[serde(default)]
    directory: String,
    #[serde(default)]
    images_only: bool,
    query: Option<String>,
    #[serde(default)]
    search_all_directories: bool,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    directory: bool,
}

pub(super) async fn list(client: &Client, options: ProjectFilesRequest) -> Result<GuiResponse> {
    let root = if let Some(thread_id) = options.thread_id {
        let response = client
            .request("thread/read", thread_params(thread_id)?)
            .await?;
        PathBuf::from(
            response["thread"]["cwd"]
                .as_str()
                .ok_or(GuiError::ProjectFiles)?,
        )
    } else {
        PathBuf::from(
            options
                .cwd
                .filter(|cwd| !cwd.is_empty())
                .ok_or(GuiError::ProjectFiles)?,
        )
    };
    let data = tauri::async_runtime::spawn_blocking(move || match options.query {
        Some(query) => search::search(&root, &query, options.search_all_directories),
        None => browse(&root, &options.directory, options.images_only),
    })
    .await
    .map_err(|_| GuiError::ProjectFiles)??;
    Ok(GuiResponse { data })
}

pub(super) fn browse(root: &Path, directory: &str, images_only: bool) -> Result<serde_json::Value> {
    if !root.is_absolute() || directory.len() > 4096 {
        return Err(GuiError::ProjectFiles);
    }
    let root = root.canonicalize().map_err(|_| GuiError::ProjectFiles)?;
    let directory = if directory.is_empty() {
        root.clone()
    } else {
        PathBuf::from(directory)
    };
    let directory = directory
        .canonicalize()
        .map_err(|_| GuiError::ProjectFiles)?;
    if !directory.starts_with(&root) {
        return Err(GuiError::ProjectFiles);
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|_| GuiError::ProjectFiles)? {
        let entry = entry.map_err(|_| GuiError::ProjectFiles)?;
        if let Some(entry) = visible_entry(entry, images_only)? {
            entries.push(entry);
        }
    }
    entries.sort_by_cached_key(|entry| (!entry.directory, entry.name.to_lowercase()));
    let parent = if directory == root {
        None
    } else {
        directory.parent().map(execution_path)
    };
    Ok(
        json!({ "directory": execution_path(&directory), "parent": parent,
        "entries": entries, "truncated": false }),
    )
}

fn visible_entry(entry: fs::DirEntry, images_only: bool) -> Result<Option<Entry>> {
    let kind = entry.file_type().map_err(|_| GuiError::ProjectFiles)?;
    if kind.is_symlink() || (!kind.is_dir() && !kind.is_file()) {
        return Ok(None);
    }
    let path = entry.path();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if images_only && kind.is_file() && !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Ok(None);
    }
    Ok(Some(Entry {
        name: entry.file_name().to_string_lossy().into_owned(),
        path: execution_path(&path),
        directory: kind.is_dir(),
    }))
}

#[cfg(test)]
#[path = "project_files_tests.rs"]
mod tests;
