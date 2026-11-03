//! Native Messages transport, sharing the established Responses tool and event mapping.

mod continuation;
mod output_limit;
mod request;
mod request_options;
mod response;
mod stream;
mod system_prompt;

#[cfg(test)]
mod http_tests;
#[cfg(test)]
mod stream_tests;
#[cfg(test)]
mod tests;

use std::io::BufReader;

use serde_json::Value;
use tiny_http::Method;

use super::request_error::{Problem, RequestError, Stage};
use super::{CodexToolContext, UpstreamBody, UpstreamPayload};
use crate::models::ProviderProfile;

const ANTHROPIC_VERSION: &str = "2023-06-01";

struct RequestContext {
    model: String,
    tools: CodexToolContext,
    scope: continuation::Scope,
    streaming: bool,
}

pub(super) fn forward(
    method: &Method,
    headers: &[(String, String)],
    body: Vec<u8>,
    provider: &ProviderProfile,
) -> Result<UpstreamPayload, String> {
    if *method != Method::Post {
        return Err("Messages requests must use POST".to_string());
    }
    let mut input: Value = serde_json::from_slice(&body)
        .map_err(|error| RequestError::json(Stage::Request, &error).wire())?;
    if !input.is_object() {
        return Err("The request body must be a JSON object".to_string());
    }
    let model = super::selected_provider_model(&input, provider);
    input["model"] = Value::String(model.clone());
    let context = RequestContext {
        tools: super::build_codex_tool_context_from_request(&input),
        scope: continuation::Scope::new(provider, headers, &model),
        model,
        streaming: input["stream"].as_bool().unwrap_or(false),
    };
    let mut request = request::convert(&input, &context.tools, &context.scope)
        .map_err(|error| error.to_string())?;
    super::provider_request_options::body(&mut request, provider);
    output_limit::ensure(&mut request, headers, provider).map_err(|error| error.wire())?;
    request_options::validate_after_overrides(&mut request).map_err(|error| error.to_string())?;
    let response = send(&request, headers, provider)?;
    receive(response, context)
}

/// Preserve native message blocks and signatures when both client and provider use Messages.
pub(super) fn forward_messages(
    body: Value,
    headers: &[(String, String)],
    provider: &ProviderProfile,
) -> Result<UpstreamPayload, String> {
    let mut body = system_prompt::prepare(body);
    super::provider_request_options::body(&mut body, provider);
    output_limit::ensure(&mut body, headers, provider).map_err(|error| error.wire())?;
    let response = send(&body, headers, provider)?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let response_headers = super::forwarded_response_headers(response.headers());
    let body = if super::status_ok(status) && super::is_event_stream(content_type.as_deref()) {
        UpstreamBody::Streaming(Box::new(response))
    } else {
        UpstreamBody::Buffered(
            response
                .bytes()
                .map_err(|error| RequestError::io(Stage::Anthropic, &error).wire())?
                .to_vec(),
        )
    };
    Ok(UpstreamPayload {
        status,
        content_type,
        response_headers,
        body,
        token_usage_account: None,
        token_usage_service_tier: Some("default".to_string()),
    })
}

fn send(
    body: &Value,
    headers: &[(String, String)],
    provider: &ProviderProfile,
) -> Result<super::ReqwestResponse, String> {
    let client = super::http_client()?;
    let url = super::provider_request_options::url(provider, "/messages");
    super::send_with_timeout_retries(
        || authenticated_request(client.post(&url), headers, provider).json(body),
        "Messages request failed",
    )
}

fn authenticated_request(
    request: reqwest::blocking::RequestBuilder,
    headers: &[(String, String)],
    provider: &ProviderProfile,
) -> reqwest::blocking::RequestBuilder {
    let headers = headers
        .iter()
        .filter(|(name, _)| !matches!(name.to_ascii_lowercase().as_str(), "anthropic-version"))
        .cloned()
        .collect::<Vec<_>>();
    let request = super::apply_forward_headers(request, &headers, true)
        .header("anthropic-version", ANTHROPIC_VERSION);
    let request = if provider.api_key.trim().is_empty() {
        request
    } else {
        request.header("x-api-key", provider.api_key.trim())
    };
    super::provider_request_options::headers(request, provider)
}

fn receive(
    response: super::ReqwestResponse,
    context: RequestContext,
) -> Result<UpstreamPayload, String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let response_headers = super::forwarded_response_headers(response.headers());
    let body = if context.streaming
        && super::status_ok(status)
        && super::is_event_stream(content_type.as_deref())
    {
        let reader = stream::MessagesReader::new(BufReader::new(response), context.scope);
        UpstreamBody::Streaming(Box::new(super::ChatSseReader::new(
            BufReader::new(reader),
            context.model,
            context.tools,
            None,
        )))
    } else {
        let bytes = response
            .bytes()
            .map_err(|error| RequestError::io(Stage::Anthropic, &error).wire())?;
        if !super::status_ok(status) {
            return Ok(UpstreamPayload {
                status,
                content_type,
                response_headers,
                body: UpstreamBody::Buffered(bytes.to_vec()),
                token_usage_account: None,
                token_usage_service_tier: Some("default".to_string()),
            });
        }
        buffered_body(&bytes, &context)?
    };
    Ok(UpstreamPayload {
        status,
        response_headers,
        body,
        token_usage_account: None,
        token_usage_service_tier: Some("default".to_string()),
        content_type: Some(
            if context.streaming {
                "text/event-stream; charset=utf-8"
            } else {
                "application/json; charset=utf-8"
            }
            .to_string(),
        ),
    })
}

fn buffered_body(bytes: &[u8], context: &RequestContext) -> Result<UpstreamBody, String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| RequestError::json(Stage::Anthropic, &error).wire())?;
    let chat = response::to_chat(&value, &context.scope).map_err(|error| error.wire())?;
    if context.streaming {
        let chunk = response::single_chunk(&chat);
        let reader =
            std::io::Cursor::new(format!("data: {chunk}\n\ndata: [DONE]\n\n").into_bytes());
        return Ok(UpstreamBody::Streaming(Box::new(
            super::ChatSseReader::new(reader, context.model.clone(), context.tools.clone(), None),
        )));
    }
    let converted = super::chat_to_responses_json(&chat, &context.tools, None);
    serde_json::to_vec(&converted)
        .map(UpstreamBody::Buffered)
        .map_err(|_| RequestError::new(Stage::Anthropic, Problem::Encode).wire())
}
