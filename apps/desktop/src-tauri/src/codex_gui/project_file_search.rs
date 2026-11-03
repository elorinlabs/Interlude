//! Bounded project search for file browsing and references. Never traverse symbolic links or junctions.
use super::{execution_path, GuiError, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

const MAX_RESULTS: usize = 50;
const MAX_SCANNED: usize = 40_000;
const MAX_DEPTH: usize = 32;
const SEARCH_BUDGET: Duration = Duration::from_millis(750);
const EXCLUDED_DIRECTORIES: &[&str] = &[".git", ".svn", "node_modules"];
const GENERATED_DIRECTORIES: &[&str] = &["target", "dist", ".next", ".cache", ".codex-tmp"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchEntry {
    name: String,
    path: String,
    directory: bool,
    relative_path: String,
}

struct SearchState {
    pending: VecDeque<(PathBuf, usize)>,
    matches: Vec<SearchEntry>,
    scanned: usize,
    started: Instant,
    truncated: bool,
    all_directories: bool,
}

pub(super) fn search(root: &Path, query: &str, all_directories: bool) -> Result<Value> {
    if !root.is_absolute() || query.len() > 4096 || query.contains('\0') {
        return Err(GuiError::ProjectFiles);
    }
    let root = root.canonicalize().map_err(|_| GuiError::ProjectFiles)?;
    if !root.is_dir() {
        return Err(GuiError::ProjectFiles);
    }
    let query = query.replace('\\', "/").to_lowercase();
    let mut state = SearchState {
        pending: VecDeque::from([(root.clone(), 0)]),
        matches: Vec::new(),
        scanned: 0,
        started: Instant::now(),
        truncated: false,
        all_directories,
    };
    while let Some(target) = state.pending.pop_front() {
        if !state.scan_directory(&root, &query, target) {
            break;
        }
    }
    state
        .matches
        .sort_by_key(|item| (!item.directory, item.relative_path.to_lowercase()));
    Ok(json!({ "directory": execution_path(&root), "parent": null,
        "entries": state.matches, "truncated": state.truncated }))
}

impl SearchState {
    fn scan_directory(&mut self, root: &Path, query: &str, target: (PathBuf, usize)) -> bool {
        let (directory, depth) = target;
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                self.truncated = true;
                return true;
            }
        };
        for entry in entries {
            if self.scanned >= MAX_SCANNED
                || self.started.elapsed() >= SEARCH_BUDGET
                || self.matches.len() >= MAX_RESULTS
            {
                self.truncated = true;
                return false;
            }
            self.scanned += 1;
            let Ok(entry) = entry else {
                self.truncated = true;
                continue;
            };
            let Some(item) = search_entry(root, &entry, self.all_directories) else {
                continue;
            };
            self.record(item, (entry.path(), depth), query);
        }
        true
    }

    fn record(&mut self, item: SearchEntry, target: (PathBuf, usize), query: &str) {
        let (path, depth) = target;
        // References prioritize source files; the browser also searches dependency and generated contents.
        if item.directory
            && (self.all_directories || !GENERATED_DIRECTORIES.contains(&item.name.as_str()))
        {
            if depth < MAX_DEPTH {
                self.pending.push_back((path, depth + 1));
            } else {
                self.truncated = true;
            }
        }
        if item.relative_path.to_lowercase().contains(query) {
            self.matches.push(item);
        }
    }
}

fn search_entry(root: &Path, entry: &fs::DirEntry, all_directories: bool) -> Option<SearchEntry> {
    let metadata = fs::symlink_metadata(entry.path()).ok()?;
    if is_link(&metadata) || (!metadata.is_file() && !metadata.is_dir()) {
        return None;
    }
    let name = entry.file_name().to_string_lossy().into_owned();
    if !all_directories && metadata.is_dir() && EXCLUDED_DIRECTORIES.contains(&name.as_str()) {
        return None;
    }
    let path = entry.path();
    let relative_path = path
        .strip_prefix(root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    Some(SearchEntry {
        name,
        path: execution_path(&path),
        directory: metadata.is_dir(),
        relative_path,
    })
}

#[cfg(windows)]
fn is_link(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_link(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(test)]
#[path = "project_file_search_tests.rs"]
mod tests;
