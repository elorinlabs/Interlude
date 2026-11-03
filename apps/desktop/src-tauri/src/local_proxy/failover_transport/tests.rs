use super::*;

fn timeout(phase: Phase, sent_bytes: usize) -> Error {
    Error::Timeout { phase, sent_bytes }
}

fn failure(phase: Phase, sent_bytes: usize) -> Option<NetworkFailure> {
    classify(&timeout(phase, sent_bytes))
}

#[test]
fn only_pre_upload_timeouts_allow_failover() {
    assert_eq!(
        failure(Phase::Upload, 0),
        Some(NetworkFailure { replay_safe: true })
    );
    for (phase, sent_bytes) in [
        (Phase::Upload, 1),
        (Phase::ResponseHeaders, 0),
        (Phase::ResponseHeaders, 128),
    ] {
        assert_eq!(
            failure(phase, sent_bytes),
            Some(NetworkFailure { replay_safe: false })
        );
    }
}

#[test]
fn redirected_requests_never_replay_even_when_the_next_upload_has_not_started() {
    let error = Error::AfterRedirect(Box::new(timeout(Phase::Upload, 0)));
    assert_eq!(
        classify(&error),
        Some(NetworkFailure { replay_safe: false })
    );
}

#[test]
fn connection_failures_require_zero_uploaded_bytes() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    for sent_bytes in [0, 1] {
        let source = reqwest::blocking::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_millis(100))
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
            .get(format!("http://{address}/"))
            .send()
            .unwrap_err();
        assert!(source.is_connect(), "{source:?}");
        assert_eq!(
            classify(&Error::Http { source, sent_bytes }),
            Some(NetworkFailure {
                replay_safe: sent_bytes == 0
            }),
        );
    }
}

#[test]
fn invalid_requests_and_proxy_configuration_errors_do_not_mark_network_health() {
    let source = reqwest::blocking::Client::new()
        .get("invalid url")
        .build()
        .unwrap_err();
    assert!(source.is_builder());
    for error in [
        Error::Http {
            source,
            sent_bytes: 0,
        },
        Error::UnbufferedBody,
        Error::RedirectLimit(10),
        Error::Proxy(crate::system_proxy::ProxyResolutionError::Timeout),
    ] {
        assert_eq!(classify(&error), None);
    }
}

#[test]
fn capture_does_not_leak_across_operations_or_threads() {
    record(Some(&timeout(Phase::Upload, 0)));
    let (_, first) = capture(|| {
        record(Some(&timeout(Phase::Upload, 0)));
        let other = std::thread::spawn(|| capture(|| Err::<(), _>("other".to_string())));
        assert_eq!(other.join().unwrap().1, None);
        Err::<(), _>("failed".to_string())
    });
    assert_eq!(first, Some(NetworkFailure { replay_safe: true }));
    assert_eq!(capture(|| Err::<(), _>("later".to_string())).1, None);
}

#[test]
fn nested_capture_restores_the_parent_record() {
    let (_, outer) = capture(|| {
        record(Some(&timeout(Phase::Upload, 0)));
        let (_, inner) = capture(|| {
            record(Some(&timeout(Phase::ResponseHeaders, 1)));
            Err::<(), _>("inner".to_string())
        });
        assert_eq!(inner, Some(NetworkFailure { replay_safe: false }));
        Err::<(), _>("outer".to_string())
    });
    assert_eq!(outer, Some(NetworkFailure { replay_safe: true }));
}

#[test]
fn scope_restores_the_parent_after_unwinding() {
    let (_, outer) = capture(|| {
        record(Some(&timeout(Phase::Upload, 0)));
        let panic = std::panic::catch_unwind(|| {
            capture::<()>(|| {
                record(Some(&timeout(Phase::ResponseHeaders, 5)));
                panic!("test unwind");
            })
        });
        assert!(panic.is_err());
        Err::<(), _>("outer".to_string())
    });
    assert_eq!(outer, Some(NetworkFailure { replay_safe: true }));
}

#[test]
fn a_successful_send_clears_an_earlier_transport_failure() {
    let (_, failure) = capture(|| {
        record(Some(&timeout(Phase::Upload, 0)));
        record(None);
        Err::<(), _>("non-transport failure".to_string())
    });
    assert_eq!(failure, None);
}

#[test]
fn returning_an_earlier_http_response_cannot_hide_an_ambiguous_network_failure() {
    let (_, failure) = capture(|| {
        record(Some(&timeout(Phase::ResponseHeaders, 512)));
        Ok("earlier endpoint rejection")
    });
    assert_eq!(failure, Some(NetworkFailure { replay_safe: false }));
}

fn parse_retry_after(value: &str, now: SystemTime) -> Option<Duration> {
    retry_after(&[("Retry-After".to_string(), value.to_string())], now)
}

#[test]
fn retry_after_accepts_delta_seconds_and_clamps_large_delays() {
    let now = SystemTime::now();
    assert_eq!(
        parse_retry_after(" 120 ", now),
        Some(Duration::from_secs(120))
    );
    assert_eq!(parse_retry_after("0", now), Some(Duration::ZERO));
    assert_eq!(parse_retry_after("999999", now), Some(MAX_RETRY_AFTER));
    for invalid in ["", "-1", "+1", "1.5", "1 minute", "18446744073709551616"] {
        assert_eq!(parse_retry_after(invalid, now), None, "{invalid}");
    }
}

#[test]
fn retry_after_accepts_http_dates_and_ignores_expired_dates() {
    let value = "Wed, 21 Oct 2015 07:28:00 GMT";
    let date = SystemTime::from(chrono::DateTime::parse_from_rfc2822(value).unwrap());
    assert_eq!(
        parse_retry_after(value, date - Duration::from_secs(60)),
        Some(Duration::from_secs(60))
    );
    assert_eq!(
        parse_retry_after(value, date - MAX_RETRY_AFTER * 2),
        Some(MAX_RETRY_AFTER)
    );
    assert_eq!(parse_retry_after(value, date), None);
    assert_eq!(
        parse_retry_after(value, date + Duration::from_secs(1)),
        None
    );
    assert_eq!(parse_retry_after("not a date", date), None);
    assert_eq!(
        retry_after(&[("other".to_string(), "60".to_string())], date),
        None
    );
}

#[test]
fn retry_after_survives_response_header_filtering() {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(reqwest::header::RETRY_AFTER, "60".parse().unwrap());
    headers.insert(
        reqwest::header::SET_COOKIE,
        "private=value".parse().unwrap(),
    );
    assert_eq!(
        crate::local_proxy::forwarded_response_headers(&headers),
        vec![("retry-after".to_string(), "60".to_string())],
    );
}
