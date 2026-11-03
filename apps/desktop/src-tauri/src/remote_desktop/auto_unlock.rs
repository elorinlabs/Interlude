//! Windows credentials are write-only over the owner-authenticated desktop channel.
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[cfg(windows)]
mod identity;
#[cfg(windows)]
mod storage;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub(super) use windows::{apply, cancel, connect_saved, snapshot};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub enabled: bool,
    pub status: Status,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Status {
    Disabled,
    Ready,
    Unlocking,
    Failed,
    Unavailable,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Change {
    pub enabled: bool,
    pub username: Option<String>,
    pub password: Option<String>,
}
impl Drop for Change {
    fn drop(&mut self) {
        if let Some(password) = self.password.as_mut() {
            password.zeroize();
        }
    }
}
#[cfg(any(windows, test))]
impl Change {
    pub(super) fn validate(&self) -> std::result::Result<(), Error> {
        if !self.enabled {
            return if self.username.is_none() && self.password.is_none() {
                Ok(())
            } else {
                Err(Error::Invalid)
            };
        }
        if !self
            .username
            .as_deref()
            .is_some_and(|value| valid_text(value) && value.trim() == value)
            || !self.password.as_deref().is_some_and(valid_text)
        {
            return Err(Error::Invalid);
        }
        Ok(())
    }
}
#[cfg(any(windows, test))]
fn valid_text(value: &str) -> bool {
    !value.is_empty() && value.encode_utf16().count() <= 256 && !value.contains('\0')
}
#[cfg(any(windows, test))]
#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("请填写 Windows 账号和登录密码。")]
    Invalid,
    #[cfg(windows)]
    #[error("请使用这台电脑已绑定的 Windows 账号。")]
    Account,
    #[cfg(windows)]
    #[error("请先在电脑上更新应用并开启无人值守，再设置自动解锁。")]
    Unavailable,
    #[cfg(windows)]
    #[error("自动解锁设置未能保存，请重试。")]
    Storage,
}
#[cfg(windows)]
pub(crate) fn clear() -> crate::desktop_service::Result<()> {
    storage::clear().map_err(|_| crate::desktop_service::ServiceError::Storage)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_are_bounded_and_disabling_never_accepts_a_password() {
        for value in [
            serde_json::json!({"enabled":true}),
            serde_json::json!({"enabled":true,"username":"alice","password":""}),
            serde_json::json!({"enabled":true,"username":"alice","password":"\0"}),
            serde_json::json!({"enabled":false,"password":"secret"}),
            serde_json::json!({"enabled":true,"username":"a".repeat(257),"password":"secret"}),
        ] {
            assert!(serde_json::from_value::<Change>(value)
                .unwrap()
                .validate()
                .is_err());
        }
        for username in ["alice", "PC\\alice"] {
            let valid: Change = serde_json::from_value(serde_json::json!({
                "enabled":true,"username":username,"password":" valid password "}))
            .unwrap();
            assert!(valid.validate().is_ok());
        }
    }
}
