//! Normalize response framing independently of a gateway's Content-Type header.

use super::request_error::{Problem, RequestError, Stage};
use super::*;

const MAX_SNIFF_BYTES: usize = 4096;

pub(super) struct Context {
    pub(super) stream: bool,
    pub(super) model: String,
    pub(super) tools: CodexToolContext,
    pub(super) scope: Option<chat_bridge_continuation::ContinuationScope>,
    pub(super) request_history: Vec<Value>,
}

pub(super) fn convert(
    mut response: ReqwestResponse,
    context: Context,
) -> Result<UpstreamPayload, String> {
    let status = response.status().as_u16();
    if !status_ok(status) {
        return stream_response(response);
    }
    let headers = forwarded_response_headers(response.headers());
    if context.stream {
        response.select_streaming(true);
    }
    let (sse, mut reader) = sniff(response)?;
    reader.get_mut().1.get_mut().select_streaming(sse);
    let mut payload = if sse {
        convert_stream(Box::new(reader), context)?
    } else {
        let bytes = read_response(reader)?;
        let chat: Value = serde_json::from_slice(&bytes)
            .map_err(|error| RequestError::json(Stage::Chat, &error).wire())?;
        convert_json(chat, context)?
    };
    payload.status = status;
    payload.response_headers = headers;
    Ok(payload)
}

fn convert_stream(
    reader: Box<dyn Read + Send>,
    context: Context,
) -> Result<UpstreamPayload, String> {
    let reader = ChatSseReader::new(
        BufReader::new(reader),
        context.model,
        context.tools,
        context.scope,
    )
    .with_request_history(context.request_history);
    if context.stream {
        return Ok(UpstreamPayload {
            status: 200,
            content_type: Some("text/event-stream; charset=utf-8".into()),
            response_headers: Vec::new(),
            body: UpstreamBody::Streaming(Box::new(reader)),
            token_usage_account: None,
            token_usage_service_tier: None,
        });
    }
    Ok(json_payload(200, completed_response(reader)?))
}

pub(super) fn completed_response(reader: impl Read) -> Result<Value, String> {
    let bytes = read_response(reader)?;
    String::from_utf8_lossy(&bytes)
        .lines()
        .filter_map(|line| line.strip_prefix("data: "))
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|event| {
            matches!(
                event["type"].as_str(),
                Some("response.completed" | "response.incomplete" | "response.failed")
            )
        })
        .filter_map(|event| event.get("response").cloned())
        .next_back()
        .ok_or_else(|| RequestError::new(Stage::Chat, Problem::MissingTerminal).wire())
}

fn convert_json(chat: Value, context: Context) -> Result<UpstreamPayload, String> {
    if chat.pointer("/choices/0/message").is_none() && chat.get("error").is_none() {
        return Err(RequestError::new(Stage::Chat, Problem::MissingChoices).wire());
    }
    if !context.stream {
        return Ok(json_payload(
            200,
            chat_to_responses_json_with_history(
                &chat,
                &context.tools,
                context.scope.as_ref(),
                &context.request_history,
            ),
        ));
    }
    let mut delta = chat["choices"][0]["message"].clone();
    if let Some(calls) = delta["tool_calls"].as_array_mut() {
        for (index, call) in calls.iter_mut().enumerate() {
            call["index"] = json!(index);
        }
    }
    let reason = chat["choices"][0]
        .get("finish_reason")
        .cloned()
        .unwrap_or(json!("stop"));
    let mut chunk = json!({ "id": chat["id"], "model": chat["model"], "usage": chat["usage"],
        "choices": [{"index": 0, "delta": delta, "finish_reason": reason}] });
    if let Some(error) = chat.get("error") {
        chunk["error"] = error.clone();
    }
    convert_stream(
        Box::new(std::io::Cursor::new(
            format!("data: {chunk}\n\ndata: [DONE]\n\n").into_bytes(),
        )),
        context,
    )
}

pub(super) fn read_response(mut reader: impl Read) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|error| RequestError::io(Stage::Read, &error).wire())?;
    Ok(bytes)
}

pub(super) type PrefixedReader<R> = std::io::Chain<std::io::Cursor<Vec<u8>>, BufReader<R>>;

pub(super) fn sniff<R: Read>(reader: R) -> Result<(bool, PrefixedReader<R>), String> {
    let mut reader = BufReader::new(reader);
    let mut prefix = Vec::new();
    for _ in 0..MAX_SNIFF_BYTES {
        let mut byte = [0];
        if reader
            .read(&mut byte)
            .map_err(|error| RequestError::io(Stage::Read, &error).wire())?
            == 0
        {
            break;
        }
        prefix.push(byte[0]);
        let text = String::from_utf8_lossy(&prefix);
        let start = text.trim_start_matches('\u{feff}').trim_start();
        let is_json = start.starts_with(['{', '[']);
        let is_sse = ["data:", "event:", "id:", "retry:", ":"]
            .iter()
            .any(|key| start.starts_with(key));
        if is_json || is_sse {
            if prefix.starts_with(&[0xef, 0xbb, 0xbf]) {
                prefix.drain(..3);
            }
            return Ok((is_sse, std::io::Cursor::new(prefix).chain(reader)));
        }
    }
    Err(RequestError::new(Stage::Read, Problem::Framing).wire())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffered_json_above_128_mib_is_read_completely() {
        // Large JSON whitespace exercises the real response reader without cloning a huge value.
        const PADDING: u64 = 128 * 1024 * 1024 + 1;
        let reader = std::io::repeat(b' ')
            .take(PADDING)
            .chain(std::io::Cursor::new(
                br#"{"choices":[{"message":{"content":"complete"}}]}"#,
            ));
        let bytes = read_response(reader).unwrap();
        let value: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["choices"][0]["message"]["content"], "complete");
        assert!(bytes.len() as u64 > PADDING);
    }

    #[test]
    fn completed_json_and_stream_responses_can_restore_the_next_tool_result() {
        for stream in [false, true] {
            let scope = chat_bridge_continuation::ContinuationScope::new(
                &format!("history-bridge-{stream}"),
                "session",
            );
            let chat = json!({"id":"original", "choices":[{"message":{"reasoning_content":"plan",
                "tool_calls":[{"id":"call", "type":"function", "function":{"name":"read", "arguments":"{}"}}]},
                "finish_reason":"tool_calls"}]});
            let payload = convert_json(
                chat,
                Context {
                    stream,
                    model: "test".into(),
                    tools: CodexToolContext::default(),
                    scope: Some(scope.clone()),
                    request_history: vec![
                        json!({"role":"system", "content":"Answer in Chinese"}),
                        json!({"role":"user", "content":"Read the document and summarize it"}),
                    ],
                },
            )
            .unwrap();
            let output = bytes(payload);
            let response: Value = if stream {
                output
                    .lines()
                    .filter_map(|line| line.strip_prefix("data: "))
                    .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                    .find(|event| event["type"] == "response.completed")
                    .unwrap()["response"]
                    .clone()
            } else {
                serde_json::from_str(&output).unwrap()
            };
            let mut request =
                json!({"messages":[{"role":"tool", "tool_call_id":"call", "content":"done"}]});
            chat_bridge_continuation::restore_tool_history(
                Some(&scope),
                response["id"].as_str(),
                &mut request,
            )
            .unwrap();
            assert_eq!(
                request["messages"][2]["tool_calls"][0]["function"]["name"],
                "read"
            );
            assert_eq!(
                request["messages"][2]["tool_calls"][0]["function"]["arguments"],
                "{}"
            );
            assert_eq!(request["messages"][0]["content"], "Answer in Chinese");
            assert_eq!(
                request["messages"][1]["content"],
                "Read the document and summarize it"
            );
            assert_eq!(request["messages"][2]["reasoning_content"], "plan");
            assert_eq!(request["messages"][3]["content"], "done");
        }
    }

    fn response(body: &str, content_type: &str, stream: bool) -> UpstreamPayload {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}", server.server_addr());
        let body = body.to_string();
        let content_type = content_type.to_string();
        let worker = std::thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            request
                .respond(tiny_http::Response::from_string(body).with_header(
                    tiny_http::Header::from_bytes("Content-Type", content_type).unwrap(),
                ))
                .unwrap();
        });
        let client = reqwest::blocking::Client::new();
        let upstream = send_with_timeout_retries(|| client.get(&url), "test").unwrap();
        let result = convert(
            upstream,
            Context {
                stream,
                model: "test".into(),
                tools: CodexToolContext::default(),
                scope: None,
                request_history: Vec::new(),
            },
        )
        .unwrap();
        worker.join().unwrap();
        result
    }

    fn bytes(payload: UpstreamPayload) -> String {
        let mut data = Vec::new();
        match payload.body {
            UpstreamBody::Buffered(body) => data = body,
            UpstreamBody::Streaming(mut reader) => {
                reader.read_to_end(&mut data).unwrap();
            }
        }
        String::from_utf8(data).unwrap()
    }

    #[test]
    fn wrong_content_type_does_not_change_requested_response_shape() {
        let events = "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
        let payload = response(events, "application/json", true);
        assert!(is_event_stream(payload.content_type.as_deref()));
        assert!(bytes(payload).contains("response.completed"));
        let payload = response(events, "text/plain", false);
        assert!(!is_event_stream(payload.content_type.as_deref()));
        let response: Value = serde_json::from_str(&bytes(payload)).unwrap();
        assert_eq!(response["output"][0]["content"][0]["text"], "hello");
    }

    #[test]
    fn json_reply_to_streaming_request_emits_complete_events_and_keeps_tools() {
        let chat = json!({"choices":[{"message":{"tool_calls":[{"id":"one", "type":"function",
            "function":{"name":"lookup", "arguments":"{}"}}]}, "finish_reason":"tool_calls"}]});
        let payload = response(&chat.to_string(), "text/event-stream", true);
        let events = bytes(payload);
        assert!(events.contains("response.function_call_arguments.done"));
        assert!(events.contains("response.completed"));
        assert!(events.contains("lookup"));
    }

    #[test]
    fn bom_and_comment_prefixes_are_preserved_without_confusing_sse() {
        let input = "\u{feff}: keepalive\n\ndata: [DONE]\n\n";
        let (sse, reader) =
            sniff(Box::new(std::io::Cursor::new(input.as_bytes().to_vec()))).unwrap();
        assert!(sse);
        assert_eq!(
            read_response(reader).unwrap(),
            input.trim_start_matches('\u{feff}').as_bytes()
        );
    }
}
