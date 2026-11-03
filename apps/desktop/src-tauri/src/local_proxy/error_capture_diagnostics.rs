use std::collections::VecDeque;

use serde_json::{json, Value};

const MAX_RECENT_EVENTS: usize = 12;
const MAX_EVENT_TYPE_CHARS: usize = 128;
const FAILURE_FIELDS: &[(&str, [&str; 3])] = &[
    (
        "message",
        ["/response/error/message", "/error/message", "/message"],
    ),
    (
        "detail",
        ["/response/error/detail", "/error/detail", "/detail"],
    ),
    ("code", ["/response/error/code", "/error/code", "/code"]),
    ("type", ["/response/error/type", "/error/type", "/type"]),
    ("param", ["/response/error/param", "/error/param", "/param"]),
    (
        "status",
        ["/response/error/status", "/error/status", "/status"],
    ),
    (
        "statusCode",
        [
            "/response/error/status_code",
            "/error/status_code",
            "/status_code",
        ],
    ),
    (
        "incompleteReason",
        [
            "/response/incomplete_details/reason",
            "/incomplete_details/reason",
            "/reason",
        ],
    ),
    (
        "retryAfter",
        [
            "/response/error/retry_after",
            "/error/retry_after",
            "/retry_after",
        ],
    ),
];

/// One bounded event or JSON body already consumed by the response reader.
pub(super) struct Observation<'a> {
    pub(super) event_type: &'a str,
    pub(super) value: Option<&'a Value>,
    pub(super) bytes: &'a [u8],
    pub(super) total_bytes: u64,
    pub(super) failure: bool,
}

/// Keeps only event positions and allowlisted error fields, never normal output payloads.
#[derive(Default)]
pub(super) struct CaptureDiagnostics {
    events: u64,
    unparsed_events: u64,
    truncated_events: u64,
    recent_events: VecDeque<Value>,
    response_id_hash: Option<String>,
    sequence_number: Option<u64>,
    failure: Option<Value>,
}

impl CaptureDiagnostics {
    pub(super) fn observe(&mut self, observation: Observation<'_>) {
        self.events = self.events.saturating_add(1);
        let truncated = observation.total_bytes > observation.bytes.len() as u64;
        self.truncated_events += u64::from(truncated);
        self.unparsed_events +=
            u64::from(observation.value.is_none() && observation.event_type != "[DONE]");
        self.record_event(&observation);
        if observation.failure {
            self.failure = Some(failure_details(&observation));
        }
    }

    pub(super) fn summary(&self) -> Value {
        json!({
            "eventCount": self.events,
            "unparsedEvents": self.unparsed_events,
            "truncatedEvents": self.truncated_events,
            "recentEvents": self.recent_events,
            "responseIdHash": self.response_id_hash,
            "lastSequenceNumber": self.sequence_number,
            "failure": self.failure
        })
    }

    fn record_event(&mut self, observation: &Observation<'_>) {
        let event_type = safe_event_type(observation.event_type);
        if let Some(last) = self
            .recent_events
            .back_mut()
            .filter(|last| last["type"] == event_type)
        {
            last["count"] = json!(last["count"].as_u64().unwrap_or_default().saturating_add(1));
        } else {
            if self.recent_events.len() == MAX_RECENT_EVENTS {
                self.recent_events.pop_front();
            }
            self.recent_events
                .push_back(json!({ "type": event_type, "count": 1 }));
        }
        let Some(value) = observation.value else {
            return;
        };
        if let Some(response_id) = value.pointer("/response/id").and_then(Value::as_str) {
            self.response_id_hash = Some(super::short_hash_str(response_id));
        }
        if let Some(sequence) = value.get("sequence_number").and_then(Value::as_u64) {
            self.sequence_number = Some(sequence);
        }
    }
}

fn safe_event_type(value: &str) -> String {
    crate::error_logs::sanitize_diagnostic_message(&super::truncate_for_log(
        value,
        MAX_EVENT_TYPE_CHARS,
    ))
}

fn failure_details(observation: &Observation<'_>) -> Value {
    let mut details = json!({
        "eventType": safe_event_type(observation.event_type),
        "payloadBytes": observation.total_bytes,
        "capturedBytes": observation.bytes.len(),
        "capturedHash": super::short_hash_bytes(observation.bytes),
        "captureTruncated": observation.total_bytes > observation.bytes.len() as u64,
        "jsonParsed": observation.value.is_some(),
        "fieldsTruncated": false,
        "redacted": true
    });
    if let Some(value) = observation.value {
        copy_failure_fields(value, &mut details);
    }
    details
}

fn copy_failure_fields(value: &Value, details: &mut Value) {
    for (name, paths) in FAILURE_FIELDS {
        let Some(field) = paths.iter().find_map(|path| value.pointer(path)) else {
            continue;
        };
        copy_scalar(details, name, field);
    }
    if let Some(message) = ["/response/error", "/error"]
        .iter()
        .find_map(|path| value.pointer(path).filter(|value| value.is_string()))
    {
        copy_scalar(details, "message", message);
    }
    if let Some(request_id) = [
        "/request_id",
        "/error/request_id",
        "/response/error/request_id",
    ]
    .iter()
    .find_map(|path| value.pointer(path).and_then(Value::as_str))
    {
        details["upstreamRequestIdHash"] = json!(super::short_hash_str(request_id));
    }
}

fn copy_scalar(details: &mut Value, name: &str, value: &Value) {
    match value {
        Value::String(text) => {
            if text.chars().count() > crate::error_logs::DIAGNOSTIC_MESSAGE_MAX_CHARS {
                details["fieldsTruncated"] = json!(true);
            }
            details[name] = json!(crate::error_logs::sanitize_diagnostic_message(text));
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => details[name] = value.clone(),
        _ => {}
    }
}
