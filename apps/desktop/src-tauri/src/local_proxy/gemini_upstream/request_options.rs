use super::{BridgeError, Context};
use serde_json::{json, Value};

const LOW_THINKING_BUDGET: u64 = 1_024;
const MEDIUM_THINKING_BUDGET: u64 = 4_096;
const HIGH_THINKING_BUDGET: u64 = 8_192;

pub(super) fn apply(input: &Value, body: &mut Value, context: &Context) -> Result<(), BridgeError> {
    let mut config = json!({ "candidateCount": 1 });
    for (source, target) in [
        ("temperature", "temperature"),
        ("top_p", "topP"),
        ("max_tokens", "maxOutputTokens"),
        ("max_output_tokens", "maxOutputTokens"),
    ] {
        if let Some(value) = input.get(source) {
            config[target] = value.clone()
        }
    }
    if let Some(effort) = input.pointer("/reasoning/effort").and_then(Value::as_str) {
        if let Some(thinking) = thinking_config(&context.model, effort) {
            config["thinkingConfig"] = thinking;
        }
    }
    match input.pointer("/text/format/type").and_then(Value::as_str) {
        Some("json_schema") => {
            config["responseMimeType"] = json!("application/json");
            config["responseJsonSchema"] = input["text"]["format"]["schema"].clone();
        }
        Some("json_object") => config["responseMimeType"] = json!("application/json"),
        _ => {}
    }
    body["generationConfig"] = config;
    apply_tools(input, body, context)
}

fn apply_tools(input: &Value, body: &mut Value, context: &Context) -> Result<(), BridgeError> {
    if input["tool_choice"] == "none" {
        return Ok(());
    }
    if input.get("max_tool_calls").is_some()
        && (input["tools"]
            .as_array()
            .is_some_and(|tools| !tools.is_empty())
            || !context.tools.chat_tools().is_empty())
    {
        return Err(BridgeError::UnsupportedToolOptions);
    }
    let declarations = context.tools.chat_tools().iter().filter_map(|tool| {
        let function = tool.get("function")?;
        Some(json!({ "name": function["name"], "description": function["description"].as_str().unwrap_or(""),
            "parametersJsonSchema": function.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object" })) }))
    }).collect::<Vec<_>>();
    let mut tools = Vec::new();
    if !declarations.is_empty() {
        if input["parallel_tool_calls"] == false {
            return Err(BridgeError::UnsupportedToolOptions);
        }
        tools.push(json!({ "functionDeclarations": declarations }));
        apply_tool_choice(input, body, context)?;
    } else if input
        .get("tool_choice")
        .is_some_and(|choice| !choice.is_null() && choice != "auto")
    {
        return Err(BridgeError::UnsupportedToolOptions);
    }
    for tool in input["tools"].as_array().into_iter().flatten() {
        match tool["type"].as_str() {
            Some("web_search" | "web_search_preview") => {
                if tool.get("filters").is_some()
                    || tool.get("user_location").is_some()
                    || tool.get("max_uses").is_some()
                {
                    return Err(BridgeError::UnsupportedSearchOptions);
                }
                tools.push(json!({ "googleSearch": {} }));
            }
            Some("function" | "custom" | "namespace" | "tool_search") | None => {}
            _ => return Err(BridgeError::UnsupportedContent),
        }
    }
    if !tools.is_empty() {
        body["tools"] = json!(tools)
    }
    Ok(())
}

fn apply_tool_choice(
    input: &Value,
    body: &mut Value,
    context: &Context,
) -> Result<(), BridgeError> {
    let choice = input
        .get("tool_choice")
        .map(|choice| super::super::responses_tool_choice_to_chat(choice, &context.tools));
    let config = match choice.as_ref() {
        Some(Value::String(choice)) if choice == "required" => json!({ "mode": "ANY" }),
        Some(Value::String(choice)) if choice == "none" => json!({ "mode": "NONE" }),
        Some(choice) if choice["type"] == "function" => {
            let name = &choice["function"]["name"];
            if !name.is_string()
                || !context
                    .tools
                    .chat_tools()
                    .iter()
                    .any(|tool| tool["function"]["name"] == *name)
            {
                return Err(BridgeError::UnsupportedToolOptions);
            }
            json!({ "mode": "ANY", "allowedFunctionNames": [name] })
        }
        None | Some(Value::Null) => json!({ "mode": "AUTO" }),
        Some(Value::String(choice)) if choice == "auto" => json!({ "mode": "AUTO" }),
        _ => return Err(BridgeError::UnsupportedToolOptions),
    };
    body["toolConfig"] = json!({ "functionCallingConfig": config });
    Ok(())
}

fn thinking_config(model: &str, effort: &str) -> Option<Value> {
    let model = model.strip_prefix("models/").unwrap_or(model);
    let major = model
        .strip_prefix("gemini-")
        .and_then(|version| version.split(['.', '-']).next())
        .and_then(|version| version.parse::<u32>().ok())
        .unwrap_or(0);
    if major >= 3 {
        let level = match effort {
            "none" | "minimal" if model.contains("flash") => "MINIMAL",
            "none" | "minimal" | "low" => "LOW",
            "medium" if model.contains("flash") => "MEDIUM",
            _ => "HIGH",
        };
        return Some(json!({ "thinkingLevel": level, "includeThoughts": effort != "none" }));
    }
    if !model.starts_with("gemini-2.5-") {
        return None;
    }
    let budget = match effort {
        "none" if !model.contains("pro") => 0,
        "none" | "minimal" | "low" => LOW_THINKING_BUDGET,
        "medium" => MEDIUM_THINKING_BUDGET,
        _ => HIGH_THINKING_BUDGET,
    };
    Some(json!({ "thinkingBudget": budget, "includeThoughts": effort != "none" }))
}

pub(super) fn validate(body: &Value) -> Result<(), BridgeError> {
    let config = &body["generationConfig"];
    if !config.is_object()
        || config["candidateCount"].as_u64() != Some(1)
        || body.get("generation_config").is_some()
    {
        return Err(BridgeError::UnsupportedGenerationOptions);
    }
    Ok(())
}
