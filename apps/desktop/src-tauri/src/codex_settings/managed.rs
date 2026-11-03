use std::path::Path;
use toml_edit::{Item, Table};

use super::{document, error::ConfigError, models::SaveConfigRequest, persistence};

#[derive(Debug, thiserror::Error)]
pub(crate) enum ManagedMcpError {
    #[error("managed entry belongs to another application")]
    ForeignEntry,
    #[error("could not access managed configuration")]
    Storage,
}

fn owns_entry(existing: &Item, argument: &str, replacement: Option<&Table>) -> bool {
    let Some(args) = existing.get("args").and_then(Item::as_array) else {
        return false;
    };
    if args.iter().any(|arg| arg.as_str() == Some(argument)) {
        return true;
    }
    // GUI preferences used to copy home-scoped helpers from the source home. Only
    // re-registration may rebind a single helper argument for this executable.
    let Some(expected_command) = replacement.and_then(|table| table.get("command")) else {
        return false;
    };
    let command_matches =
        existing.get("command").and_then(Item::as_str) == expected_command.as_str();
    let Some((prefix, _)) = argument.split_once('=') else {
        return false;
    };
    let copied_helper = args.len() == 1
        && args
            .get(0)
            .and_then(|arg| arg.as_str())
            .and_then(|arg| arg.strip_prefix(&format!("{prefix}=")))
            .is_some_and(|id| id.len() == 64 && id.bytes().all(|byte| byte.is_ascii_hexdigit()));
    command_matches && copied_helper
}

/// Read a managed entry through the same serialized configuration access used by the editor.
pub(crate) fn managed_mcp_matches(
    home: &Path,
    name: &str,
    expected: &Table,
) -> Result<bool, String> {
    persistence::with_current_config(home, |path| {
        let current = persistence::read(path)?;
        let document = document::parse(&current.content)?;
        let Some(existing) = document
            .get("mcp_servers")
            .and_then(|servers| servers.get(name))
        else {
            return Ok(false);
        };
        let mut expected_document = toml_edit::DocumentMut::new();
        expected_document["entry"] = Item::Table(expected.clone());
        let mut actual_document = toml_edit::DocumentMut::new();
        actual_document["entry"] = existing.clone();
        let expected_values = document::values(&expected_document)?;
        let actual_values = document::values(&actual_document)?;
        Ok(expected
            .iter()
            .all(|(key, _)| actual_values["entry"][key] == expected_values["entry"][key]))
    })
    .map_err(|error| error.to_string())
}

/// Update only an MCP entry carrying the caller's exact managed argument, preserving other settings.
pub(crate) fn update_managed_mcp(
    home: &Path,
    name: &str,
    managed_argument: &str,
    replacement: Option<Table>,
) -> Result<(), ManagedMcpError> {
    persistence::with_current_config(home, |path| {
        let current = persistence::read(path)?;
        let mut document = document::parse(&current.content)?;
        if let Some(existing) = document
            .get("mcp_servers")
            .and_then(|servers| servers.get(name))
        {
            if !owns_entry(existing, managed_argument, replacement.as_ref()) {
                return Err(ConfigError::ManagedEntryConflict);
            }
        }
        if document.get("mcp_servers").is_none() && replacement.is_some() {
            document["mcp_servers"] = Item::Table(Table::new());
        }
        if let Some(servers) = document.get_mut("mcp_servers") {
            let servers = servers
                .as_table_like_mut()
                .ok_or(ConfigError::InvalidValue)?;
            match replacement {
                Some(table) => {
                    servers.insert(name, Item::Table(table));
                }
                None => {
                    servers.remove(name);
                }
            }
        }
        persistence::save(
            path,
            SaveConfigRequest {
                content: document.to_string(),
                expected_revision: current.revision,
            },
        )?;
        Ok(())
    })
    .map_err(|error| match error {
        ConfigError::ManagedEntryConflict => ManagedMcpError::ForeignEntry,
        _ => ManagedMcpError::Storage,
    })
}
