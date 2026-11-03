//! Safe, structured causes carried through legacy String-based request APIs.
//! Only enums and numeric positions cross this boundary; never embed request bodies or URLs.
use serde::{Deserialize, Serialize};
use std::{fmt, io};

mod chinese;
pub(super) mod japanese;
pub(super) mod russian;
mod upstream;
pub(super) use upstream::upstream;

const PREFIX: &str = "proxy_request_error:";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Stage {
    Request,
    Lite,
    Chat,
    Anthropic,
    Gemini,
    Responses,
    Read,
    Catalog,
    OutputLimit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Problem {
    ObjectRequired,
    ReasoningObject,
    UnsupportedEncoding,
    GzipDecode,
    ZstdDecode,
    Encode,
    Framing,
    MissingChoices,
    MissingTerminal,
    MissingEventType,
    EventTypeMismatch,
    InvalidEvent,
    MissingBlockIndex,
    BlockOrder,
    UnknownBlock,
    BlockDelta,
    DeltaText,
    ToolArguments,
    MissingStopReason,
    UnclosedBlock,
    MissingContent,
    InvalidTool,
    UnsupportedResponseContent,
    Incomplete,
    ContentFilter,
    InvalidModel,
    ModelEndpoint,
    MissingMaximum,
    InvalidMaximum,
    Prepare,
    CatalogSettings,
    CatalogAddress,
    CatalogInvalid,
    MissingItem,
    MissingItemId,
    MissingResponse,
    ResponseStatus,
    ContentMismatch,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum JsonKind {
    Syntax,
    Eof,
    Data,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum ReadFailure {
    Timeout,
    Deadline,
    Reset,
    Closed,
    Eof,
    InvalidData,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) enum Cause {
    Problem(Problem),
    Json {
        kind: JsonKind,
        line: usize,
        column: usize,
    },
    Read(ReadFailure),
    Http(u16),
    Upstream(upstream::Failure),
    Transport(super::error_messages::TransportFailure),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct RequestError {
    stage: Stage,
    cause: Cause,
}

impl RequestError {
    pub(super) fn new(stage: Stage, problem: Problem) -> Self {
        Self {
            stage,
            cause: Cause::Problem(problem),
        }
    }

    pub(super) fn http(stage: Stage, status: u16) -> Self {
        Self {
            stage,
            cause: Cause::Http(status),
        }
    }

    pub(super) fn transport(stage: Stage, detail: &str) -> Self {
        Self {
            stage,
            cause: Cause::Transport(super::error_messages::TransportFailure::classify(
                &detail.to_ascii_lowercase(),
            )),
        }
    }

    pub(super) fn json(stage: Stage, error: &serde_json::Error) -> Self {
        if let Some(kind) = error.io_error_kind() {
            return Self::io(stage, &io::Error::from(kind));
        }
        let kind = match error.classify() {
            serde_json::error::Category::Eof => JsonKind::Eof,
            serde_json::error::Category::Data => JsonKind::Data,
            _ => JsonKind::Syntax,
        };
        Self {
            stage,
            cause: Cause::Json {
                kind,
                line: error.line(),
                column: error.column(),
            },
        }
    }

    pub(super) fn io(stage: Stage, error: &io::Error) -> Self {
        if let Some(known) = error
            .get_ref()
            .and_then(|inner| inner.downcast_ref::<Self>())
        {
            return *known;
        }
        if let Some(known) = error
            .get_ref()
            .and_then(|inner| inner.downcast_ref::<reqwest::Error>())
            .and_then(|source| Self::http_read(stage, source))
        {
            return known;
        }
        let kind = match error.kind() {
            io::ErrorKind::TimedOut if error.to_string().contains("catalog deadline") => {
                ReadFailure::Deadline
            }
            io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock => ReadFailure::Timeout,
            io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted => ReadFailure::Reset,
            io::ErrorKind::BrokenPipe | io::ErrorKind::NotConnected => ReadFailure::Closed,
            io::ErrorKind::UnexpectedEof => ReadFailure::Eof,
            io::ErrorKind::InvalidData => ReadFailure::InvalidData,
            _ => ReadFailure::Other,
        };
        Self {
            stage,
            cause: Cause::Read(kind),
        }
    }

    fn http_read(stage: Stage, source: &reqwest::Error) -> Option<Self> {
        if source.is_timeout() {
            return Some(Self {
                stage,
                cause: Cause::Read(ReadFailure::Timeout),
            });
        }
        let detail = crate::local_proxy::diagnostic_error_causes(source)
            .join(": ")
            .to_ascii_lowercase();
        if [
            "connection reset",
            "connection closed",
            "broken pipe",
            "tls",
            "certificate",
            "os error 10054",
        ]
        .iter()
        .any(|marker| detail.contains(marker))
        {
            return Some(Self::transport(stage, &detail));
        }
        if detail.contains("unexpected eof") || detail.contains("incomplete message") {
            return Some(Self {
                stage,
                cause: Cause::Read(ReadFailure::Eof),
            });
        }
        None
    }

    /// Keep provenance when an error passes through String APIs or an intermediate SSE bridge.
    pub(super) fn wire(self) -> String {
        match serde_json::to_string(&self) {
            Ok(value) => format!("{PREFIX}{value}"),
            Err(_) => self.to_string(),
        }
    }

    pub(super) fn decode(value: &str) -> Option<Self> {
        serde_json::from_str(value.strip_prefix(PREFIX)?).ok()
    }
}

impl fmt::Display for RequestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ja {
            return japanese::fmt(self, f);
        }
        if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
            return russian::fmt(self, f);
        }
        chinese::fmt(self, f)
    }
}

impl std::error::Error for RequestError {}

/// Both catalog sources matter when automatic fallback fails.
pub(super) fn catalog_failure(official: RequestError, admin: RequestError) -> String {
    match serde_json::to_string(&(official, admin)) {
        Ok(value) => format!("proxy_catalog_error:{value}"),
        Err(_) => official.wire(),
    }
}

pub(super) fn catalog_message(value: &str) -> Option<String> {
    let (official, admin): (RequestError, RequestError) =
        serde_json::from_str(value.strip_prefix("proxy_catalog_error:")?).ok()?;
    if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ru {
        return Some(russian::catalog(&official, &admin));
    }
    if crate::storage::interface_language() == crate::storage::InterfaceLanguage::Ja {
        return Some(japanese::catalog(&official, &admin));
    }
    Some(chinese::catalog(&official, &admin))
}

#[cfg(test)]
mod tests;
