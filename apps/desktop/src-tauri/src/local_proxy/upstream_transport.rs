//! Request upload and response reads have independent deadlines. Body progress is
//! measured when Hyper pulls a chunk, not as an acknowledgement from the server.
use bytes::Bytes;
use futures_util::stream;
use reqwest::{header, Method};
use std::{convert::Infallible, time::Duration};
use tokio::{sync::watch, time::Instant};

mod redirect;
mod response;
pub(super) use response::Response;

const UPLOAD_CHUNK_BYTES: usize = 64 * 1024;

#[derive(Clone, Copy)]
struct Timeouts {
    upload_idle: Duration,
    response_headers: Duration,
    response_idle: Duration,
    sse_response_idle: Option<Duration>,
}

impl Default for Timeouts {
    fn default() -> Self {
        Self {
            upload_idle: super::UPSTREAM_UPLOAD_IDLE_TIMEOUT,
            response_headers: super::response_header_timeout::current(),
            response_idle: super::UPSTREAM_RESPONSE_IDLE_TIMEOUT,
            sse_response_idle: super::sse_idle_timeout::current(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) enum Phase {
    Upload,
    ResponseHeaders,
}

impl std::fmt::Display for Phase {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Upload => "request upload",
            Self::ResponseHeaders => "response headers",
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub(super) enum Error {
    #[error("{source}")]
    Http {
        #[source]
        source: reqwest::Error,
        sent_bytes: usize,
    },
    #[error("request timed out during {phase} ({sent_bytes} body bytes handed to transport)")]
    Timeout { phase: Phase, sent_bytes: usize },
    #[error("upstream request requires a buffered body")]
    UnbufferedBody,
    #[error("upstream redirect limit exceeded ({0})")]
    RedirectLimit(u32),
    #[error("unsupported redirect scheme")]
    RedirectScheme,
    #[error(transparent)]
    Proxy(#[from] crate::system_proxy::ProxyResolutionError),
    #[error("{0}")]
    AfterRedirect(#[source] Box<Self>),
}

impl Error {
    pub(super) fn is_timeout(&self) -> bool {
        match self {
            Self::Timeout { .. } => true,
            Self::Http { source, .. } => source.is_timeout(),
            Self::AfterRedirect(source) => source.is_timeout(),
            Self::UnbufferedBody
            | Self::RedirectLimit(_)
            | Self::RedirectScheme
            | Self::Proxy(_) => false,
        }
    }

    pub(super) fn can_retry(&self) -> bool {
        match self {
            Self::Http { sent_bytes: 0, .. } => self.is_timeout() && self.is_connect(),
            Self::Timeout { sent_bytes: 0, .. } => true,
            _ => false,
        }
    }

    pub(super) fn is_connect(&self) -> bool {
        match self {
            Self::Http { source, .. } => source.is_connect(),
            Self::AfterRedirect(source) => source.is_connect(),
            _ => false,
        }
    }
}

impl From<reqwest::Error> for Error {
    fn from(source: reqwest::Error) -> Self {
        Self::Http {
            source,
            sent_bytes: 0,
        }
    }
}

/// Shared bytes make pre-upload retries cheap; none of the retry attempts mutate the body.
pub(super) struct Request {
    method: Method,
    url: reqwest::Url,
    headers: header::HeaderMap,
    body: Bytes,
    timeouts: Timeouts,
    deadline: Option<Instant>,
    max_redirects: u32,
}

impl Request {
    pub(super) fn prepare(builder: reqwest::blocking::RequestBuilder) -> Result<Self, Error> {
        let request = builder.build()?;
        let body = match request.body() {
            None => Bytes::new(),
            Some(body) => Bytes::copy_from_slice(body.as_bytes().ok_or(Error::UnbufferedBody)?),
        };
        Ok(Self {
            method: request.method().clone(),
            url: request.url().clone(),
            headers: request.headers().clone(),
            body,
            timeouts: Timeouts::default(),
            max_redirects: super::transport_settings::current().max_redirects,
            deadline: super::model_catalog_deadline::current(),
        })
    }

    pub(super) fn send(&self) -> Result<Response, Error> {
        // This entry point is called from the proxy's request worker, never the UI thread.
        tauri::async_runtime::block_on(async {
            let Some(deadline) = self.deadline else {
                return self.send_async().await;
            };
            if Instant::now() >= deadline {
                return Err(Error::Timeout {
                    phase: Phase::ResponseHeaders,
                    sent_bytes: 0,
                });
            }
            tokio::time::timeout_at(deadline, self.send_async())
                .await
                .map_err(|_| Error::Timeout {
                    phase: Phase::ResponseHeaders,
                    sent_bytes: 0,
                })?
        })
    }

    pub(super) fn can_retry(&self, error: &Error) -> bool {
        // Catalog failures go straight to Admin; chat keeps its existing pre-upload retries.
        self.deadline.is_none() && error.can_retry()
    }

    async fn send_async(&self) -> Result<Response, Error> {
        let mut target = redirect::Target::new(self);
        let mut sent_before_redirect = false;
        loop {
            let response = self.send_target(&target).await.map_err(|error| {
                // A connection failure after a POST redirect must not replay the original POST.
                if sent_before_redirect {
                    return Error::AfterRedirect(Box::new(error));
                }
                error
            })?;
            sent_before_redirect |= !target.body.is_empty();
            if !target.follow(&response)? {
                return Ok(Response::new(response, self.timeouts, &target.headers)
                    .with_deadline(self.deadline));
            }
        }
    }

    async fn send_target(&self, target: &redirect::Target) -> Result<reqwest::Response, Error> {
        let client = crate::system_proxy::apply_async(reqwest::Client::builder(), &target.url)
            .await?
            .connect_timeout(super::UPSTREAM_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let initial = Progress {
            sent_bytes: 0,
            updated_at: Instant::now(),
        };
        let (sender, receiver) = watch::channel(initial);
        let mut headers = target.headers.clone();
        // Recompute the length after request transformation; do not use chunked encoding
        // merely because progress is observed through a body stream.
        headers.remove(header::TRANSFER_ENCODING);
        headers.remove(header::CONTENT_LENGTH);
        if !target.body.is_empty() {
            headers.insert(header::CONTENT_LENGTH, target.body.len().into());
        }
        let mut request = client
            .request(target.method.clone(), target.url.clone())
            .headers(headers);
        if !target.body.is_empty() {
            request = request.body(upload_body(target.body.clone(), sender.clone()));
        }
        // Keep a sender alive even when Hyper finishes consuming the body. Otherwise a
        // closed watch channel would spin instead of waiting for response headers.
        let result = wait_for_headers(request, receiver, target.body.len(), self.timeouts).await;
        drop(sender);
        result
    }
}

#[derive(Clone, Copy)]
struct Progress {
    sent_bytes: usize,
    updated_at: Instant,
}

fn upload_body(bytes: Bytes, progress: watch::Sender<Progress>) -> reqwest::Body {
    let total_bytes = bytes.len();
    let chunks = stream::unfold(bytes, move |mut remaining| {
        let progress = progress.clone();
        async move {
            if remaining.is_empty() {
                return None;
            }
            let chunk = remaining.split_to(remaining.len().min(UPLOAD_CHUNK_BYTES));
            progress.send_replace(Progress {
                sent_bytes: total_bytes - remaining.len(),
                updated_at: Instant::now(),
            });
            Some((Ok::<_, Infallible>(chunk), remaining))
        }
    });
    reqwest::Body::wrap_stream(chunks)
}

async fn wait_for_headers(
    request: reqwest::RequestBuilder,
    mut progress: watch::Receiver<Progress>,
    body_bytes: usize,
    timeouts: Timeouts,
) -> Result<reqwest::Response, Error> {
    let response = request.send();
    tokio::pin!(response);
    loop {
        let current = *progress.borrow_and_update();
        let (_, deadline) = phase_deadline(current, body_bytes, timeouts);
        tokio::select! {
            result = &mut response => return result.map_err(|source| Error::Http {
                source, sent_bytes: progress.borrow().sent_bytes,
            }),
            _ = progress.changed() => continue,
            _ = tokio::time::sleep_until(deadline) => {
                // Progress can arrive in the same poll as the timer. Re-evaluate before
                // declaring an idle timeout.
                let latest = *progress.borrow();
                let (phase, latest_deadline) = phase_deadline(latest, body_bytes, timeouts);
                if Instant::now() >= latest_deadline {
                    return Err(Error::Timeout { phase, sent_bytes: latest.sent_bytes });
                }
            }
        }
    }
}

fn phase_deadline(progress: Progress, body_bytes: usize, timeouts: Timeouts) -> (Phase, Instant) {
    if progress.sent_bytes == body_bytes {
        return (
            Phase::ResponseHeaders,
            progress.updated_at + timeouts.response_headers,
        );
    }
    (Phase::Upload, progress.updated_at + timeouts.upload_idle)
}

#[cfg(test)]
mod model_deadline_tests;
#[cfg(test)]
mod proxy_tests;
#[cfg(test)]
mod tests;
