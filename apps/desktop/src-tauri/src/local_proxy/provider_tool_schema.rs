use serde_json::{json, Value};

const SCHEMA_MAP_KEYS: &[&str] = &[
    "$defs",
    "definitions",
    "properties",
    "patternProperties",
    "dependentSchemas",
    "dependencies",
];
const SCHEMA_LIST_KEYS: &[&str] = &["allOf", "anyOf", "oneOf", "prefixItems"];
const SCHEMA_VALUE_KEYS: &[&str] = &[
    "items",
    "additionalItems",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "contains",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
];

/// Normalize reference siblings only for endpoints with the restricted tool schema dialect.
pub(super) fn adapt_chat_tool_schemas(base_url: &str, chat_body: &mut Value) {
    let Ok(url) = reqwest::Url::parse(base_url) else {
        return;
    };
    if !matches!(
        url.host_str(),
        Some("api.moonshot.cn" | "api.moonshot.ai" | "api.kimi.com")
    ) {
        return;
    }
    let Some(tools) = chat_body.get_mut("tools").and_then(Value::as_array_mut) else {
        return;
    };
    for tool in tools {
        if tool.get("type").and_then(Value::as_str) != Some("function") {
            continue;
        }
        if let Some(schema) = tool.pointer_mut("/function/parameters") {
            normalize_schema(schema);
        }
    }
}

fn normalize_schema(schema: &mut Value) {
    let Some(object) = schema.as_object_mut() else {
        return;
    };
    for key in SCHEMA_MAP_KEYS {
        if let Some(children) = object.get_mut(*key).and_then(Value::as_object_mut) {
            children.values_mut().for_each(normalize_schema);
        }
    }
    for key in SCHEMA_LIST_KEYS {
        if let Some(children) = object.get_mut(*key).and_then(Value::as_array_mut) {
            children.iter_mut().for_each(normalize_schema);
        }
    }
    for key in SCHEMA_VALUE_KEYS {
        let Some(child) = object.get_mut(*key) else {
            continue;
        };
        if let Some(children) = child.as_array_mut().filter(|_| *key == "items") {
            children.iter_mut().for_each(normalize_schema);
        } else {
            normalize_schema(child);
        }
    }
    // Never visit default, examples, const, enum, or unknown extension payloads: they are data.
    if object.len() <= 1 || !object.get("$ref").is_some_and(Value::is_string) {
        return;
    }
    if object.get("allOf").is_some_and(|value| !value.is_array()) {
        return;
    }
    if let Some(reference) = object.remove("$ref") {
        if let Some(branches) = object
            .entry("allOf")
            .or_insert_with(|| json!([]))
            .as_array_mut()
        {
            branches.push(json!({ "$ref": reference }));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(schema: Value) -> Value {
        json!({ "tools": [{ "type": "function", "function": { "name": "lookup", "parameters": schema } }] })
    }

    #[test]
    fn schema_reference_siblings_keep_constraints_and_literal_data() {
        let literal = json!({ "$ref": "literal", "description": "unchanged" });
        let schema = json!({ "$defs": { "word": { "type": "string" } },
            "properties": { "query": { "$ref": "#/$defs/word", "description": "search",
                "allOf": [{ "minLength": 2 }], "default": literal, "examples": [literal] } },
            "const": literal, "enum": [literal], "extension": literal,
            "additionalProperties": { "$ref": "#/$defs/word", "maxLength": 20 } });
        let mut body = request(schema);
        adapt_chat_tool_schemas("https://api.moonshot.cn/v1", &mut body);
        let schema = &body["tools"][0]["function"]["parameters"];
        let query = &schema["properties"]["query"];
        assert!(query.get("$ref").is_none());
        assert_eq!(
            query["allOf"],
            json!([{ "minLength": 2 }, { "$ref": "#/$defs/word" }])
        );
        assert_eq!(query["default"], literal);
        assert_eq!(query["examples"][0], literal);
        assert_eq!(schema["const"], literal);
        assert_eq!(schema["enum"][0], literal);
        assert_eq!(schema["extension"], literal);
        assert_eq!(
            schema["additionalProperties"]["allOf"][0]["$ref"],
            "#/$defs/word"
        );
        let normalized = body.clone();
        adapt_chat_tool_schemas("https://api.moonshot.cn/v1", &mut body);
        assert_eq!(body, normalized);
    }

    #[test]
    fn schema_adapter_requires_an_exact_provider_host() {
        let original = request(json!({ "$ref": "#/$defs/item", "description": "keep" }));
        for host in [
            "https://other.example",
            "https://api.moonshot.cn.attacker.example",
            "https://other.example/api.moonshot.cn",
            "not-a-url",
        ] {
            let mut body = original.clone();
            adapt_chat_tool_schemas(host, &mut body);
            assert_eq!(body, original);
        }
    }

    #[test]
    fn schema_adapter_visits_combinators_and_tuple_items_only_as_schemas() {
        let mut schema = json!({ "anyOf": [{ "items": [{ "$ref": "#", "description": "tuple" }] }],
            "dependencies": { "data": { "$ref": "#", "title": "dependency" }, "names": ["data"] } });
        normalize_schema(&mut schema);
        assert_eq!(schema["anyOf"][0]["items"][0]["allOf"][0]["$ref"], "#");
        assert_eq!(schema["dependencies"]["data"]["allOf"][0]["$ref"], "#");
        assert_eq!(schema["dependencies"]["names"], json!(["data"]));
    }
}
