use super::types::{HelpError, Result};
use crate::codex_gui::{
    account_selection::{self, GuiAccountSelection},
    auto_switch_settings, model_settings,
};
use serde_json::{json, Value};
use tauri::AppHandle;

const MAX_SYSTEM_PROMPT_CHARS: usize = 16_000;

pub(super) struct PreparedContext {
    pub(super) base_url: String,
    pub(super) model: String,
    pub(super) effort: model_settings::Effort,
    pub(super) system_prompt: String,
    pub(super) revision: u64,
    pub(super) configuration: Value,
}

pub(super) fn prepare(app: &AppHandle) -> Result<PreparedContext> {
    let snapshot = account_selection::snapshot(app).map_err(|_| HelpError::Unavailable)?;
    let paths = crate::storage::resolve_paths(app).map_err(|_| HelpError::Unavailable)?;
    let settings =
        crate::cloud::load_help_settings(app).map_err(|_| HelpError::ModelNotConfigured)?;
    validate_settings(&settings)?;
    let kind = match &snapshot.selection {
        GuiAccountSelection::None => return Err(HelpError::AccountRequired),
        GuiAccountSelection::Account(_) => "account",
        GuiAccountSelection::Provider(id) => {
            let provider = crate::providers::read_provider(&paths, id)
                .map_err(|_| HelpError::AccountRequired)?;
            if !crate::providers::supports_explicit_model(&provider, &settings.model) {
                return Err(HelpError::ModelUnsupported);
            }
            "provider"
        }
        GuiAccountSelection::Aggregate(id) => {
            let config = crate::aggregate_api::read_config(&paths, id)
                .map_err(|_| HelpError::AccountRequired)?;
            if !config.enabled || config.model != settings.model {
                return Err(HelpError::ModelUnsupported);
            }
            "aggregate"
        }
    };
    let model = settings.model;
    let effort = settings.effort;
    let state = crate::storage::try_read_state(&paths).map_err(|_| HelpError::Unavailable)?;
    let configuration = json!({
        "applicationVersion": app.package_info().version.to_string(), "platform": std::env::consts::OS,
        "assistant": {"model": model, "reasoningEffort": effort},
        "gui": {"selectedAccountKind": kind, "autoSwitch": gui_switch_summary(app)?},
        "accountManager": manager_summary(&state),
        "scope": "Only these saved settings were read, not live connectivity, logs, files or other conversations."
    });
    Ok(PreparedContext {
        base_url: crate::local_proxy::gui_runtime::ensure_started(app)
            .map_err(|_| HelpError::Unavailable)?,
        model,
        effort,
        system_prompt: settings.system_prompt,
        revision: snapshot.revision,
        configuration,
    })
}

pub(super) fn validate_settings(settings: &crate::cloud::CloudHelpSettings) -> Result<()> {
    model_settings::validate_model(&settings.model).map_err(|_| HelpError::ModelNotConfigured)?;
    if settings.system_prompt.trim().is_empty()
        || settings.system_prompt.chars().count() > MAX_SYSTEM_PROMPT_CHARS
    {
        return Err(HelpError::ModelNotConfigured);
    }
    Ok(())
}

fn gui_switch_summary(app: &AppHandle) -> Result<Value> {
    let settings = auto_switch_settings::read(app).map_err(|_| HelpError::Unavailable)?;
    Ok(json!({"enabled": settings.enabled, "mode": settings.mode,
        "switchOnQuotaExhaustion": settings.switch_on_quota_exhaustion,
        "minimumRemainingPercent": settings.minimum_remaining_percent,
        "fallbackProviderConfigured": settings.fallback_provider_id.is_some()}))
}

pub(super) fn manager_summary(state: &crate::models::ManagerStateFile) -> Value {
    json!({
        "proxyEnabled": state.local_proxy_enabled,
        "lanAccessEnabled": state.local_proxy_listen_on_all_interfaces,
        "autoSwitchOnQuotaExhaustion": state.auto_switch_on_quota_exhaustion,
        "concurrentRoutingEnabled": state.concurrent_account_routing_enabled,
        "promptFilterEnabled": state.system_prompt_filter_enabled,
        "promptInjectionEnabled": state.system_prompt_injection_enabled,
        "imageInputConfigured": state.image_input_target.is_some(),
        "imageOutputConfigured": state.image_output_target.is_some()
    })
}
