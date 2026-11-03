use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("unavailable")]
    Unavailable,
    #[error("busy")]
    Busy,
    #[error("credentials")]
    Credentials,
    #[error("storage")]
    Storage,
    #[error("connection")]
    Connection,
    #[error("login")]
    Login,
    #[error("switch")]
    Switch,
}
pub(crate) type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Quota {
    pub(crate) model: String,
    pub(crate) remaining_percent: Option<f64>,
    pub(crate) reset_at: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Account {
    pub(crate) id: String,
    pub(crate) subject: String,
    pub(crate) email: String,
    pub(crate) plan: String,
    pub(crate) quotas: Vec<Quota>,
    pub(crate) checked_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub(crate) installed: bool,
    pub(crate) active_id: Option<String>,
    pub(crate) current_email: Option<String>,
    pub(crate) accounts: Vec<Account>,
}

/// JWT claims identify a locally owned profile; they never grant remote authorization.
pub(super) fn identity(secret: &[u8]) -> Result<(String, String)> {
    let value: Value = serde_json::from_slice(secret).map_err(|_| Error::Credentials)?;
    if value
        .pointer("/token/refresh_token")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
    {
        return Err(Error::Credentials);
    }
    let encoded = value
        .get("id_token")
        .and_then(Value::as_str)
        .and_then(|token| token.split('.').nth(1))
        .ok_or(Error::Credentials)?;
    let claims: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| Error::Credentials)?,
    )
    .map_err(|_| Error::Credentials)?;
    let subject = claims
        .get("sub")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 256)
        .ok_or(Error::Credentials)?
        .to_string();
    let email = claims
        .get("email")
        .and_then(Value::as_str)
        .filter(|s| s.contains('@') && s.len() <= 320)
        .ok_or(Error::Credentials)?
        .to_string();
    Ok((subject, email))
}

pub(super) fn apply_status(account: &mut Account, response: &Value) -> Result<()> {
    let status = response.get("userStatus").ok_or(Error::Connection)?;
    let email = status
        .get("email")
        .and_then(Value::as_str)
        .ok_or(Error::Connection)?;
    if !account.email.eq_ignore_ascii_case(email) {
        return Err(Error::Credentials);
    }
    account.plan = status
        .pointer("/userTier/name")
        .or_else(|| status.pointer("/planStatus/planInfo/planName"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    account.quotas = status
        .pointer("/cascadeModelConfigData/clientModelConfigs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let info = item.get("quotaInfo")?;
            let remaining = match info.get("remainingFraction") {
                Some(value) => value
                    .as_f64()
                    .filter(|n| n.is_finite() && (0.0..=1.0).contains(n)),
                // Protobuf omits default numeric zero; presence of quotaInfo distinguishes it from unknown.
                None => Some(0.0),
            };
            Some(Quota {
                model: item.get("label").and_then(Value::as_str)?.to_string(),
                remaining_percent: remaining.map(|n| (n * 1000.0).round() / 10.0),
                reset_at: info
                    .get("resetTime")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect();
    account.checked_at = Some(chrono::Utc::now().timestamp());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn rejects_missing_oauth_and_mismatched_identity() {
        assert!(identity(br#"{"token":{"access_token":"x"}}"#).is_err());
        let mut account = Account {
            email: "one@example.invalid".into(),
            ..Default::default()
        };
        assert!(apply_status(
            &mut account,
            &json!({"userStatus":{"email":"two@example.invalid"}})
        )
        .is_err());
    }
    #[test]
    fn distinguishes_exhausted_unknown_and_fractional_quota() {
        let mut account = Account {
            email: "one@example.invalid".into(),
            ..Default::default()
        };
        let response = json!({"userStatus":{"email":account.email.clone(),
        "cascadeModelConfigData":{"clientModelConfigs":[
            {"label":"zero","quotaInfo":{}},{"label":"fraction","quotaInfo":{"remainingFraction":0.456}},
            {"label":"unknown"},{"label":"invalid","quotaInfo":{"remainingFraction":2}}
        ]}}});
        apply_status(&mut account, &response).unwrap();
        assert_eq!(account.quotas.len(), 3);
        assert_eq!(account.quotas[0].remaining_percent, Some(0.0));
        assert_eq!(account.quotas[1].remaining_percent, Some(45.6));
        assert_eq!(account.quotas[2].remaining_percent, None);
    }
}
