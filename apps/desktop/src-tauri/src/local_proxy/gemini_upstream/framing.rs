//! Detect response framing before adapting events or collecting a bounded JSON reply.
use super::{history, Context};
use crate::local_proxy::{
    chat_bridge_response::{completed_response, read_response, sniff},
    forwarded_response_headers, status_ok, ChatSseReader, ReqwestResponse, UpstreamBody,
    UpstreamPayload,
};
use std::io::{BufReader, Read};

pub(super) fn receive(
    mut response: ReqwestResponse,
    context: Context,
    pending: Option<history::Pending>,
) -> Result<UpstreamPayload, String> {
    let status = response.status().as_u16();
    let response_headers = forwarded_response_headers(response.headers());
    let mut content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = if !status_ok(status) {
        UpstreamBody::Buffered(read_response(response)?)
    } else {
        if context.streaming {
            response.select_streaming(true);
        }
        let (sse, mut reader) = sniff(response)?;
        reader.get_mut().1.get_mut().select_streaming(sse);
        let body = if sse {
            from_events(reader, &context, pending)?
        } else {
            super::buffered(&read_response(reader)?, &context, pending)?
        };
        content_type = Some(
            if context.streaming {
                "text/event-stream; charset=utf-8"
            } else {
                "application/json; charset=utf-8"
            }
            .into(),
        );
        body
    };
    Ok(UpstreamPayload {
        status,
        content_type,
        response_headers,
        body,
        token_usage_account: None,
        token_usage_service_tier: Some("default".into()),
    })
}

fn from_events(
    reader: impl Read + Send + 'static,
    context: &Context,
    pending: Option<history::Pending>,
) -> Result<UpstreamBody, String> {
    let native =
        super::stream::GenerateContentReader::new(BufReader::new(reader), context.scope.clone())
            .with_history(pending.clone());
    let reader = ChatSseReader::new(
        BufReader::new(native),
        context.model.clone(),
        context.tools.clone(),
        None,
    );
    if let Some(pending) = pending {
        pending.bind(reader.response_id());
    }
    if context.streaming {
        return Ok(UpstreamBody::Streaming(Box::new(reader)));
    }
    serde_json::to_vec(&completed_response(reader)?)
        .map(UpstreamBody::Buffered)
        .map_err(|_| super::RequestError::new(super::Stage::Gemini, super::Problem::Encode).wire())
}

#[cfg(test)]
#[path = "framing_tests.rs"]
mod tests;
