use super::{ProxySessionState, TokenUsageContext};
use crate::{
    codex_usage_cost_rates,
    models::{ProviderProfile, TokenUsageEntry},
};

struct Costs {
    rates: codex_usage_cost_rates::CostRates,
    providers: Vec<ProviderProfile>,
}

impl Costs {
    fn load<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Self, String> {
        let paths = crate::storage::resolve_paths(app)?;
        Ok(Self {
            rates: codex_usage_cost_rates::load(&paths)?,
            providers: crate::providers::list_provider_profiles(&paths)?,
        })
    }

    fn estimate(&self, entry: &TokenUsageEntry) -> f64 {
        let provider = self
            .providers
            .iter()
            .find(|provider| match entry.provider_id.as_deref() {
                Some(id) => provider.id == id,
                None => provider
                    .name
                    .trim()
                    .eq_ignore_ascii_case(entry.provider.trim()),
            });
        self.rates.estimate_cost(entry, provider)
    }
}

/// Initialize older complete histories once, without reading pricing files during normal polling.
pub(super) fn initialize<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Result<(), String> {
    let snapshot = super::proxy_sessions()
        .lock()
        .map_err(|error| error.to_string())?
        .get(id)
        .filter(|session| {
            session.token_totals.estimated_cost_usd.is_none()
                && session.request_count <= super::PROXY_SESSION_REQUEST_KEEP_ROWS as u64
        })
        .map(ProxySessionState::metadata_snapshot);
    let Some(mut snapshot) = snapshot else {
        return Ok(());
    };
    snapshot.requests = super::proxy_history_requests(id)?.into();
    let costs = Costs::load(app)?;
    let amount = historical_cost(&snapshot, &costs);
    let mut sessions = super::proxy_sessions()
        .lock()
        .map_err(|error| error.to_string())?;
    if let Some(session) = sessions.get_mut(id) {
        if session.token_totals.estimated_cost_usd.is_none()
            && session.request_count == snapshot.request_count
        {
            session.token_totals.estimated_cost_usd = amount;
        }
    }
    drop(sessions);
    super::persist_proxy_session(id, None);
    Ok(())
}

/// Record each billed request before updating its token totals. The sum survives history pruning and restart.
pub(super) fn record<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    context: &TokenUsageContext,
    entry: &TokenUsageEntry,
) -> Result<(), String> {
    let Some(id) = context.session_id.as_deref() else {
        return Ok(());
    };
    initialize(app, id)?;
    let costs = Costs::load(app)?;
    let mut sessions = super::proxy_sessions()
        .lock()
        .map_err(|error| error.to_string())?;
    if let Some(session) = sessions.get_mut(id) {
        add_cost(session, entry, &costs);
    }
    Ok(())
}

fn add_cost(session: &mut ProxySessionState, entry: &TokenUsageEntry, costs: &Costs) {
    let previous = session
        .token_totals
        .estimated_cost_usd
        .or_else(|| historical_cost(session, costs));
    session.token_totals.estimated_cost_usd = previous.map(|cost| cost + costs.estimate(entry));
}

fn complete_history(session: &ProxySessionState) -> bool {
    // Never present a retained tail of a legacy conversation as its full cost.
    session.request_count == session.requests.len() as u64
}

fn historical_cost(session: &ProxySessionState, costs: &Costs) -> Option<f64> {
    if !complete_history(session) {
        return None;
    }
    let mut total = 0.0;
    for request in &session.requests {
        let Some(usage) = request.usage.as_ref() else {
            continue;
        };
        if usage.input_tokens.is_none() && usage.output_tokens.is_none() {
            continue;
        }
        let entry = TokenUsageEntry {
            id: String::new(),
            ts: request.started_at,
            provider: session.provider.clone().unwrap_or_default(),
            provider_id: None,
            account_id: None,
            account_email: None,
            model: request.model.clone()?,
            service_tier: request.service_tier.map(|tier| tier.as_str().to_owned()),
            duration_ms: request.response_time_ms,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            reasoning_tokens: usage.reasoning_tokens,
            cached_tokens: usage.cached_tokens,
            total_tokens: usage.total_tokens,
            model_context_window: None,
        };
        total += costs.estimate(&entry);
    }
    Some(total)
}

#[cfg(test)]
#[path = "tests/session_cost.rs"]
mod tests;
