use serde_json::{json, Value};

use super::super::CodexToolContext;

const MIN_THINKING_TOKENS: u64 = 1_024;
const MEDIUM_THINKING_TOKENS: u64 = 4_096;
const HIGH_THINKING_TOKENS: u64 = 8_192;

pub(super) fn apply(input: &Value, result: &mut Value, context: &CodexToolContext) {
    if let Some(maximum) = input
        .get("max_output_tokens")
        .or_else(|| input.get("max_tokens"))
        .or_else(|| input.get("max_completion_tokens"))
    {
        // Preserve explicit values for validation; absence is resolved from model metadata later.
        result["max_tokens"] = maximum.clone();
    }
    for field in ["stream", "temperature", "top_p"] {
        if let Some(value) = input.get(field) {
            result[field] = value.clone();
        }
    }
    let tools = context
        .chat_tools()
        .iter()
        .filter_map(convert_tool)
        .collect::<Vec<_>>();
    if !tools.is_empty() {
        result["tools"] = Value::Array(tools);
        apply_tool_choice(input, result, context);
    }
    apply_thinking(input, result);
    if let Some(format) = input
        .pointer("/text/format")
        .filter(|format| format["type"] == "json_schema")
    {
        result["output_config"]["format"] =
            json!({ "type": "json_schema", "schema": format["schema"] });
    }
}

fn convert_tool(tool: &Value) -> Option<Value> {
    let function = tool.get("function")?;
    let mut tool = json!({ "name": function["name"],
        "input_schema": function.get("parameters").cloned()
            .unwrap_or_else(|| json!({ "type": "object", "properties": {} })) });
    if let Some(description) = function["description"].as_str() {
        tool["description"] = json!(description);
    }
    Some(tool)
}

fn apply_tool_choice(input: &Value, result: &mut Value, context: &CodexToolContext) {
    let choice = input
        .get("tool_choice")
        .map(|choice| super::super::responses_tool_choice_to_chat(choice, context));
    result["tool_choice"] = match choice.as_ref() {
        Some(Value::String(choice)) if choice == "required" => json!({ "type": "any" }),
        Some(Value::String(choice)) if choice == "none" => json!({ "type": "none" }),
        Some(choice) if choice["type"] == "function" => {
            json!({ "type": "tool", "name": choice["function"]["name"] })
        }
        _ => json!({ "type": "auto" }),
    };
    if input["parallel_tool_calls"] == false && result["tool_choice"]["type"] != "none" {
        result["tool_choice"]["disable_parallel_tool_use"] = json!(true);
    }
}

fn apply_thinking(input: &Value, result: &mut Value) {
    let Some(effort) = input.pointer("/reasoning/effort").and_then(Value::as_str) else {
        return;
    };
    if effort == "none" {
        result["thinking"] = json!({ "type": "disabled" });
        return;
    }
    // Forced tool use and manual thinking are incompatible; retain the explicit tool choice.
    if matches!(result["tool_choice"]["type"].as_str(), Some("any" | "tool")) {
        return;
    }
    let model = result["model"].as_str().unwrap_or_default();
    if adaptive_thinking_model(model) {
        result["thinking"] = json!({ "type": "adaptive" });
        result["output_config"]["effort"] = json!(match effort {
            "minimal" | "low" => "low",
            "medium" => "medium",
            _ => "high",
        });
    } else {
        let budget = match effort {
            "minimal" | "low" => MIN_THINKING_TOKENS,
            "medium" => MEDIUM_THINKING_TOKENS,
            _ => HIGH_THINKING_TOKENS,
        };
        let available = result["max_tokens"]
            .as_u64()
            .unwrap_or(budget + 1)
            .saturating_sub(1);
        if available < MIN_THINKING_TOKENS {
            return;
        }
        result["thinking"] = json!({ "type": "enabled", "budget_tokens": budget.min(available) });
    }
    if let Some(object) = result.as_object_mut() {
        object.remove("temperature");
        object.remove("top_p");
    }
}

pub(super) fn validate_after_overrides(
    result: &mut Value,
) -> Result<(), super::request::ConversionError> {
    use super::request::ConversionError;
    let maximum = result["max_tokens"]
        .as_u64()
        .filter(|value| *value > 0)
        .ok_or(ConversionError::InvalidOutputLimit)?;
    let enabled = matches!(
        result["thinking"]["type"].as_str(),
        Some("enabled" | "adaptive")
    );
    if enabled && matches!(result["tool_choice"]["type"].as_str(), Some("any" | "tool")) {
        return Err(ConversionError::IncompatibleToolChoice);
    }
    if result["thinking"]["type"] == "enabled" {
        let budget = result["thinking"]["budget_tokens"]
            .as_u64()
            .filter(|value| *value >= MIN_THINKING_TOKENS)
            .ok_or(ConversionError::InvalidThinkingBudget)?;
        if maximum <= MIN_THINKING_TOKENS {
            return Err(ConversionError::InvalidThinkingBudget);
        }
        result["thinking"]["budget_tokens"] = json!(budget.min(maximum - 1));
    }
    Ok(())
}

fn adaptive_thinking_model(model: &str) -> bool {
    let Some(version) = model
        .strip_prefix("claude-")
        .and_then(|model| model.split_once('-').map(|(_, v)| v))
    else {
        return false;
    };
    let mut parts = version.split(['-', '.']);
    let major = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    major >= 5 || (major == 4 && (6..100).contains(&minor))
}
