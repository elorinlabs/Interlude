//! Fetch global download settings asynchronously without reading local preferences.
use super::{
    policy::{Policy, Preferences},
    Error, Result, Service,
};
use std::{sync::Arc, time::Duration};

const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_POLICY_BYTES: usize = 4096;

pub(super) async fn run(service: Arc<Service>) {
    let Ok(client) = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build() else {
        eprintln!("Download settings client unavailable");
        return;
    };
    let mut server = service.mirror_base.subscribe();
    loop {
        let base = server.borrow_and_update().clone();
        if let Some(base) = base {
            // Failure keeps this run's last valid policy; a fresh client stays disabled.
            tokio::select! {
                result = refresh(&client, &service.policy, &base) => {
                    if let Err(error) = result {
                        eprintln!("Download settings refresh unavailable: {error}");
                    }
                }
                changed = server.changed() => {
                    if changed.is_err() { return; }
                    continue;
                }
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(REFRESH_INTERVAL) => {}
            changed = server.changed() => { if changed.is_err() { return; } }
        }
    }
}

async fn refresh(client: &reqwest::Client, policy: &Policy, base: &str) -> Result<()> {
    let mut response = client
        .get(format!(
            "{}/update-sharing/settings",
            base.trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|_| Error::Unavailable)?
        .error_for_status()
        .map_err(|_| Error::Unavailable)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| Error::Unavailable)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_POLICY_BYTES {
            return Err(Error::Invalid);
        }
        bytes.extend_from_slice(&chunk);
    }
    let settings: Preferences = serde_json::from_slice(&bytes).map_err(|_| Error::Invalid)?;
    policy.apply(base, settings).await
}

#[cfg(test)]
#[path = "remote_policy_tests.rs"]
mod tests;
