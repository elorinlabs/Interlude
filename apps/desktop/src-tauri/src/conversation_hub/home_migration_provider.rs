use super::*;

/// Supported routes for conversations moved to another Codex Home.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
pub(crate) enum MigrationModelProvider {
    #[serde(rename = "openai")]
    Openai,
    #[serde(rename = "codex-switch-local")]
    Local,
    #[serde(rename = "codex-switch-gui")]
    Gui,
}

#[derive(Clone, Copy)]
pub(super) struct MigrationDestination<'a> {
    pub path: &'a Path,
    pub model_provider: Option<MigrationModelProvider>,
}

impl MigrationModelProvider {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Local => "codex-switch-local",
            Self::Gui => "codex-switch-gui",
        }
    }

    /// Update only the relocated copy; rollback must retain the source provider.
    pub(super) fn apply_to_manifest(self, manifest: &mut BinManifest) {
        let Some(row) = manifest
            .state_backup
            .as_mut()
            .and_then(|backup| backup.thread.as_mut())
        else {
            return;
        };
        for (column, cell) in row.columns.iter().zip(&mut row.values) {
            if column == "model_provider" {
                *cell = SqliteCell::Text(self.as_str().to_string());
            }
        }
    }
}
