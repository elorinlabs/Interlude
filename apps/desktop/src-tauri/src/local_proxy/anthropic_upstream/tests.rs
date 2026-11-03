use serde_json::{json, Value};

use super::{continuation, request, response};

fn convert(value: &Value) -> Value {
    let tools = super::super::build_codex_tool_context_from_request(value);
    request::convert(
        value,
        &tools,
        &continuation::Scope::fixture("request-tests"),
    )
    .unwrap()
}

#[test]
fn native_messages_preserve_instructions_images_and_parallel_tool_results() {
    let result = convert(&json!({
        "model": "claude-sonnet-4-6", "instructions": "Be helpful", "stream": true,
        "input": [
            { "role": "developer", "content": "Be concise" },
            { "role": "user", "content": [{ "type": "input_text", "text": "Inspect" },
                { "type": "input_image", "image_url": "data:image/png;base64,aGVsbG8=" }] },
            { "type": "function_call", "call_id": "one", "name": "read", "arguments": "{}" },
            { "type": "function_call", "call_id": "two", "name": "read", "arguments": "{\"path\":\"x\"}" },
            { "type": "function_call_output", "call_id": "one", "output": "first" },
            { "type": "function_call_output", "call_id": "two", "output": [
                { "type": "input_image", "image_url": "https://example.com/image.png" }
            ] }
        ]
    }));
    assert_eq!(result["system"][0]["text"], "Be helpful");
    assert_eq!(result["system"][1]["text"], "Be concise");
    assert_eq!(
        result["messages"][0]["content"][1]["source"]["type"],
        "base64"
    );
    assert_eq!(
        result["messages"][1]["content"].as_array().unwrap().len(),
        2
    );
    let results = &result["messages"][2]["content"];
    assert_eq!(results[0]["tool_use_id"], "one");
    assert_eq!(
        results[1]["content"][0]["source"]["url"],
        "https://example.com/image.png"
    );
    assert_eq!(result["stream"], true);
    assert!(result.get("max_tokens").is_none());
}

#[test]
fn native_tools_preserve_custom_namespaces_and_forced_choice() {
    let result = convert(&json!({ "model": "claude-opus-4-6", "input": "Use read",
        "reasoning": { "effort": "high" }, "parallel_tool_calls": false,
        "tools": [{ "type": "namespace", "name": "files", "tools": [
            { "type": "function", "name": "read", "parameters": { "type": "object" } }
        ] }], "tool_choice": { "type": "function", "name": "read", "namespace": "files" }
    }));
    assert_eq!(result["tools"][0]["name"], result["tool_choice"]["name"]);
    assert_eq!(result["tool_choice"]["type"], "tool");
    assert_eq!(result["tool_choice"]["disable_parallel_tool_use"], true);
    assert!(result.get("thinking").is_none());
    assert_ne!(result["tools"][0].get("description"), Some(&Value::Null));
}

#[test]
fn native_thinking_uses_model_supported_modes_and_bounded_budget() {
    let input = json!({ "model": "claude-sonnet-4-6", "input": "hello",
        "reasoning": { "effort": "xhigh" }, "temperature": 0.4, "top_p": 0.9,
        "text": { "format": { "type": "json_schema", "schema": { "type": "object" } } } });
    let result = convert(&input);
    assert_eq!(result["thinking"]["type"], "adaptive");
    assert_eq!(result["output_config"]["effort"], "high");
    assert_eq!(result["output_config"]["format"]["type"], "json_schema");
    assert!(result.get("temperature").is_none());
    assert!(result.get("top_p").is_none());
    let mut legacy = input;
    legacy["model"] = json!("claude-sonnet-4-20250514");
    legacy["max_output_tokens"] = json!(2_000);
    let result = convert(&legacy);
    assert_eq!(
        result["thinking"],
        json!({ "type": "enabled", "budget_tokens": 1_999 })
    );
    legacy["reasoning"]["effort"] = json!("none");
    assert_eq!(convert(&legacy)["thinking"]["type"], "disabled");
}

#[test]
fn native_rejects_invalid_tool_arguments_and_unsafe_image_schemes() {
    for input in [
        json!([{ "type": "function_call", "call_id": "id", "name": "run", "arguments": "oops" }]),
        json!([{ "role": "user", "content": [{ "type": "input_image", "image_url": "file:///private" }] }]),
    ] {
        let value = json!({ "model": "claude", "input": input });
        let tools = super::super::build_codex_tool_context_from_request(&value);
        assert!(
            request::convert(&value, &tools, &continuation::Scope::fixture("invalid")).is_err()
        );
    }
}

#[test]
fn native_response_maps_usage_status_and_custom_tools() {
    let source = json!({ "id": "msg_native", "model": "claude", "stop_reason": "tool_use",
        "content": [{ "type": "text", "text": "Working" },
            { "type": "tool_use", "id": "call", "name": "edit", "input": { "input": "patch" } }],
        "usage": { "input_tokens": 10, "output_tokens": 5,
            "cache_read_input_tokens": 30, "cache_creation_input_tokens": 20 } });
    let context = super::super::build_codex_tool_context_from_request(&json!({
        "tools": [{ "type": "custom", "name": "edit", "description": "Edit a file" }]
    }));
    let chat = response::to_chat(&source, &continuation::Scope::fixture("response")).unwrap();
    let result = super::super::chat_to_responses_json(&chat, &context, None);
    assert_eq!(result["status"], "completed");
    assert_eq!(result["usage"]["input_tokens"], 60);
    assert_eq!(result["usage"]["input_tokens_details"]["cached_tokens"], 30);
    assert_eq!(result["usage"]["total_tokens"], 65);
    assert_eq!(result["output"][1]["type"], "custom_tool_call");
    assert_eq!(result["output"][1]["input"], "patch");
}

#[test]
fn native_signed_thinking_replay_requires_same_scope_and_complete_tool_turn() {
    let scope = continuation::Scope::fixture("signed");
    let content = vec![
        json!({ "type": "thinking", "thinking": "Plan", "signature": "signed-value" }),
        json!({ "type": "redacted_thinking", "data": "opaque" }),
        json!({ "type": "tool_use", "id": "call", "name": "run", "input": { "x": 1 } }),
    ];
    continuation::capture(&scope, &content);
    let mut replay = vec![content[2].clone()];
    continuation::restore(
        &continuation::Scope::fixture("different-session"),
        &mut replay,
    );
    assert_eq!(replay.len(), 1);
    replay[0]["input"]["x"] = json!(2);
    continuation::restore(&scope, &mut replay);
    assert_eq!(replay.len(), 1);
    replay[0]["input"]["x"] = json!(1);
    continuation::restore(&scope, &mut replay);
    assert_eq!(replay, content);
}

#[test]
fn native_signed_thinking_never_shares_history_without_a_session() {
    let scope = continuation::Scope::fixture("");
    let content = vec![
        json!({ "type": "thinking", "thinking": "Plan", "signature": "private-signature" }),
        json!({ "type": "tool_use", "id": "shared-id", "name": "run", "input": {} }),
    ];
    continuation::capture(&scope, &content);
    let mut replay = vec![content[1].clone()];
    continuation::restore(&scope, &mut replay);
    assert_eq!(replay, vec![content[1].clone()]);
}

#[test]
fn native_thinking_overrides_reject_impossible_budgets_and_forced_tools() {
    for mut result in [
        json!({ "max_tokens": 1_024, "thinking": { "type": "enabled", "budget_tokens": 1_024 } }),
        json!({ "max_tokens": 8_192, "thinking": { "type": "adaptive" }, "tool_choice": { "type": "any" } }),
        json!({ "max_tokens": 0 }),
    ] {
        assert!(super::request_options::validate_after_overrides(&mut result).is_err());
    }
}

#[test]
fn native_tool_json_arrays_remain_plain_result_text() {
    let result = convert(&json!({ "model": "claude", "input": [
        { "type": "function_call", "call_id": "call", "name": "list", "arguments": "{}" },
        { "type": "function_call_output", "call_id": "call", "output": "[1,2,3]" }
    ] }));
    assert_eq!(
        result["messages"][1]["content"][0]["content"][0]["text"],
        "[1,2,3]"
    );
}
