use super::{error_capture::ErrorCapture, is_event_stream, TokenUsageContext};

/// Failed requests leave the LAN key ledger untouched; successful requests still require complete usage.
#[derive(Clone, Copy)]
pub(super) enum LanUsageAccounting {
    Complete,
    Incomplete,
    Failed,
}

pub(super) struct LanUsageCapture {
    errors: ErrorCapture,
    read_failed: bool,
    event_stream: bool,
}

impl LanUsageCapture {
    pub(super) fn new(context: &TokenUsageContext) -> Self {
        let event_stream = captures_event_stream(context);
        Self {
            // Only successful HTTP responses reach token capture. Failures can still arrive in the body.
            errors: ErrorCapture::new_for_accounting(
                event_stream,
                reqwest::StatusCode::OK.as_u16(),
            ),
            read_failed: false,
            event_stream,
        }
    }

    pub(super) fn observe(&mut self, bytes: &[u8]) {
        // The separate proxy error observer owns logging; this observer only decides LAN accounting.
        drop(self.errors.observe(bytes));
    }

    pub(super) fn finish(&mut self, read_failed: bool) {
        self.read_failed |= read_failed;
        drop(self.errors.finish());
    }

    pub(super) fn accounting(&self, usage_complete: bool) -> LanUsageAccounting {
        if self.read_failed || self.errors.error_seen() {
            return LanUsageAccounting::Failed;
        }
        if self.event_stream && !self.errors.terminal_seen() {
            // Accounting can run before EOF. A usage marker alone must not authorize a charge.
            return if self.errors.completion_unverified() {
                LanUsageAccounting::Incomplete
            } else {
                LanUsageAccounting::Failed
            };
        }
        if usage_complete {
            LanUsageAccounting::Complete
        } else {
            LanUsageAccounting::Incomplete
        }
    }
}

pub(super) fn captures_event_stream(context: &TokenUsageContext) -> bool {
    let content_type = context.content_type.as_deref();
    if content_type.is_some_and(|value| value.contains("application/json")) {
        return false;
    }
    context.expects_event_stream || is_event_stream(content_type)
}

pub(super) fn buffered_accounting(body: &[u8], context: &TokenUsageContext) -> LanUsageAccounting {
    let mut capture = LanUsageCapture::new(context);
    capture.observe(body);
    capture.finish(false);
    capture.accounting(super::buffered_usage_complete(body))
}
