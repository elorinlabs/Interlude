/// Account overrides isolate aggregate routing from shared account and concurrent routing state.
fn forward_aggregate_official<R: Runtime>(
    app: &tauri::AppHandle<R>,
    request: &AggregateForwardRequest<'_>,
    account_id: &str,
    model: &str,
) -> Result<UpstreamPayload, String> {
    forward_account_member(OfficialForwardRequest {
        app,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body.clone(),
        model,
        session_id: request.session_id,
        account_id_override: Some(account_id),
    })
}

/// Explicit account members never fall back to the globally selected account.
fn forward_account_member<R: Runtime>(
    mut request: OfficialForwardRequest<'_, R>,
) -> Result<UpstreamPayload, String> {
    if is_anthropic_messages_endpoint(request_path(request.url)) {
        return forward_anthropic_official(
            request.app,
            request.headers,
            request.body,
            AnthropicOfficialContext {
                session_id: request.session_id,
                account_id_override: request.account_id_override,
                model_override: Some(request.model),
            },
        );
    }
    request.body = account_member_body(request.method, request.url, request.body, request.model)?;
    forward_official(request)
}

fn account_member_body(
    method: &Method,
    url: &str,
    body: Vec<u8>,
    model: &str,
) -> Result<Vec<u8>, String> {
    if *method != Method::Post || !is_responses_endpoint(request_path(url)) {
        return Ok(body);
    }
    let mut body: Value = serde_json::from_slice(&body)
        .map_err(|error| request_error::RequestError::json(request_error::Stage::Request, &error).wire())?;
    let object = body
        .as_object_mut()
        .ok_or("The request body must be an object")?;
    object.insert("model".into(), Value::String(model.into()));
    serde_json::to_vec(&body).map_err(|_| request_error::RequestError::new(
        request_error::Stage::Request, request_error::Problem::Encode).wire())
}
