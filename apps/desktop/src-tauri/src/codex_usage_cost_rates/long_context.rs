use super::{
    valid_identifier, CostPreset, CostRate, CostRates, TokenUsageEntry, MAX_RULES, PRESET_CATALOG,
};
use serde::{Deserialize, Serialize};

/// Long-context pricing applies to every token component of an eligible request.
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LongContextCostSettings {
    pub(super) enabled: bool,
    pub(super) threshold_tokens: u64,
    pub(super) input_multiplier: f64,
    pub(super) cached_input_multiplier: f64,
    pub(super) output_multiplier: f64,
}

impl Default for LongContextCostSettings {
    fn default() -> Self {
        PRESET_CATALOG.default_long_context_cost_settings
    }
}

impl LongContextCostSettings {
    pub(super) fn is_valid(&self) -> bool {
        valid_threshold(self.threshold_tokens)
            && [
                self.input_multiplier,
                self.cached_input_multiplier,
                self.output_multiplier,
            ]
            .into_iter()
            .all(|multiplier| {
                multiplier.is_finite()
                    && multiplier > 0.0
                    && multiplier <= PRESET_CATALOG.max_long_context_cost_multiplier
            })
    }

    pub(super) fn adjust_rate(
        &self,
        rate: CostRate,
        entry: &TokenUsageEntry,
        preset: Option<&CostPreset>,
    ) -> CostRate {
        if !self.enabled || entry.input_tokens.unwrap_or(0) <= self.threshold_tokens {
            return rate;
        }
        // Eligibility follows the actual model even when its prices are overridden.
        if !preset.is_some_and(|preset| preset.long_context_pricing) {
            return rate;
        }
        CostRate::new(
            rate.input * self.input_multiplier,
            rate.cached_input * self.cached_input_multiplier,
            rate.output * self.output_multiplier,
        )
    }
}

pub(super) fn valid_threshold(value: u64) -> bool {
    value > 0 && value <= PRESET_CATALOG.max_long_context_threshold_tokens
}

impl CostRates {
    pub(super) fn valid_model_long_context_thresholds(&self) -> bool {
        self.model_long_context_thresholds.len() <= MAX_RULES
            && self
                .model_long_context_thresholds
                .iter()
                .all(|(model, threshold)| {
                    valid_identifier(model) && threshold.is_none_or(valid_threshold)
                })
    }

    pub(super) fn long_context_threshold_for_model(&self, model: &str) -> u64 {
        let preset = self.preset_for_entry(model);
        let default = PRESET_CATALOG
            .default_long_context_cost_settings
            .threshold_tokens;
        let preset_threshold = preset
            .and_then(|preset| preset.long_context_threshold_tokens)
            .unwrap_or(default);
        let custom =
            preset.and_then(|preset| self.model_long_context_thresholds.get(&preset.model));
        match custom {
            Some(Some(threshold)) => *threshold,
            Some(None) => preset_threshold,
            // Preserve older customized global thresholds; the old default follows each model's preset.
            None if self.long_context.threshold_tokens != default => {
                self.long_context.threshold_tokens
            }
            None => preset_threshold,
        }
    }
}
