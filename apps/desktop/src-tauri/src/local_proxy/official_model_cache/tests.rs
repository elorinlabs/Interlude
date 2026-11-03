use super::*;
use crate::local_proxy::error_messages;
use std::{cell::Cell, io::Cursor, thread};

#[path = "deadline_tests.rs"]
mod deadline_tests;
#[path = "fallback_tests.rs"]
mod fallback_tests;

const CATALOG: &[u8] = br#"{"models":[{"slug":"gpt-test","context_window":123456,
    "input_modalities":["text","image"],"supported_reasoning_levels":[{"effort":"high"}]}],"extra":true}"#;

fn official_payload(status: u16, body: UpstreamBody) -> UpstreamPayload {
    UpstreamPayload {
        status,
        content_type: Some("application/json".into()),
        response_headers: vec![("etag".into(), "official-v1".into())],
        body,
        token_usage_service_tier: None,
        token_usage_account: None,
    }
}

fn assert_catalog(payload: UpstreamPayload, etag: &str) {
    assert_eq!(payload.status, 200);
    assert_eq!(payload.content_type.as_deref(), Some("application/json"));
    assert_eq!(payload.response_headers, [("etag".into(), etag.into())]);
    let UpstreamBody::Buffered(actual) = payload.body else {
        panic!("expected buffered catalog")
    };
    assert_eq!(actual, CATALOG);
}

fn server(status: u16, body: Vec<u8>) -> (Url, thread::JoinHandle<()>) {
    server_after_delay(status, body, Duration::ZERO)
}

fn server_after_delay(
    status: u16,
    body: Vec<u8>,
    delay: Duration,
) -> (Url, thread::JoinHandle<()>) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let url = catalog_url(&format!("http://{}", server.server_addr())).unwrap();
    let task = thread::spawn(move || {
        let request = server
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        assert_eq!(request.url(), "/official-models");
        assert!(!request
            .headers()
            .iter()
            .any(|header| header.field.equiv("Authorization")));
        let response = tiny_http::Response::from_data(body)
            .with_status_code(status)
            .with_header(tiny_http::Header::from_bytes("ETag", "catalog-v3").unwrap());
        thread::sleep(delay);
        request.respond(response).unwrap();
    });
    (url, task)
}

#[test]
fn official_success_preserves_catalog_and_never_calls_admin() {
    for body in [
        UpstreamBody::Buffered(CATALOG.to_vec()),
        UpstreamBody::Streaming(Box::new(Cursor::new(CATALOG))),
    ] {
        let payload = prefer_official(
            || Ok(official_payload(200, body)),
            || panic!("Admin must not be called after official success"),
        )
        .unwrap();
        assert_catalog(payload, "official-v1");
    }
}

#[test]
fn official_transport_failure_falls_back_to_admin_and_preserves_capabilities() {
    let (url, task) = server(200, CATALOG.to_vec());
    let client = Client::builder().no_proxy().build().unwrap();
    let payload = prefer_official(
        || Err("official request timed out".into()),
        || request_catalog(&client, url),
    )
    .unwrap();
    assert_catalog(payload, "catalog-v3");
    task.join().unwrap();
}

#[test]
fn admin_fallback_can_exceed_its_previous_three_second_timeout() {
    let (url, task) = server_after_delay(200, CATALOG.to_vec(), Duration::from_millis(3100));
    let client = Client::builder().no_proxy().build().unwrap();
    let payload = prefer_official(
        || Err("official request timed out".into()),
        || request_catalog(&client, url),
    )
    .unwrap();
    assert_catalog(payload, "catalog-v3");
    task.join().unwrap();
}

#[test]
fn unsuccessful_empty_and_invalid_official_catalogs_fall_back_to_admin_once() {
    for (status, body) in [
        (401, "unauthorized"),
        (429, "rate limited"),
        (502, "bad gateway"),
        (503, "unavailable"),
        (304, ""),
        (200, "{\"models\":[]}"),
        (
            200,
            "{\"models\":[{\"slug\":\"hidden\",\"visibility\":\"hide\"}]}",
        ),
        (200, "{\"models\":[{}]}"),
        (200, "invalid json"),
    ] {
        let calls = Cell::new(0);
        let payload = official_payload(status, UpstreamBody::Buffered(body.as_bytes().to_vec()));
        let result = prefer_official(
            || Ok(payload),
            || {
                calls.set(calls.get() + 1);
                Ok(official_payload(
                    200,
                    UpstreamBody::Buffered(CATALOG.to_vec()),
                ))
            },
        );
        assert_eq!(calls.get(), 1);
        assert_catalog(result.unwrap(), "official-v1");
    }
}

struct BrokenReader;

#[test]
fn catalogs_larger_than_two_mib_are_read_and_validated_without_truncation() {
    let bytes = json!({"models":[{"slug":"large", "description":"x".repeat(2 * 1024 * 1024)}]})
        .to_string()
        .into_bytes();
    assert_eq!(read_catalog(Cursor::new(&bytes)).unwrap(), bytes);
    for body in [
        UpstreamBody::Buffered(bytes.clone()),
        UpstreamBody::Streaming(Box::new(Cursor::new(bytes.clone()))),
    ] {
        let mut payload = validate_official_payload(official_payload(200, body)).unwrap();
        let read = super::super::read_official_model_catalog_body(&mut payload.body).unwrap();
        assert_eq!(read, bytes);
    }
}

impl Read for BrokenReader {
    fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            "official body timed out",
        ))
    }
}

#[test]
fn unreadable_and_invalid_official_bodies_fall_back_to_admin() {
    for body in [
        UpstreamBody::Streaming(Box::new(BrokenReader)),
        UpstreamBody::Streaming(Box::new(Cursor::new(b"invalid json"))),
        UpstreamBody::Buffered(vec![b' '; 2 * 1024 * 1024 + 1]),
    ] {
        let result = prefer_official(
            || Ok(official_payload(200, body)),
            || {
                Ok(official_payload(
                    200,
                    UpstreamBody::Buffered(CATALOG.to_vec()),
                ))
            },
        );
        assert_catalog(result.unwrap(), "official-v1");
    }
}

#[test]
fn failed_or_invalid_admin_fallback_reports_model_discovery_failure() {
    for (status, body) in [
        (503, "unavailable"),
        (404, "missing"),
        (200, "{\"models\":[]}"),
        (200, "[]"),
        (200, "{\"models\":[{}]}"),
        (200, "invalid json"),
    ] {
        let (url, task) = server(status, body.as_bytes().to_vec());
        let client = Client::builder().no_proxy().build().unwrap();
        let result = prefer_official(
            || Err("official unavailable".into()),
            || request_catalog(&client, url),
        );
        let message = error_messages::gui(&result.err().unwrap());
        assert!(message.contains("备用模型列表"), "{message}");
        if status >= 400 {
            assert!(message.contains(&format!("HTTP {status}")), "{message}");
        } else {
            assert!(
                message.contains("JSON") || message.contains("models"),
                "{message}"
            );
        }
        task.join().unwrap();
    }
}

#[test]
fn validates_addresses_and_rejects_duplicate_or_invalid_catalogs() {
    assert_eq!(
        catalog_url("https://example.test/api/").unwrap().path(),
        "/api/official-models"
    );
    for address in [
        "file:///tmp/models",
        "https://user:secret@example.test",
        "https://example.test?token=x",
    ] {
        assert!(catalog_url(address).is_err());
    }
    assert!(validate_catalog(br#"{"models":[{"slug":"x"},{"slug":"x"}]}"#).is_err());
    assert!(validate_catalog(&vec![b' '; 2 * 1024 * 1024 + 1]).is_err());
}

#[test]
fn admin_transport_failure_reports_model_discovery_failure() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = catalog_url(&format!("http://{}", listener.local_addr().unwrap())).unwrap();
    drop(listener);
    let client = Client::builder().no_proxy().build().unwrap();
    let result = prefer_official(
        || Err("official unavailable".into()),
        || request_catalog(&client, url),
    );
    let message = error_messages::gui(&result.err().unwrap());
    assert!(message.contains("连接被上游服务或代理拒绝"), "{message}");
}
