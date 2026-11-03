use crate::{
    auth::{account_fields, canonicalize_chatgpt_auth, validate_auth},
    models::{AccountPrivateDetails, UsageSummary},
    storage::{
        account_group_path, account_private_details_path, auto_switch_priority_path,
        auto_switch_threshold_path, expiration_path, load_account_group,
        load_account_private_details, load_auto_switch_priority, load_auto_switch_threshold,
        load_expiration, load_note, load_or_init_last_modified, load_usage, managed_auth_path,
        note_path, parse_last_modified, read_json, resolve_paths, save_account_group,
        save_account_last_modified, save_account_private_details, save_auto_switch_priority,
        save_auto_switch_threshold, save_expiration, save_note, usage_path,
        write_managed_auth_if_changed,
    },
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::Path};
use tauri::Manager;
use tauri::{Emitter, Runtime};
pub(crate) mod folder_sync;
mod legacy_codec;
mod password_crypto;
pub(crate) mod portable;
mod portable_file;
mod vault_transaction;

include!("types_and_commands.rs");
include!("accounts.rs");
include!("full_snapshot.rs");

fn decode_archive(path: &Path) -> Result<AccountArchivePayload, String> {
    serde_json::from_value(legacy_codec::read(path)?).map_err(|_| "folderSyncFormat".into())
}
