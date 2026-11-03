use super::{UpstreamBody, UpstreamPayload};
use serde_json::Value;

const MAX_CAPACITY_ERROR_BYTES: usize = 64 * 1024;
const CAPACITY_ERROR_CODES: &[&str] = &["insufficient_balance", "insufficient_quota"];

/// Some providers report exhausted credit as 403, outside the configured transient HTTP errors.
/// Only explicit rejection codes permit failover; arbitrary permission errors remain unchanged.
pub(super) fn is_capacity_rejection(payload: &UpstreamPayload) -> bool {
    if !matches!(payload.status, 402 | 403) {
        return false;
    }
    let UpstreamBody::Buffered(body) = &payload.body else {
        return false;
    };
    if body.len() > MAX_CAPACITY_ERROR_BYTES {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<Value>(body) else {
        return false;
    };
    ["/code", "/type", "/error/code", "/error/type"]
        .into_iter()
        .filter_map(|path| value.pointer(path).and_then(Value::as_str))
        .any(|code| {
            CAPACITY_ERROR_CODES
                .iter()
                .any(|known| code.eq_ignore_ascii_case(known))
        })
}
