use super::{Client, GuiError, Result};
use sha2::{Digest, Sha256};

impl Client {
    /// Reload changed tools before the next turn without interrupting active conversations.
    pub(super) async fn refresh_plugins(&self) -> Result<()> {
        let home = self.home.clone();
        let revision = tauri::async_runtime::spawn_blocking(move || {
            std::fs::read(home.join("config.toml"))
                .map(|bytes| format!("{:x}", Sha256::digest(bytes)))
                .map_err(|_| GuiError::Startup)
        })
        .await
        .map_err(|_| GuiError::Startup)??;
        refresh_if_changed(&self.plugin_revision, revision, || {
            self.request_raw("config/mcpServer/reload", serde_json::json!({}))
        })
        .await
    }
}

async fn refresh_if_changed<F, Fut>(
    previous: &tokio::sync::Mutex<Option<String>>,
    revision: String,
    reload: F,
) -> Result<()>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<serde_json::Value>>,
{
    let mut previous = previous.lock().await;
    if previous.as_ref() == Some(&revision) {
        return Ok(());
    }
    reload().await?;
    *previous = Some(revision);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn configuration_changes_reload_once_before_concurrent_turns() {
        let previous = tokio::sync::Mutex::new(None);
        let calls = AtomicUsize::new(0);
        let reload = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(serde_json::json!({}))
        };
        let (first, second) = tokio::join!(
            refresh_if_changed(&previous, "installed".into(), reload),
            refresh_if_changed(&previous, "installed".into(), reload)
        );
        first.unwrap();
        second.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        refresh_if_changed(&previous, "disabled".into(), reload)
            .await
            .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn failed_refresh_remains_pending_for_the_next_attempt() {
        let previous = tokio::sync::Mutex::new(Some("before".into()));
        assert!(
            refresh_if_changed(&previous, "after".into(), || async { Err(GuiError::Rpc) })
                .await
                .is_err()
        );
        assert_eq!(previous.lock().await.as_deref(), Some("before"));
        refresh_if_changed(&previous, "after".into(), || async {
            Ok(serde_json::json!({}))
        })
        .await
        .unwrap();
        assert_eq!(previous.lock().await.as_deref(), Some("after"));
    }
}
