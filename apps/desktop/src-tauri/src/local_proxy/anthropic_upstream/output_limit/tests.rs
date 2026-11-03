use super::*;
use std::thread;
use tiny_http::{Method, Response, Server};

fn provider(url: String) -> ProviderProfile {
    serde_json::from_value(json!({
        "id": uuid::Uuid::new_v4().to_string(), "name": "metadata fixture",
        "baseUrl": url, "apiKey": "provider-key", "model": "claude-test",
        "apiFormat": "anthropicMessages"
    }))
    .unwrap()
}

fn receive(server: &Server) -> tiny_http::Request {
    server
        .recv_timeout(Duration::from_secs(5))
        .unwrap()
        .unwrap()
}

#[test]
fn discovers_authenticated_maximum_and_caches_only_for_matching_credentials() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let mut provider = provider(format!("http://{}/gateway/v1", server.server_addr()));
    provider.request_options = Some(
        serde_json::from_value(json!({
            "headers": {"x-workspace": "test"}
        }))
        .unwrap(),
    );
    let worker = thread::spawn(move || {
        for (key, maximum) in [("provider-key", 128_000), ("changed-key", 64_000)] {
            let request = receive(&server);
            assert_eq!(request.method(), &Method::Get);
            assert_eq!(request.url(), "/gateway/v1/models/claude-test");
            for (name, value) in [
                ("x-api-key", key),
                ("x-workspace", "test"),
                ("anthropic-version", "2023-06-01"),
            ] {
                assert!(request
                    .headers()
                    .iter()
                    .any(|header| header.field.equiv(name) && header.value.as_str() == value));
            }
            assert!(!request
                .headers()
                .iter()
                .any(|header| header.field.equiv("Authorization")));
            request
                .respond(Response::from_string(
                    json!({"max_tokens": maximum}).to_string(),
                ))
                .unwrap();
        }
    });
    let headers = vec![("Authorization".into(), "Bearer caller-secret".into())];
    for _ in 0..2 {
        let mut body = json!({"model": "claude-test"});
        ensure(&mut body, &headers, &provider).unwrap();
        assert_eq!(body["max_tokens"], 128_000);
    }
    provider.api_key = "changed-key".into();
    let mut body = json!({"model": "claude-test"});
    ensure(&mut body, &headers, &provider).unwrap();
    assert_eq!(body["max_tokens"], 64_000);
    worker.join().unwrap();
}

#[test]
fn explicit_lengths_skip_discovery_and_invalid_lengths_are_not_replaced() {
    let provider = provider("not-a-url".into());
    for maximum in [1, 50_000, u64::MAX] {
        let mut body = json!({"model": "claude-test", "max_tokens": maximum});
        ensure(&mut body, &[], &provider).unwrap();
        assert_eq!(body["max_tokens"], maximum);
    }
    for invalid in [
        Value::Null,
        json!(0),
        json!(-1),
        json!(1.5),
        json!("unlimited"),
    ] {
        let mut body = json!({"max_tokens": invalid});
        assert_eq!(
            ensure(&mut body, &[], &provider),
            Err(problem(Problem::InvalidMaximum))
        );
    }
}

#[test]
fn missing_or_invalid_metadata_requires_configuration_without_a_fixed_fallback() {
    for metadata in [
        json!({}),
        json!({"max_tokens": 0}),
        json!({"max_tokens": "unknown"}),
    ] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let provider = provider(format!("http://{}", server.server_addr()));
        let worker = thread::spawn(move || {
            receive(&server)
                .respond(Response::from_string(metadata.to_string()))
                .unwrap();
        });
        let mut body = json!({"model": "claude-test"});
        let error = ensure(&mut body, &[], &provider).unwrap_err();
        assert_eq!(error, problem(Problem::MissingMaximum));
        assert!(error.to_string().contains("max_tokens"));
        let message = error.to_string();
        assert_eq!(
            crate::local_proxy::error_messages::gui(&error.wire()),
            message
        );
        assert_eq!(
            crate::local_proxy::upstream_error_message(&error.wire()),
            message
        );
        assert!(body.get("max_tokens").is_none());
        worker.join().unwrap();
    }
}

#[test]
fn full_messages_url_preserves_gateway_prefix_query_and_encodes_model() {
    let mut provider = provider("https://example.test/gateway/v1/messages?revision=2".into());
    provider.request_options = Some(serde_json::from_value(json!({"useFullUrl":true})).unwrap());
    assert_eq!(
        model_url(&provider, "vendor/model").unwrap().as_str(),
        "https://example.test/gateway/v1/models/vendor%2Fmodel?revision=2"
    );
    provider.base_url = "https://example.test/gateway/invoke".into();
    assert!(model_url(&provider, "test").is_err());
}

#[test]
fn metadata_http_and_json_failures_report_the_reason_and_configuration_alternative() {
    for status in [200, 401, 403, 404, 429, 503] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let provider = provider(format!("http://{}", server.server_addr()));
        let worker = thread::spawn(move || {
            receive(&server)
                .respond(Response::from_string("private response").with_status_code(status))
                .unwrap();
        });
        let error = ensure(&mut json!({"model":"test"}), &[], &provider).unwrap_err();
        let message = crate::local_proxy::upstream_error_message(&error.wire());
        if status == 200 {
            assert!(message.contains("JSON 语法无效"), "{message}");
        } else {
            assert!(message.contains(&format!("HTTP {status}")), "{message}");
        }
        assert!(message.contains("max_tokens"));
        assert!(!message.contains("private"));
        worker.join().unwrap();
    }
}
