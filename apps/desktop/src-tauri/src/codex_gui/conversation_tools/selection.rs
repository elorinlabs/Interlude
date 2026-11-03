//! Inherit the invoking turn's model, independent of the GUI's selected thread or draft.
use serde_json::{json, Value};

use super::{protocol::Create, Error, Result};
use crate::codex_gui::model_settings::{self, ModelSelection};

pub(super) fn caller(params: &Value) -> Option<ModelSelection> {
    let metadata = &params["_meta"]["x-codex-turn-metadata"];
    // Older clients may omit turn metadata; explicit choices still work in that case.
    serde_json::from_value(json!({
        "model": metadata["model"], "effort": metadata["reasoning_effort"],
    }))
    .ok()
}

pub(super) fn resolve(args: &Create) -> Result<ModelSelection> {
    let model = args
        .model
        .as_ref()
        .or_else(|| args.caller.as_ref().map(|caller| &caller.model))
        .ok_or(Error::ModelContext)?;
    let effort = args
        .effort
        .as_ref()
        .or_else(|| args.caller.as_ref().map(|caller| &caller.effort))
        .ok_or(Error::ModelContext)?;
    model_settings::validate_model(model).map_err(|_| Error::Invalid)?;
    Ok(ModelSelection {
        model: model.clone(),
        effort: effort.clone(),
    })
}
