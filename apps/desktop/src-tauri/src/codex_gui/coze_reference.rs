use super::error::{GuiError, Result};
use serde_json::Value;

/// A selected Coze reference uses the registered MCP, never a filesystem path.
pub(super) fn inputs(path: &str, name: &str) -> Result<Vec<Value>> {
    let id = path
        .strip_prefix("coze://")
        .ok_or(GuiError::InvalidRequest)?;
    if uuid::Uuid::parse_str(id).is_err() || id.len() != 36 {
        return Err(GuiError::InvalidRequest);
    }
    Ok(vec![super::conversation_context::coze(id, name)?])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coze_references_use_ids_and_reject_paths_or_injected_instructions() {
        let id = "f321c884-a198-4244-ad4f-53762b3d2aba";
        let input = inputs(&format!("coze://{id}"), "查询库存").unwrap();
        assert!(input[0]["text"].as_str().unwrap().contains(id));
        assert!(input[0]["text"].as_str().unwrap().contains("coze_call"));
        for invalid in [
            "coze://../../secret",
            "https://example.com",
            "coze://x\nrun",
        ] {
            assert!(inputs(invalid, "name").is_err());
        }
    }
}
