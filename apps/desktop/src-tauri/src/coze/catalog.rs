use super::{lifecycle, state::CozeState, Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{io::Read, time::Duration};
use tauri::Manager;

#[derive(Deserialize, Serialize)]
pub(crate) struct CatalogEntry {
    id: String,
    name: String,
    kind: String,
    description: String,
}

/// Start only an installed component and return metadata without its owner credential.
pub(crate) async fn list(app: tauri::AppHandle) -> Result<Vec<CatalogEntry>> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = {
            let state = app.state::<CozeState>();
            let _operation = state.begin()?;
            lifecycle::start(&app)?
        };
        let mut url = url::Url::parse(status.url.as_deref().ok_or(Error::Startup)?)
            .map_err(|_| Error::Startup)?;
        let token = url::form_urlencoded::parse(url.fragment().unwrap_or_default().as_bytes())
            .find(|(key, _)| key == "token")
            .map(|(_, value)| value.into_owned())
            .ok_or(Error::Startup)?;
        url.set_fragment(None);
        url.set_path("/mcp");
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| Error::Startup)?;
        let mut bytes = Vec::new();
        client
            .post(url)
            .bearer_auth(token)
            .json(&json!({"jsonrpc":"2.0","id":1,
            "method":"tools/call","params":{"name":"coze_list","arguments":{}}}))
            .send()
            .map_err(|_| Error::Startup)?
            .error_for_status()
            .map_err(|_| Error::Startup)?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::Startup)?;
        if bytes.len() > 1024 * 1024 {
            return Err(Error::Startup);
        }
        let response: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| Error::Startup)?;
        let text = response
            .pointer("/result/content/0/text")
            .and_then(|value| value.as_str())
            .ok_or(Error::Startup)?;
        serde_json::from_str(text).map_err(|_| Error::Startup)
    })
    .await
    .map_err(|_| Error::Startup)?
}
