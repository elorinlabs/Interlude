#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountArchivePayload {
    format_version: u16,
    exported_at: String,
    active_account_id: Option<String>,
    #[serde(default)]
    active_provider_id: Option<String>,
    accounts: Vec<AccountArchiveEntry>,
    #[serde(default)]
    providers: Vec<Value>,
    #[serde(default)]
    aggregates: Vec<Value>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    saved_logins: std::collections::BTreeMap<String, crate::account_recovery::Secret>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountArchiveEntry {
    id: String,
    auth: Value,
    #[serde(default)]
    group: String,
    note: String,
    expires_at: String,
    #[serde(default)]
    private_details: AccountPrivateDetails,
    usage: UsageSummary,
    #[serde(default)]
    auto_switch_priority: i32,
    #[serde(default)]
    auto_switch_threshold: f64,
    #[serde(default)]
    last_modified_at: Option<String>,
}

#[derive(Debug)]
struct AccountArchiveImportResult {
    imported: usize,
}
