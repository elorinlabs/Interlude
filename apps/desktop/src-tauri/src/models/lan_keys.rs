pub(crate) const DEFAULT_LAN_USAGE_REVIEW_THRESHOLD: u32 = 1_000;
pub(crate) const MAX_LAN_USAGE_REVIEW_THRESHOLD: u32 = 1_000_000_000;

fn default_lan_usage_review_threshold() -> u32 {
    DEFAULT_LAN_USAGE_REVIEW_THRESHOLD
}

/// Locally stored LAN credentials. Secrets never cross the UI IPC boundary.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalProxyLanApiKey {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) api_key: String,
    pub(crate) enabled: bool,
    pub(crate) quota_usd: Option<f64>,
    #[serde(default = "default_lan_usage_review_threshold")]
    pub(crate) usage_review_threshold: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalProxyLanApiKeySummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) key_preview: String,
    pub(crate) enabled: bool,
    pub(crate) quota_usd: Option<f64>,
    pub(crate) used_tokens: u64,
    pub(crate) used_cost_usd: f64,
    pub(crate) remaining_usd: Option<f64>,
    pub(crate) usage_incomplete: bool,
    pub(crate) unconfirmed_requests: u64,
    pub(crate) usage_review_threshold: u32,
}

impl LocalProxyLanApiKeySummary {
    pub(crate) fn needs_usage_review(&self) -> bool {
        self.quota_usd.is_some()
            && self.unconfirmed_requests >= u64::from(self.usage_review_threshold)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveLocalProxyLanApiKey {
    pub(crate) id: Option<String>,
    pub(crate) name: String,
    pub(crate) api_key: Option<String>,
    pub(crate) enabled: bool,
    pub(crate) quota_usd: Option<f64>,
    #[serde(default)]
    pub(crate) acknowledge_usage: bool,
    pub(crate) usage_review_threshold: Option<u32>,
}
