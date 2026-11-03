use bytes::{Buf, Bytes};
use std::{
    io::{self, Read},
    time::Duration,
};

/// Pulls bytes only when the downstream reader asks for them. Each upstream read has
/// its own optional idle timeout; SSE streams can wait without a deadline.
pub(in crate::local_proxy) struct Response {
    response: reqwest::Response,
    pending: Bytes,
    idle_timeout: Option<Duration>,
    response_idle: Duration,
    sse_response_idle: Option<Duration>,
    finished: bool,
    deadline: Option<tokio::time::Instant>,
}

impl Response {
    pub(super) fn new(
        mut response: reqwest::Response,
        timeouts: super::Timeouts,
        request_headers: &reqwest::header::HeaderMap,
    ) -> Self {
        restore_stream_content_type(&mut response, request_headers);
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok());
        let idle_timeout = if super::super::is_event_stream(content_type) {
            timeouts.sse_response_idle
        } else {
            Some(timeouts.response_idle)
        };
        Self {
            response,
            pending: Bytes::new(),
            idle_timeout,
            response_idle: timeouts.response_idle,
            sse_response_idle: timeouts.sse_response_idle,
            finished: false,
            deadline: None,
        }
    }

    /// Use detected framing while retaining the limits captured by this request worker.
    pub(in crate::local_proxy) fn select_streaming(&mut self, streaming: bool) {
        self.idle_timeout = if streaming {
            self.sse_response_idle
        } else {
            Some(self.response_idle)
        };
    }

    pub(super) fn with_deadline(mut self, deadline: Option<tokio::time::Instant>) -> Self {
        self.deadline = deadline;
        self
    }

    pub(in crate::local_proxy) fn status(&self) -> reqwest::StatusCode {
        self.response.status()
    }

    pub(in crate::local_proxy) fn headers(&self) -> &reqwest::header::HeaderMap {
        self.response.headers()
    }

    pub(in crate::local_proxy) fn bytes(mut self) -> io::Result<Vec<u8>> {
        let mut bytes = Vec::new();
        self.read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    fn next_chunk(&mut self) -> io::Result<Option<Bytes>> {
        tauri::async_runtime::block_on(async {
            let remaining = self
                .deadline
                .map(|deadline| deadline.saturating_duration_since(tokio::time::Instant::now()));
            let timeout = match (self.idle_timeout, remaining) {
                (Some(idle), Some(remaining)) => Some(idle.min(remaining)),
                (idle, remaining) => idle.or(remaining),
            };
            let Some(timeout) = timeout else {
                return self.response.chunk().await.map_err(io::Error::other);
            };
            if timeout.is_zero() {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "model catalog deadline exceeded",
                ));
            }
            tokio::time::timeout(timeout, self.response.chunk())
                .await
                .map_err(|_| {
                    io::Error::new(io::ErrorKind::TimedOut, "upstream response idle timeout")
                })?
                .map_err(io::Error::other)
        })
    }
}

fn restore_stream_content_type(
    response: &mut reqwest::Response,
    request_headers: &reqwest::header::HeaderMap,
) {
    use reqwest::header::{HeaderValue, ACCEPT, CONTENT_TYPE};
    if !response.status().is_success() || response.headers().contains_key(CONTENT_TYPE) {
        return;
    }
    let accepts_sse = request_headers.get_all(ACCEPT).iter().any(|value| {
        value.to_str().is_ok_and(|value| {
            value
                .split(',')
                .any(|media| media.trim().eq_ignore_ascii_case("text/event-stream"))
        })
    });
    if accepts_sse {
        // Infer framing before choosing timeouts or constructing health/diagnostic observers.
        response
            .headers_mut()
            .insert(CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));
    }
}

impl Read for Response {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() || self.finished {
            return Ok(0);
        }
        while self.pending.is_empty() {
            match self.next_chunk() {
                Ok(Some(chunk)) => self.pending = chunk,
                Ok(None) => {
                    self.finished = true;
                    return Ok(0);
                }
                Err(error) => {
                    self.finished = true;
                    return Err(error);
                }
            }
        }
        let count = buffer.len().min(self.pending.len());
        buffer[..count].copy_from_slice(&self.pending[..count]);
        self.pending.advance(count);
        Ok(count)
    }
}
