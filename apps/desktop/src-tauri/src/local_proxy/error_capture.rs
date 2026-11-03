use serde_json::Value;

use super::error_capture_diagnostics::{CaptureDiagnostics, Observation};
use super::stream_completion::{CompletionEvent, StreamCompletion};

const MAX_CAPTURE_BYTES: usize = 64 * 1024;
// Terminal Responses frames repeat the output and can exceed the diagnostic sample budget.
// Health checks and LAN accounting must validate those frames beyond the diagnostic sample.
// Keep a separate hard bound so an unbounded upstream frame cannot exhaust proxy memory.
const MAX_COMPLETION_CAPTURE_BYTES: usize = 8 * 1024 * 1024;
const MAX_ERROR_MESSAGE_CHARS: usize = 1000;
const GENERIC_UPSTREAM_ERROR: &str = "The upstream service returned an error.";
const INTERRUPTED_STREAM_ERROR: &str = "上游已结束传输，但没有发送完整的响应结束事件。";

#[derive(Clone, Copy, PartialEq, Eq)]
enum CapturePurpose {
    Diagnostics,
    MemberHealth,
    Accounting,
}

/// A structured failure found in bytes already read from the upstream response.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct ProxyCapturedError {
    pub(super) message: String,
    pub(super) status_code: Option<u16>,
}

/// Observes response bytes without consuming the transport or retaining normal conversation text.
pub(super) struct ErrorCapture {
    purpose: CapturePurpose,
    event_stream: bool,
    http_status: u16,
    buffer: Vec<u8>,
    buffer_bytes: u64,
    line_length: usize,
    last_byte: Option<u8>,
    reported: bool,
    completion: StreamCompletion,
    finished: bool,
    diagnostics: CaptureDiagnostics,
}

impl ErrorCapture {
    pub(super) fn new(event_stream: bool, http_status: u16) -> Self {
        Self {
            purpose: CapturePurpose::Diagnostics,
            event_stream,
            http_status,
            buffer: Vec::new(),
            buffer_bytes: 0,
            line_length: 0,
            last_byte: None,
            reported: false,
            completion: StreamCompletion::default(),
            finished: false,
            diagnostics: CaptureDiagnostics::default(),
        }
    }

    /// Output limits and content filtering complete a healthy request without a service failure.
    pub(super) fn new_for_health(event_stream: bool, http_status: u16) -> Self {
        Self {
            purpose: CapturePurpose::MemberHealth,
            ..Self::new(event_stream, http_status)
        }
    }

    /// Validates larger billing frames without relaxing failure or incomplete-response checks.
    pub(super) fn new_for_accounting(event_stream: bool, http_status: u16) -> Self {
        Self {
            purpose: CapturePurpose::Accounting,
            ..Self::new(event_stream, http_status)
        }
    }

    pub(super) fn terminal_seen(&self) -> bool {
        self.completion.seen()
    }

    pub(super) fn for_endpoint(mut self, path: &str) -> Self {
        if super::is_responses_endpoint(super::request_path(path)) {
            self.completion.require_responses();
        }
        self
    }

    pub(super) fn completion_unverified(&self) -> bool {
        self.completion.unverified()
    }

    pub(super) fn error_seen(&self) -> bool {
        self.reported
    }

    pub(super) fn diagnostic_summary(&self) -> Value {
        let mut summary = self.diagnostics.summary();
        summary["pendingBytes"] = self.buffer_bytes.into();
        summary["pendingCaptureTruncated"] = (self.buffer_bytes > self.buffer.len() as u64).into();
        summary["completionUnverified"] = self.completion_unverified().into();
        summary
    }

    /// Returns at most one failure for this response, including across subsequent calls.
    pub(super) fn observe(&mut self, bytes: &[u8]) -> Vec<ProxyCapturedError> {
        let mut errors = Vec::new();
        if self.finished || self.reported {
            return errors;
        }
        if !self.event_stream {
            self.buffer_bytes = self.buffer_bytes.saturating_add(bytes.len() as u64);
            let remaining = self.capture_limit().saturating_sub(self.buffer.len());
            self.buffer
                .extend_from_slice(&bytes[..bytes.len().min(remaining)]);
            return errors;
        }
        for &byte in bytes {
            if byte == b'\n' {
                self.finish_line(&mut errors);
            } else {
                self.line_length = self.line_length.saturating_add(1);
                self.last_byte = Some(byte);
                self.push_byte(byte);
            }
            if self.reported {
                break;
            }
        }
        errors
    }

    /// Call at upstream EOF or a read failure, rather than after an intentional client cancellation.
    pub(super) fn finish(&mut self) -> Vec<ProxyCapturedError> {
        let mut errors = Vec::new();
        if self.finished || self.reported {
            return errors;
        }
        self.finished = true;
        if self.event_stream {
            self.finish_event(&mut errors);
            if !self.reported
                && (self.http_status >= 400
                    || (!self.terminal_seen() && !self.completion_unverified()))
            {
                let message = if self.http_status >= 400 {
                    http_error_message(self.http_status)
                } else {
                    super::error_messages::localized(INTERRUPTED_STREAM_ERROR).to_string()
                };
                self.report(message, None, &mut errors);
            }
        } else {
            self.finish_json(&mut errors);
        }
        self.buffer.clear();
        self.buffer_bytes = 0;
        errors
    }

    /// Preserve the actual read failure instead of treating every network error as ordinary EOF.
    pub(super) fn finish_with_error(&mut self, error: &std::io::Error) -> Vec<ProxyCapturedError> {
        if self.finished || self.reported {
            return Vec::new();
        }
        let mut errors = Vec::new();
        self.finished = true;
        if self.event_stream {
            self.finish_event(&mut errors);
            if self.reported {
                return errors;
            }
        }
        self.report(
            super::request_error::RequestError::io(super::request_error::Stage::Read, error)
                .to_string(),
            None,
            &mut errors,
        );
        errors
    }

    fn finish_json(&mut self, errors: &mut Vec<ProxyCapturedError>) {
        let value = serde_json::from_slice::<Value>(&self.buffer).ok();
        let expected_incomplete = self.health_incomplete_is_terminal(
            value.as_ref().map(json_event_type).unwrap_or_default(),
            value.as_ref(),
        );
        if expected_incomplete {
            self.completion.complete();
        }
        let message = if self.http_status >= 400 {
            Some(
                value
                    .as_ref()
                    .and_then(structured_error_message)
                    .unwrap_or_else(|| http_error_message(self.http_status)),
            )
        } else if expected_incomplete {
            None
        } else {
            value
                .as_ref()
                .and_then(|value| sse_error_message(json_event_type(value), Some(value)))
        };
        self.diagnostics.observe(Observation {
            event_type: value.as_ref().map(json_event_type).unwrap_or_default(),
            value: value.as_ref(),
            bytes: &self.buffer,
            total_bytes: self.buffer_bytes,
            failure: message.is_some(),
        });
        if let Some(message) = message {
            self.report(
                message,
                value.as_ref().and_then(structured_error_status),
                errors,
            );
        }
    }

    fn push_byte(&mut self, byte: u8) {
        self.buffer_bytes = self.buffer_bytes.saturating_add(1);
        if self.buffer.len() < self.capture_limit() {
            self.buffer.push(byte);
        }
    }

    fn capture_limit(&self) -> usize {
        match self.purpose {
            CapturePurpose::Diagnostics => MAX_CAPTURE_BYTES,
            CapturePurpose::MemberHealth | CapturePurpose::Accounting => {
                MAX_COMPLETION_CAPTURE_BYTES
            }
        }
    }

    fn finish_line(&mut self, errors: &mut Vec<ProxyCapturedError>) {
        let blank =
            self.line_length == 0 || (self.line_length == 1 && self.last_byte == Some(b'\r'));
        if blank {
            self.finish_event(errors);
        } else {
            self.push_byte(b'\n');
        }
        self.line_length = 0;
        self.last_byte = None;
    }

    fn finish_event(&mut self, errors: &mut Vec<ProxyCapturedError>) {
        if self.buffer.is_empty() || self.reported {
            return;
        }
        let block = String::from_utf8_lossy(&self.buffer);
        let event = sse_event_name(&block);
        let data = sse_event_data(&block);
        let value = serde_json::from_str::<Value>(&data).ok();
        let payload_type = value
            .as_ref()
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str)
            .unwrap_or(event);
        let event_type = if matches!(event, "error" | "response.failed" | "response.incomplete") {
            event
        } else {
            payload_type
        };
        self.completion.observe(CompletionEvent {
            name: event,
            data: &data,
            value: value.as_ref(),
            truncated: self.buffer_bytes > self.buffer.len() as u64,
        });
        let expected_incomplete = self.health_incomplete_is_terminal(event_type, value.as_ref());
        let failure = if expected_incomplete {
            None
        } else {
            sse_error_message(event_type, value.as_ref())
        };
        let status = value.as_ref().and_then(structured_error_status);
        if expected_incomplete {
            self.completion.complete();
        }
        self.diagnostics.observe(Observation {
            event_type: if data.trim() == "[DONE]" {
                "[DONE]"
            } else {
                event_type
            },
            value: value.as_ref(),
            bytes: &self.buffer,
            total_bytes: self.buffer_bytes,
            failure: failure.is_some(),
        });
        self.buffer.clear();
        self.buffer_bytes = 0;
        if let Some(message) = failure {
            self.report(message, status, errors);
        }
    }

    fn health_incomplete_is_terminal(&self, event_type: &str, value: Option<&Value>) -> bool {
        self.purpose == CapturePurpose::MemberHealth
            && self.http_status < 400
            && value.is_some_and(|value| expected_incomplete(event_type, value))
    }

    fn report(
        &mut self,
        message: String,
        status: Option<u16>,
        errors: &mut Vec<ProxyCapturedError>,
    ) {
        self.reported = true;
        self.buffer.clear();
        self.buffer_bytes = 0;
        errors.push(ProxyCapturedError {
            message: message.chars().take(MAX_ERROR_MESSAGE_CHARS).collect(),
            status_code: (self.http_status >= 400)
                .then_some(self.http_status)
                .or(status),
        });
    }
}

fn sse_event_name(block: &str) -> &str {
    block
        .lines()
        .filter_map(|line| line.strip_prefix("event:"))
        .map(str::trim)
        .next()
        .unwrap_or_default()
}

fn sse_event_data(block: &str) -> String {
    block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n")
}

fn json_event_type(value: &Value) -> &str {
    value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_else(|| match value.get("status").and_then(Value::as_str) {
            Some("failed") => "response.failed",
            Some("incomplete") => "response.incomplete",
            _ => "",
        })
}

fn sse_error_message(event_type: &str, value: Option<&Value>) -> Option<String> {
    if event_type == "response.incomplete" {
        let reason = value.and_then(|value| {
            [
                "/response/incomplete_details/reason",
                "/incomplete_details/reason",
            ]
            .iter()
            .find_map(|path| value.pointer(path).and_then(nonempty_string))
        });
        return Some(match reason {
            Some(reason) => format!("The upstream response was incomplete: {reason}"),
            None => "The upstream response was incomplete.".to_string(),
        });
    }
    let explicit_error = value.is_some_and(has_explicit_error);
    if !matches!(event_type, "error" | "response.failed") && !explicit_error {
        return None;
    }
    Some(
        value
            .and_then(structured_error_message)
            .unwrap_or_else(|| GENERIC_UPSTREAM_ERROR.to_string()),
    )
}

fn expected_incomplete(event_type: &str, value: &Value) -> bool {
    if event_type != "response.incomplete"
        || has_explicit_error(value)
        || matches!(json_event_type(value), "error" | "response.failed")
        || ["/status", "/response/status"]
            .iter()
            .any(|path| value.pointer(path).and_then(Value::as_str) == Some("failed"))
    {
        return false;
    }
    [
        "/response/incomplete_details/reason",
        "/incomplete_details/reason",
    ]
    .iter()
    .find_map(|path| value.pointer(path).and_then(nonempty_string))
    .is_some_and(|reason| matches!(reason, "max_output_tokens" | "content_filter"))
}

fn has_explicit_error(value: &Value) -> bool {
    ["/error", "/response/error"].iter().any(|path| {
        value
            .pointer(path)
            .is_some_and(|error| error.is_object() || nonempty_string(error).is_some())
    })
}

fn structured_error_message(value: &Value) -> Option<String> {
    [
        "/error/message",
        "/error/detail",
        "/error",
        "/response/error/message",
        "/response/error/detail",
        "/response/error",
        "/detail",
        "/message",
    ]
    .iter()
    .find_map(|path| {
        value
            .pointer(path)
            .and_then(nonempty_string)
            .map(str::to_string)
    })
}

fn structured_error_status(value: &Value) -> Option<u16> {
    [
        "/error/status_code",
        "/error/status",
        "/response/error/status_code",
        "/response/error/status",
        "/status_code",
        "/status",
    ]
    .iter()
    .find_map(|path| {
        value
            .pointer(path)
            .and_then(Value::as_u64)
            .and_then(|status| u16::try_from(status).ok())
            .filter(|status| (400..600).contains(status))
    })
}

fn nonempty_string(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn http_error_message(status: u16) -> String {
    format!("The upstream service returned HTTP {status}.")
}

#[cfg(test)]
#[path = "error_capture_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "error_capture_diagnostic_tests.rs"]
mod diagnostic_tests;

#[cfg(test)]
#[path = "error_capture_health_tests.rs"]
mod health_tests;
