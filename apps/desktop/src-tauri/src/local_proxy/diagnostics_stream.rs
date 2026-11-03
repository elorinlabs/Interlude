fn attach_diagnostic_response(mut payload: UpstreamPayload, endpoint: &str) -> UpstreamPayload {
    let Some(context) = current_diagnostic_context() else {
        return payload;
    };
    context.emit(json!({ "event": "response_ready", "result": diagnostic_payload(&payload) }));
    let mut capture = error_capture::ErrorCapture::new(
        is_event_stream(payload.content_type.as_deref()),
        payload.status,
    )
    .for_endpoint(endpoint);
    payload.body = match payload.body {
        UpstreamBody::Streaming(inner) => {
            UpstreamBody::Streaming(Box::new(DiagnosticStreamReader {
                inner,
                context,
                capture,
                bytes: 0,
                first_byte_ms: None,
                last_byte_ms: None,
                http_status: payload.status,
                content_type: payload.content_type.clone(),
                finished: false,
            }))
        }
        UpstreamBody::Buffered(body) => {
            capture.observe(&body);
            capture.finish();
            context.emit(json!({
                "event": "response_buffered", "bytes": body.len(),
                "upstreamErrorSeen": capture.error_seen(), "stream": capture.diagnostic_summary()
            }));
            UpstreamBody::Buffered(body)
        }
    };
    payload
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum DiagnosticStreamOutcome {
    Eof,
    UpstreamError,
    ReadError,
    DroppedBeforeEof,
}

struct DiagnosticStreamReader {
    inner: Box<dyn Read + Send>,
    context: DiagnosticContext,
    capture: error_capture::ErrorCapture,
    bytes: u64,
    first_byte_ms: Option<u64>,
    last_byte_ms: Option<u64>,
    http_status: u16,
    content_type: Option<String>,
    finished: bool,
}

impl DiagnosticStreamReader {
    fn record_errors(&self, errors: Vec<error_capture::ProxyCapturedError>) {
        for error in errors {
            self.context.emit(json!({
                "event": "response_stream_error", "status": error.status_code,
                "httpStatus": self.http_status, "contentType": self.content_type,
                "error": crate::error_logs::sanitize_diagnostic_message(&error.message),
                "details": self.capture.diagnostic_summary()["failure"]
            }));
        }
    }

    fn finish(&mut self, outcome: DiagnosticStreamOutcome) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.context.emit(json!({
            "event": "response_stream_finished", "outcome": outcome,
            "bytes": self.bytes, "firstByteMs": self.first_byte_ms,
            "lastByteMs": self.last_byte_ms,
            "idleMs": self.last_byte_ms.map(|last| {
                (self.context.started_at.elapsed().as_millis() as u64).saturating_sub(last)
            }),
            "httpStatus": self.http_status, "contentType": self.content_type,
            "terminalEventSeen": self.capture.terminal_seen(),
            "upstreamErrorSeen": self.capture.error_seen(),
            "stream": self.capture.diagnostic_summary()
        }));
    }
}

impl Read for DiagnosticStreamReader {
    fn read(&mut self, target: &mut [u8]) -> io::Result<usize> {
        if target.is_empty() {
            return Ok(0);
        }
        // Read once, with no prefetch or buffering of normal conversation content.
        match self.inner.read(target) {
            Ok(0) => {
                let errors = self.capture.finish();
                self.record_errors(errors);
                self.finish(if self.capture.error_seen() {
                    DiagnosticStreamOutcome::UpstreamError
                } else {
                    DiagnosticStreamOutcome::Eof
                });
                Ok(0)
            }
            Ok(count) => {
                self.bytes = self.bytes.saturating_add(count as u64);
                let elapsed = self.context.started_at.elapsed().as_millis() as u64;
                self.first_byte_ms.get_or_insert(elapsed);
                self.last_byte_ms = Some(elapsed);
                let errors = self.capture.observe(&target[..count]);
                self.record_errors(errors);
                Ok(count)
            }
            Err(error) => {
                let errors = self.capture.finish_with_error(&error);
                self.record_errors(errors);
                self.context.emit(json!({
                    "event": "response_stream_error", "kind": format!("{:?}", error.kind()),
                    "httpStatus": self.http_status, "contentType": self.content_type,
                    "error": crate::error_logs::sanitize_diagnostic_message(&error.to_string()),
                    "causes": diagnostic_error_causes(&error)
                }));
                self.finish(DiagnosticStreamOutcome::ReadError);
                Err(error)
            }
        }
    }
}

impl Drop for DiagnosticStreamReader {
    fn drop(&mut self) {
        // Without EOF we cannot claim success or distinguish cancellation from another consumer drop.
        self.finish(DiagnosticStreamOutcome::DroppedBeforeEof);
    }
}
