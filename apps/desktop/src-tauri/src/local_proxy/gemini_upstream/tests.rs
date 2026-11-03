use serde_json::{json, Value};

use super::{continuation, request, response, Context};

pub(super) fn context(input: &Value) -> Context {
    Context {
        model: input["model"].as_str().unwrap_or("gemini-3-flash").into(),
        tools: super::super::build_codex_tool_context_from_request(input),
        scope: None,
        streaming: false,
        previous: None,
    }
}

fn convert(input: &Value) -> Value {
    request::convert(input, &context(input)).unwrap()
}

#[test]
fn native_contents_preserve_system_media_and_parallel_result_batches() {
    let result = convert(&json!({ "instructions": "Be helpful", "input": [
        {"role": "developer", "content": "Be concise"},
        {"role": "user", "content": [
            {"type": "input_text", "text": "Inspect"},
            {"type": "input_image", "image_url": "data:image/png;base64,aGVsbG8="},
            {"type": "input_file", "filename": "guide.pdf", "file_data": "aGVsbG8="},
            {"type": "input_audio", "input_audio": {"format": "wav", "data": "aGVsbG8="}}
        ]},
        {"type": "function_call", "call_id": "one", "name": "read", "arguments": "{}"},
        {"type": "function_call", "call_id": "two", "name": "read", "arguments": "{\"x\":1}"},
        {"type": "function_call_output", "call_id": "one", "output": "{\"ok\":true}"},
        {"role": "user", "content": "Continue"},
        {"type": "function_call_output", "call_id": "two", "output": [{"type":"text","text":"Done"}]}
    ] }));
    assert_eq!(
        result["systemInstruction"]["parts"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let contents = &result["contents"];
    assert_eq!(
        contents[0]["parts"][1]["inlineData"]["mimeType"],
        "image/png"
    );
    assert_eq!(
        contents[0]["parts"][2]["inlineData"]["mimeType"],
        "application/pdf"
    );
    assert_eq!(
        contents[0]["parts"][3]["inlineData"]["mimeType"],
        "audio/wav"
    );
    assert_eq!(contents[1]["role"], "model");
    assert_eq!(contents[1]["parts"].as_array().unwrap().len(), 2);
    assert_eq!(
        contents[2]["parts"][0]["functionResponse"]["response"],
        json!({"ok":true})
    );
    assert_eq!(contents[2]["parts"][1]["functionResponse"]["id"], "two");
    assert_eq!(contents[2]["parts"][2]["text"], "Continue");
}

#[test]
fn native_tools_keep_schema_namespaces_forced_choice_and_output_schema() {
    let schema = json!({"type":"object","properties":{"x":{"type":["string","null"]}},
        "required":["x"], "additionalProperties":false});
    let result = convert(
        &json!({"input":"Use read", "max_tokens":10,"max_output_tokens":20,
            "tools":[{"type":"namespace","name":"files","tools":[
                {"type":"function","name":"read","parameters":schema}
            ]}],"tool_choice":{"type":"function","name":"read","namespace":"files"},
            "text":{"format":{"type":"json_schema","schema":schema}}
        }),
    );
    let declaration = &result["tools"][0]["functionDeclarations"][0];
    assert_eq!(declaration["parametersJsonSchema"], schema);
    assert_eq!(
        result["toolConfig"]["functionCallingConfig"]["allowedFunctionNames"][0],
        declaration["name"]
    );
    assert_eq!(result["toolConfig"]["functionCallingConfig"]["mode"], "ANY");
    assert_eq!(result["generationConfig"]["responseJsonSchema"], schema);
    assert_eq!(result["generationConfig"]["maxOutputTokens"], 20);
}

#[test]
fn native_thinking_uses_only_supported_model_families() {
    for (model, field, value) in [
        ("gemini-3-flash", "thinkingLevel", json!("MINIMAL")),
        ("gemini-3-pro", "thinkingLevel", json!("LOW")),
        ("gemini-2.5-flash", "thinkingBudget", json!(0)),
        ("gemini-2.5-pro", "thinkingBudget", json!(1_024)),
    ] {
        let result = convert(&json!({"model":model,"input":"Hi","reasoning":{"effort":"none"}}));
        assert_eq!(
            result["generationConfig"]["thinkingConfig"][field], value,
            "{model}"
        );
    }
    let old =
        convert(&json!({"model":"gemini-1.5-pro","input":"Hi","reasoning":{"effort":"high"}}));
    assert!(old["generationConfig"].get("thinkingConfig").is_none());
}

#[test]
fn native_rejects_malformed_tools_media_search_and_multiple_candidates() {
    for input in [
        json!({"input":[{"type":"function_call","call_id":"id","name":"read","arguments":"[]"}]}),
        json!({"input":[{"type":"function_call_output","call_id":"missing","output":"ok"}]}),
        json!({"input":[{"role":"user","content":[{"type":"input_image","image_url":"file:///private"}]}]}),
        json!({"input":"Hi","tools":[{"type":"web_search","filters":{"allowed_domains":["example.com"]}}]}),
    ] {
        assert!(request::convert(&input, &context(&input)).is_err());
    }
    assert!(
        super::request_options::validate(&json!({"generationConfig":{"candidateCount":2}}))
            .is_err()
    );
}

#[test]
fn native_file_urls_and_json_arrays_remain_lossless() {
    let result = convert(&json!({"input":[
        {"role":"user","content":[{"type":"file","file":{"file_url":"https://example.com/files/opaque"}}]},
        {"type":"function_call","call_id":"call","name":"list","arguments":"{}"},
        {"type":"function_call_output","call_id":"call","output":[{"type":"record","value":1}]}
    ]}));
    assert_eq!(
        result["contents"][0]["parts"][0],
        json!({"fileData":{"fileUri":"https://example.com/files/opaque"}})
    );
    assert_eq!(
        result["contents"][2]["parts"][0]["functionResponse"]["response"]["output"],
        json!([{"type":"record","value":1}])
    );
}

#[test]
fn signed_native_parts_replay_exactly_and_only_within_session() {
    let input = json!({"tools":[{"type":"function","name":"run","parameters":{"type":"object"}}]});
    let mut context = context(&input);
    context.scope = Some(continuation::Scope::fixture("signed-native"));
    let parts = json!([
        {"text":"","thoughtSignature":"opaque-empty"},
        {"text":"Plan","thought":true,"thoughtSignature":"opaque-thought"},
        {"functionCall":{"name":"run"},"thoughtSignature":"opaque-tool"}
    ]);
    let chat = response::to_chat(
        &json!({"candidates":[{"content":{"parts":parts},"finishReason":"STOP"}]}),
        &context,
    )
    .unwrap();
    let call = &chat["choices"][0]["message"]["tool_calls"][0];
    let request = json!({"input":[
        {"type":"function_call","call_id":call["id"],"name":"run","arguments":"{}"},
        {"type":"function_call_output","call_id":call["id"],"output":"done"}
    ]});
    let restored = request::convert(&request, &context).unwrap();
    assert_eq!(restored["contents"][0]["parts"], parts);
    assert!(restored["contents"][1]["parts"][0]["functionResponse"]
        .get("id")
        .is_none());
    context.scope = Some(continuation::Scope::fixture("different-native"));
    assert_eq!(
        request::convert(&request, &context).unwrap()["contents"][0]["parts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    context.scope = None;
    assert_eq!(
        request::convert(&request, &context).unwrap()["contents"][0]["parts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn native_usage_counts_thoughts_without_double_counting_cached_input() {
    let usage = response::usage(&json!({"promptTokenCount":20,"cachedContentTokenCount":10,
        "toolUsePromptTokenCount":3,"candidatesTokenCount":5,"thoughtsTokenCount":4,"totalTokenCount":32}));
    assert_eq!(usage["prompt_tokens"], 23);
    assert_eq!(usage["completion_tokens"], 9);
    assert_eq!(usage["prompt_tokens_details"]["cached_tokens"], 10);
    assert_eq!(usage["completion_tokens_details"]["reasoning_tokens"], 4);
}

#[test]
fn native_history_never_ignores_unknown_cursors_or_missing_session() {
    for input in [
        json!({"previous_response_id":"missing", "input":"Next"}),
        json!({"input":[{"type":"function_call_output","call_id":"missing","output":"Done"}]}),
    ] {
        assert!(super::history::restore(&input, None).is_err());
        assert!(super::history::restore(
            &input,
            Some(&continuation::Scope::fixture("history-missing"))
        )
        .is_err());
    }
}
