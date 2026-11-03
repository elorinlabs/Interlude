//! Handle single-use MCP confirmations without accepting arbitrary elicitation forms.
use serde_json::{json, Value};

use super::{
    error::{GuiError, Result},
    protocol::{Decision, GuiEvent},
};

pub(super) const METHOD: &str = "mcpServer/elicitation/request";

pub(super) fn supported(event: &GuiEvent) -> bool {
    let params = &event.params;
    let schema = &params["requestedSchema"];
    event.method == METHOD
        && params["mode"] == "form"
        && params["_meta"]["codex_approval_kind"] == "mcp_tool_call"
        && schema["type"] == "object"
        && schema["properties"]
            .as_object()
            .is_some_and(|properties| properties.is_empty())
        && schema
            .get("required")
            .is_none_or(|required| required.as_array().is_some_and(|fields| fields.is_empty()))
}

pub(super) fn response(event: &GuiEvent, decision: Decision) -> Result<Value> {
    if !supported(event) {
        return Err(GuiError::InvalidRequest);
    }
    let content = if matches!(decision, Decision::Accept) {
        json!({})
    } else {
        Value::Null
    };
    // No persistence metadata: approval applies only to this invocation.
    Ok(json!({"action": decision, "content": content}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event() -> GuiEvent {
        GuiEvent {
            method: METHOD.into(),
            id: Some(json!(1)),
            params: json!({
                "mode": "form", "_meta": {"codex_approval_kind": "mcp_tool_call"},
                "requestedSchema": {"type": "object", "properties": {}}
            }),
        }
    }

    #[test]
    fn confirmations_are_single_use_and_preserve_denial() {
        assert_eq!(
            response(&event(), Decision::Accept).unwrap(),
            json!({"action":"accept","content":{}})
        );
        assert_eq!(
            response(&event(), Decision::Decline).unwrap(),
            json!({"action":"decline","content":null})
        );
        assert_eq!(
            response(&event(), Decision::Cancel).unwrap(),
            json!({"action":"cancel","content":null})
        );
    }

    #[test]
    fn other_forms_and_url_flows_are_not_treated_as_confirmations() {
        for patch in [
            json!({"mode":"url"}),
            json!({"_meta":null}),
            json!({"requestedSchema":{"type":"object","properties":{"password":{"type":"string"}}}}),
            json!({"requestedSchema":{"type":"object","properties":{},"required":["password"]}}),
        ] {
            let mut request = event();
            request
                .params
                .as_object_mut()
                .unwrap()
                .extend(patch.as_object().unwrap().clone());
            assert!(response(&request, Decision::Accept).is_err());
        }
    }
}
