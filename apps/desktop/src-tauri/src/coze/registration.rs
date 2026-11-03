use super::{Error, Result};
use std::path::Path;
use toml_edit::{value, Array, Table};

pub(super) fn register(app: &tauri::AppHandle, executable: &Path, state_file: &Path) -> Result<()> {
    let argument = format!("--coze-mcp={}", state_file.to_string_lossy());
    let source = crate::storage::resolve_paths(app)
        .map_err(|_| Error::Storage)?
        .codex_home;
    let gui = crate::codex_home::gui_home(app).map_err(|_| Error::Storage)?;
    for home in [source, gui] {
        let mut entry = Table::new();
        entry["command"] = value(executable.to_string_lossy().as_ref());
        entry["args"] = value(Array::from_iter([argument.as_str()]));
        entry["startup_timeout_sec"] = value(15);
        entry["tool_timeout_sec"] = value(330);
        if crate::codex_settings::managed_mcp_matches(&home, "remoteai_coze", &entry)
            .map_err(|_| Error::Storage)?
        {
            continue;
        }
        entry["enabled"] = value(true);
        crate::codex_settings::update_managed_mcp(&home, "remoteai_coze", &argument, Some(entry))
            .map_err(|error| match error {
            crate::codex_settings::ManagedMcpError::ForeignEntry => Error::McpConflict,
            crate::codex_settings::ManagedMcpError::Storage => Error::Storage,
        })?;
    }
    Ok(())
}
