fn forward_aggregate_request<R: Runtime>(
    app: &tauri::AppHandle<R>,
    request: AggregateForwardRequest<'_>,
) -> Result<UpstreamPayload, String> {
    let policy = &request.target.config.failover_policy;
    let member_ids = request
        .target
        .profiles
        .iter()
        .map(|provider| provider.id.clone())
        .collect::<Vec<_>>();
    let budget = if policy.enabled && aggregate_request_can_fail_over(&request) {
        policy.max_attempts as usize
    } else {
        1
    };
    let mut excluded = HashSet::new();
    let mut last_result = None;
    for attempt in 1..=budget.min(member_ids.len()) {
        let lease =
            match aggregate_scheduler::select_member(aggregate_scheduler::SelectionOptions {
                aggregate_id: &request.target.config.id,
                session_id: request.session_id,
                member_ids: &member_ids,
                excluded: &excluded,
                policy,
            }) {
                Ok(lease) => lease,
                Err(error) => return last_result.unwrap_or(Err(error)),
            };
        if let Some(previous) = last_result.take() {
            record_discarded_proxy_attempt(&previous);
        }
        excluded.insert(lease.member_id().to_string());
        diagnostic_event(
            json!({ "event": "aggregate_attempt_started", "attempt": attempt,
            "aggregateId": request.target.config.id, "providerId": lease.member_id() }),
        );
        let (result, retry) = send_aggregate_attempt(app, &request, lease);
        if !retry {
            return result;
        }
        last_result = Some(result);
    }
    last_result.unwrap_or_else(|| {
        Err("All APIs in this aggregate are temporarily unavailable".to_string())
    })
}

fn aggregate_request_can_fail_over(request: &AggregateForwardRequest<'_>) -> bool {
    *request.method == Method::Post
        && (is_response_create_endpoint(request_path(request.url))
            || is_anthropic_messages_endpoint(request_path(request.url)))
}

fn send_aggregate_attempt<R: Runtime>(
    app: &tauri::AppHandle<R>,
    request: &AggregateForwardRequest<'_>,
    lease: aggregate_scheduler::MemberLease,
) -> (Result<UpstreamPayload, String>, bool) {
    let (result, network) =
        failover_transport::capture(|| send_aggregate_member(app, request, lease.member_id()));
    if result
        .as_ref()
        .is_ok_and(|payload| status_ok(payload.status))
    {
        return (
            result.map(|payload| watch_aggregate_response(payload, lease, request.url)),
            false,
        );
    }
    let (outcome, retry) =
        aggregate_failure_decision(&request.target.config.failover_policy, &result, network);
    diagnostic_event(
        json!({ "event": "aggregate_attempt_failed", "providerId": lease.member_id(),
        "retryable": retry, "status": result.as_ref().ok().map(|payload| payload.status) }),
    );
    lease.finish(outcome);
    (result, retry)
}

fn send_aggregate_member<R: Runtime>(
    app: &tauri::AppHandle<R>,
    request: &AggregateForwardRequest<'_>,
    member_id: &str,
) -> Result<UpstreamPayload, String> {
    let provider = request
        .target
        .profiles
        .iter()
        .find(|provider| provider.id == member_id)
        .ok_or_else(|| "Aggregate API member does not exist".to_string())?;
    let model = aggregate_api::member_model(&request.target.config, member_id);
    if let Some(account_id) = aggregate_api::member_account_id(member_id) {
        return forward_aggregate_official(app, request, account_id, model);
    }
    let provider = aggregate_api::force_aggregate_model(provider, model);
    if is_anthropic_messages_endpoint(request_path(request.url)) {
        return forward_anthropic_provider_with_context(
            request.body.clone(),
            &provider,
            model,
            AnthropicProviderContext {
                headers: request.headers,
                session_id: request.session_id,
            },
        );
    }
    forward_provider_request(
        request.method,
        request.url,
        request.headers,
        request.body.clone(),
        &provider,
    )
}

fn aggregate_failure_decision(
    policy: &crate::aggregate_failover::AggregateFailoverPolicy,
    result: &Result<UpstreamPayload, String>,
    network: Option<failover_transport::NetworkFailure>,
) -> (aggregate_scheduler::MemberOutcome, bool) {
    use aggregate_scheduler::MemberOutcome;
    if !policy.enabled {
        return (MemberOutcome::Neutral, false);
    }
    // Protocol fallback can retain an earlier HTTP error after a later send has failed.
    // An ambiguous final send must never replay based on that earlier status.
    if network.is_some_and(|failure| !failure.replay_safe) {
        let outcome = if policy.retry_on_network_errors {
            MemberOutcome::Failure { retry_after: None }
        } else {
            MemberOutcome::Neutral
        };
        return (outcome, false);
    }
    match result {
        Ok(payload)
            if policy.retry_status_codes.contains(&payload.status)
                || aggregate_capacity::is_capacity_rejection(payload) =>
        {
            let retry_after = policy
                .respect_retry_after
                .then(|| {
                    failover_transport::retry_after(
                        &payload.response_headers,
                        std::time::SystemTime::now(),
                    )
                })
                .flatten();
            (MemberOutcome::Failure { retry_after }, true)
        }
        Err(_) if policy.retry_on_network_errors => {
            network.map_or((MemberOutcome::Neutral, false), |failure| {
                (
                    MemberOutcome::Failure { retry_after: None },
                    failure.replay_safe,
                )
            })
        }
        _ => (MemberOutcome::Neutral, false),
    }
}

fn watch_aggregate_response(
    mut payload: UpstreamPayload,
    lease: aggregate_scheduler::MemberLease,
    endpoint: &str,
) -> UpstreamPayload {
    let mut capture = error_capture::ErrorCapture::new_for_health(
        is_event_stream(payload.content_type.as_deref()),
        payload.status,
    )
    .for_endpoint(endpoint);
    payload.body = match payload.body {
        UpstreamBody::Buffered(body) => {
            // The outer response capture owns error reporting; only health flags are needed here.
            drop(capture.observe(&body));
            lease.finish(aggregate_response_outcome(&mut capture));
            UpstreamBody::Buffered(body)
        }
        UpstreamBody::Streaming(reader) => {
            UpstreamBody::Streaming(Box::new(AggregateResponseReader {
                reader,
                lease: Some(lease),
                capture,
            }))
        }
    };
    payload
}

/// The recovery slot stays reserved until the response finishes, including long streams.
struct AggregateResponseReader {
    reader: Box<dyn Read + Send>,
    lease: Option<aggregate_scheduler::MemberLease>,
    capture: error_capture::ErrorCapture,
}

impl Read for AggregateResponseReader {
    fn read(&mut self, target: &mut [u8]) -> std::io::Result<usize> {
        let result = self.reader.read(target);
        let outcome = match &result {
            Ok(0) if !target.is_empty() => Some(aggregate_response_outcome(&mut self.capture)),
            Ok(count) => {
                drop(self.capture.observe(&target[..*count]));
                None
            }
            Err(_) => Some(aggregate_scheduler::MemberOutcome::Failure { retry_after: None }),
        };
        if let Some(outcome) = outcome {
            if let Some(lease) = self.lease.take() {
                lease.finish(outcome);
            }
        }
        result
    }
}

impl Drop for AggregateResponseReader {
    fn drop(&mut self) {
        // Clients may stop reading after a terminal frame without asking for EOF.
        if self.capture.terminal_seen()
            || self.capture.error_seen()
            || self.capture.completion_unverified()
        {
            if let Some(lease) = self.lease.take() {
                lease.finish(aggregate_response_outcome(&mut self.capture));
            }
        }
    }
}

fn aggregate_response_outcome(
    capture: &mut error_capture::ErrorCapture,
) -> aggregate_scheduler::MemberOutcome {
    drop(capture.finish());
    if capture.error_seen() {
        aggregate_scheduler::MemberOutcome::Failure { retry_after: None }
    } else if capture.completion_unverified() {
        aggregate_scheduler::MemberOutcome::Neutral
    } else {
        aggregate_scheduler::MemberOutcome::Success
    }
}
