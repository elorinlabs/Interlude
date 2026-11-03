use super::{Cause, RequestError, Stage};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(in crate::local_proxy) enum Failure {
    Authentication,
    Permission,
    RateLimit,
    Quota,
    Model,
    Context,
    TooLarge,
    InvalidRequest,
    Overloaded,
    Timeout,
    Internal,
    ContentFilter,
    ToolArguments,
    Cancelled,
    Unknown,
}

fn classify(code: &str) -> Option<Failure> {
    Some(match code.to_ascii_lowercase().as_str() {
        "authentication_error" | "invalid_api_key" | "unauthenticated" => Failure::Authentication,
        "permission_error" | "permission_denied" | "access_denied" => Failure::Permission,
        "rate_limit_error" | "rate_limit_exceeded" | "resource_exhausted" => Failure::RateLimit,
        "insufficient_quota" | "quota_exceeded" | "billing_hard_limit_reached" => Failure::Quota,
        "not_found_error" | "not_found" | "model_not_found" => Failure::Model,
        "context_length_exceeded" | "context_window_exceeded" => Failure::Context,
        "request_too_large" | "request_too_large_error" => Failure::TooLarge,
        "invalid_request_error" | "invalid_argument" | "bad_request" => Failure::InvalidRequest,
        "overloaded_error" | "unavailable" | "service_unavailable" => Failure::Overloaded,
        "timeout_error" | "request_timeout" | "deadline_exceeded" => Failure::Timeout,
        "server_error" | "api_error" | "internal" | "internal_server_error" => Failure::Internal,
        "content_filter" | "safety" | "prohibited_content" | "recitation" => Failure::ContentFilter,
        "malformed_function_call" | "unexpected_tool_call" => Failure::ToolArguments,
        "cancelled" | "canceled" => Failure::Cancelled,
        _ => return None,
    })
}

/// Upstream text can echo credentials and conversation content. Translate recognized codes
/// instead. Internally generated bridge failures retain their structured, safe cause.
pub(in crate::local_proxy) fn upstream(stage: Stage, value: &Value) -> RequestError {
    let error = value
        .get("error")
        .or_else(|| value.pointer("/response/error"))
        .unwrap_or(value);
    if let Some(known) = error
        .get("message")
        .and_then(Value::as_str)
        .and_then(RequestError::decode)
    {
        return known;
    }
    for key in ["code", "type", "status"] {
        if let Some(reason) = error.get(key).and_then(Value::as_str).and_then(classify) {
            return RequestError {
                stage,
                cause: Cause::Upstream(reason),
            };
        }
    }
    if let Some(status) = error
        .get("code")
        .and_then(Value::as_u64)
        .and_then(|code| u16::try_from(code).ok())
        .filter(|code| (400..600).contains(code))
    {
        return RequestError::http(stage, status);
    }
    RequestError {
        stage,
        cause: Cause::Upstream(Failure::Unknown),
    }
}
