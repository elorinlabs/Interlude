use std::{error::Error, io};

const MAX_ERROR_DEPTH: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, thiserror::Error)]
enum ConnectionFailure {
    #[error("The connection timed out. Check your network and proxy settings, then try again.")]
    Timeout,
    #[error("The server address could not be resolved. Check your DNS settings, then try again.")]
    Dns,
    #[error("The security certificate could not be verified. Check your computer's date and network security settings.")]
    Certificate,
    #[error("The proxy connection failed. Check your proxy settings, then try again.")]
    Proxy,
    #[error("The connection was refused. Check that the server or proxy is available.")]
    Refused,
    #[error("Network access was denied. Check whether your firewall or security software allows this app to connect.")]
    Blocked,
    #[error("Could not connect to the server. Check your network, proxy and firewall settings.")]
    Connect,
    #[error("The network request failed. Check your connection, then try again.")]
    Other,
}

/// Inspect the source chain because reqwest's Display omits connection failures. Only known
/// descriptions cross IPC; URLs, proxy credentials and arbitrary system errors stay private.
pub(super) fn request_error(action: &str, error: reqwest::Error) -> String {
    let failure = if error.is_timeout() {
        ConnectionFailure::Timeout
    } else {
        source_failure(error.source()).unwrap_or_else(|| {
            if error.is_connect() {
                ConnectionFailure::Connect
            } else {
                ConnectionFailure::Other
            }
        })
    };
    format!("{action} failed: {failure}")
}

fn source_failure(mut source: Option<&(dyn Error + 'static)>) -> Option<ConnectionFailure> {
    for _ in 0..MAX_ERROR_DEPTH {
        let cause = source?;
        let description = cause.to_string().to_ascii_lowercase();
        if let Some(failure) = described_failure(&description) {
            return Some(failure);
        }
        if let Some(error) = cause.downcast_ref::<io::Error>() {
            match error.kind() {
                io::ErrorKind::ConnectionRefused => return Some(ConnectionFailure::Refused),
                io::ErrorKind::PermissionDenied => return Some(ConnectionFailure::Blocked),
                _ => {}
            }
        }
        source = cause.source();
    }
    None
}

fn described_failure(description: &str) -> Option<ConnectionFailure> {
    let patterns: &[(&[&str], ConnectionFailure)] = &[
        (
            &[
                "invalid peer certificate",
                "certificate verify failed",
                "unknownissuer",
            ],
            ConnectionFailure::Certificate,
        ),
        (
            &[
                "dns error",
                "failed to lookup address",
                "name or service not known",
            ],
            ConnectionFailure::Dns,
        ),
        (
            &[
                "proxy authentication required",
                "proxy authentication failed",
                "unsuccessful tunnel",
                "socks connect error",
                "socks handshake",
                "tunnel error",
            ],
            ConnectionFailure::Proxy,
        ),
    ];
    patterns.iter().find_map(|(patterns, failure)| {
        patterns
            .iter()
            .any(|pattern| description.contains(pattern))
            .then_some(*failure)
    })
}

#[cfg(test)]
mod tests;
