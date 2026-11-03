use super::*;
use std::{net::TcpListener, sync::mpsc, thread, time::Duration};

#[derive(Debug, thiserror::Error)]
#[error("error sending request")]
struct OuterError(#[source] io::Error);

#[test]
fn source_chain_distinguishes_network_failures_without_exposing_details() {
    for (kind, detail, expected) in [
        (
            io::ErrorKind::Other,
            "invalid peer certificate: UnknownIssuer",
            ConnectionFailure::Certificate,
        ),
        (
            io::ErrorKind::Other,
            "dns error: failed to lookup address information",
            ConnectionFailure::Dns,
        ),
        (
            io::ErrorKind::Other,
            "proxy authentication required",
            ConnectionFailure::Proxy,
        ),
        (
            io::ErrorKind::ConnectionRefused,
            "private proxy address",
            ConnectionFailure::Refused,
        ),
        (
            io::ErrorKind::PermissionDenied,
            "private executable path",
            ConnectionFailure::Blocked,
        ),
    ] {
        let error = OuterError(io::Error::new(kind, detail));
        let failure = source_failure(Some(&error)).unwrap();
        assert_eq!(failure, expected);
        assert!(!failure.to_string().contains(detail));
    }
    let error = OuterError(io::Error::other(
        "https://user:password@example.com?token=private",
    ));
    assert_eq!(source_failure(Some(&error)), None);
}

#[test]
fn failed_login_reports_connection_refusal_without_including_the_request_url() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        // Windows may take several seconds to report a refused loopback connection.
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let error = client
        .post(format!("http://{address}/auth/login?token=private"))
        .send()
        .unwrap_err();
    let message = request_error("Cloud login", error);
    assert!(message.contains("connection was refused"), "{message}");
    assert!(!message.contains("private"));
    assert!(!message.contains(&address.to_string()));
}

#[tokio::test(flavor = "current_thread")]
async fn stalled_cloud_request_keeps_polling_responsive_and_reports_timeout() {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://{}/auth/login", server.server_addr());
    let (release, pending) = mpsc::channel();
    let worker = thread::spawn(move || {
        let request = server
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .unwrap();
        // Keep the response pending until the client has timed out.
        pending.recv_timeout(Duration::from_secs(3)).unwrap();
        drop(request);
    });
    let request = tokio::task::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_millis(300))
            .build()
            .unwrap();
        request_error("Cloud login", client.post(url).send().unwrap_err())
    });
    for _ in 0..3 {
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!request.is_finished());
    }
    let message = request.await.unwrap();
    release.send(()).unwrap();
    worker.join().unwrap();
    assert!(message.contains("connection timed out"), "{message}");
}
