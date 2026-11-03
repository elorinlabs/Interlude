use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

use super::super::account_selection::{self, GuiAccountSelection};
use super::error::{Error, Result};
use crate::{auth, codex_api, commands, storage};

#[derive(Clone)]
pub(super) struct Account {
    pub(super) id: String,
    pub(super) revision: u64,
}

pub(super) struct Credentials {
    pub(super) token: String,
    pub(super) account_id: String,
}

pub(super) fn selected(app: &AppHandle) -> Result<Account> {
    let snapshot = account_selection::snapshot(app).map_err(|_| Error::Unavailable)?;
    let GuiAccountSelection::Account(id) = snapshot.selection else {
        return Err(Error::AccountRequired);
    };
    // Resolve persisted IDs against the catalog before constructing credential paths.
    let accounts = commands::list_accounts_blocking(app.clone()).map_err(|_| Error::Unavailable)?;
    if !accounts
        .iter()
        .any(|entry| entry.id == id && entry.local_proxy_compatible)
    {
        return Err(Error::AccountRequired);
    }
    let account = Account {
        id,
        revision: snapshot.revision,
    };
    let paths = storage::resolve_paths(app).map_err(|_| Error::Unavailable)?;
    credentials(&load(&paths, &account.id)?)?;
    Ok(account)
}

pub(super) fn check(app: &AppHandle, account: &Account) -> Result<()> {
    let current = account_selection::snapshot(app).map_err(|_| Error::Unavailable)?;
    if current.revision != account.revision
        || current.selection != GuiAccountSelection::Account(account.id.clone())
    {
        return Err(Error::AccountChanged);
    }
    Ok(())
}

fn load(paths: &storage::Paths, id: &str) -> Result<Value> {
    commands::load_validated_managed_auth(paths, id).map_err(|_| Error::Authentication)
}

fn credentials(value: &Value) -> Result<Credentials> {
    if auth::is_agent_identity_auth(value) {
        return Err(Error::AccountRequired);
    }
    let token = auth::token_string(value, "access_token").ok_or(Error::Authentication)?;
    let (_, _, account_id, _) = auth::account_fields(value).map_err(|_| Error::Authentication)?;
    Ok(Credentials {
        token: token.to_owned(),
        account_id: account_id.ok_or(Error::Authentication)?,
    })
}

/// Reload concurrent refreshes and persist with compare-and-swap, never overwrite newer tokens.
fn refresh(paths: &storage::Paths, account: &Account, value: &mut Value) -> Result<()> {
    let expected = value.clone();
    let latest = load(paths, &account.id)?;
    if latest != expected {
        *value = latest;
        return Ok(());
    }
    let client = crate::system_proxy::apply(reqwest::blocking::Client::builder())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| Error::Network)?;
    if codex_api::refresh_tokens(&client, value).is_err() {
        let latest = load(paths, &account.id)?;
        if latest == expected {
            return Err(Error::Authentication);
        }
        *value = latest;
        return Ok(());
    }
    if !storage::write_managed_auth_if_unchanged(paths, &account.id, &expected, value)
        .map_err(|_| Error::Unavailable)?
    {
        *value = load(paths, &account.id)?;
    }
    Ok(())
}

pub(super) async fn authorize(
    app: AppHandle,
    account: Account,
    rejected_token: Option<String>,
) -> Result<Credentials> {
    tauri::async_runtime::spawn_blocking(move || {
        check(&app, &account)?;
        let paths = storage::resolve_paths(&app).map_err(|_| Error::Unavailable)?;
        let mut value = load(&paths, &account.id)?;
        let current = credentials(&value)?;
        if codex_api::token_expiring(&value) || rejected_token.as_ref() == Some(&current.token) {
            refresh(&paths, &account, &mut value)?;
        }
        check(&app, &account)?;
        credentials(&value)
    })
    .await
    .map_err(|_| Error::Unavailable)?
}
