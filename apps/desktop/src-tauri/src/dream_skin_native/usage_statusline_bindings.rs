const CONVERSATION_METRICS_BINDING: &str = "codexSwitchRequestConversationMetrics";

fn conversation_metrics_response(payload: &str) -> Result<String, String> {
    if payload.len() > 512 {
        return Err("Conversation metrics request is too large.".to_string());
    }
    let request: Value = serde_json::from_str(payload).map_err(|error| error.to_string())?;
    let thread_id = request["conversationId"]
        .as_str()
        .ok_or_else(|| "Missing conversation identity.".to_string())?;
    let request_id = request["requestId"]
        .as_u64()
        .filter(|id| *id <= 9_007_199_254_740_991)
        .ok_or_else(|| "Invalid metrics request identity.".to_string())?;
    // This runs on the existing renderer worker and reuses the original request timing calculation.
    let metrics = crate::local_proxy::session_metrics::load_session_metrics(thread_id).ok();
    let thread_id = serde_json::to_string(thread_id).map_err(|error| error.to_string())?;
    let metrics = serde_json::to_string(&metrics).map_err(|error| error.to_string())?;
    Ok(format!(
        "window.__CODEX_SWITCH_USAGE_STATUSLINE__?.receiveTiming?.({thread_id}, {request_id}, {metrics}); true"
    ))
}

fn publish_conversation_metrics(payload: &str, target: &CdpTarget, port: u16) {
    let result = conversation_metrics_response(payload)
        .and_then(|expression| evaluate_for_binding(target, port, &expression));
    if result.is_err() {
        // Invalid/disconnected requests expire in the renderer; never expose payloads or internal errors.
        eprintln!("Could not refresh the conversation output timing.");
    }
}
