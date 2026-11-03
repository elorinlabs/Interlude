//! Per-download accounting: accepted blocks only, and success only after whole-package verification.
use super::Error;
use serde::Serialize;
use std::sync::Arc;

pub(super) type Delivery = Box<dyn FnOnce(Report) + Send>;
pub(super) type Reporter = Arc<dyn Fn() -> Option<Delivery> + Send + Sync>;

/// Owns one final report across shared downloads and their official fallback.
pub(super) struct Session {
    pub report: Report,
    delivery: Option<Delivery>,
}

impl Session {
    pub fn new(service: &super::Service, artifact: &str) -> Self {
        Self {
            report: Report::new(artifact),
            delivery: service.reporter.as_ref().and_then(|reporter| reporter()),
        }
    }

    pub fn finish(mut self, success: bool) {
        self.report.finish(success);
        self.deliver();
    }

    fn deliver(&mut self) {
        if let Some(delivery) = self.delivery.take() {
            // Moving the completed report avoids retaining a second copy of its accounting.
            let report = std::mem::replace(&mut self.report, Report::new(""));
            delivery(report);
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        // Early returns/cancellation must settle the original attempt, never create a second report.
        self.report.finish(false);
        self.deliver();
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Source {
    Peer,
    Server,
    Origin,
    Download,
}

#[derive(Serialize)]
struct Failure {
    source: Source,
    stage: &'static str,
    code: &'static str,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Report {
    id: String,
    artifact: String,
    platform: &'static str,
    outcome: &'static str,
    peer_bytes: usize,
    server_bytes: usize,
    origin_bytes: usize,
    failures: Vec<Failure>,
}

impl Report {
    pub fn new(artifact: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            artifact: artifact.into(),
            platform: std::env::consts::OS,
            outcome: "failed",
            peer_bytes: 0,
            server_bytes: 0,
            origin_bytes: 0,
            failures: Vec::new(),
        }
    }

    pub fn accepted(&mut self, source: Source, bytes: usize) {
        match source {
            Source::Peer => self.peer_bytes += bytes,
            Source::Server => self.server_bytes += bytes,
            Source::Origin => self.origin_bytes += bytes,
            Source::Download => {}
        }
    }

    pub fn failure(&mut self, source: Source, stage: &'static str, error: &Error) {
        let code = match error {
            Error::Invalid => "invalid",
            Error::Io(_) => "io",
            Error::Network(_) => "network",
            Error::Unavailable => "unavailable",
        };
        if let Some(failure) = self.failures.iter_mut().find(|failure| {
            failure.source == source && failure.stage == stage && failure.code == code
        }) {
            failure.count = (failure.count + 1).min(1000);
        } else if self.failures.len() < 16 {
            self.failures.push(Failure {
                source,
                stage,
                code,
                count: 1,
            });
        }
    }

    pub fn finish(&mut self, success: bool) {
        self.outcome = if success { "success" } else { "failed" };
        if !success && self.failures.is_empty() {
            self.failure(Source::Download, "transfer", &Error::Unavailable);
        }
    }

    pub fn interrupted(&mut self, error: &Error) {
        if self
            .failures
            .iter()
            .any(|failure| failure.source == Source::Download)
        {
            return;
        }
        let stage = if matches!(error, Error::Io(_)) {
            "storage"
        } else {
            "transfer"
        };
        self.failure(Source::Download, stage, error);
    }
}

pub(super) fn reporter<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Reporter {
    let app = app.clone();
    Arc::new(move || {
        // Unit tests never submit fixture downloads to a real server.
        if cfg!(test) {
            return None;
        }
        let route = crate::cloud::push_route(&app).ok().flatten()?;
        let app = app.clone();
        Some(Box::new(move |report| {
            tauri::async_runtime::spawn_blocking(move || match serde_json::to_value(report) {
                Ok(body) => crate::cloud::report_update_download(&app, &route, body),
                Err(_) => eprintln!("Could not encode download statistics"),
            });
        }))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixed_download_and_failure_codes_are_reported_without_exception_details() {
        let mut report = Report::new(&"a".repeat(64));
        report.accepted(Source::Peer, 10);
        report.accepted(Source::Server, 20);
        report.failure(Source::Peer, "connect", &Error::Unavailable);
        report.failure(Source::Peer, "connect", &Error::Unavailable);
        report.failure(Source::Download, "verify", &Error::Invalid);
        report.finish(false);
        let value = serde_json::to_value(report).unwrap();
        assert_eq!(value["peerBytes"], 10);
        assert_eq!(value["serverBytes"], 20);
        assert_eq!(value["outcome"], "failed");
        assert_eq!(value["failures"][0]["count"], 2);
        assert_eq!(value["failures"][1]["stage"], "verify");
    }
}
