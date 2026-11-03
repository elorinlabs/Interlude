import catalog from "../data/tokenCostPresets.json";
import { isValidLongContextThreshold, type TokenCostPreset } from "../../../../shared/token-cost-presets";
import { findTokenCostPreset, referenceTokenCostPreset } from "./tokenCostPresets";

export interface LongContextCostSettings {
  enabled: boolean;
  thresholdTokens: number;
  inputMultiplier: number;
  cachedInputMultiplier: number;
  outputMultiplier: number;
}

export const DEFAULT_LONG_CONTEXT_COST_SETTINGS: Readonly<LongContextCostSettings> = Object.freeze(
  { ...catalog.defaultLongContextCostSettings },
);
export const MAX_LONG_CONTEXT_THRESHOLD_TOKENS = catalog.maxLongContextThresholdTokens;
export const MAX_LONG_CONTEXT_COST_MULTIPLIER = catalog.maxLongContextCostMultiplier;
export const LONG_CONTEXT_COST_STORAGE_KEY = "codex-switch:long-context-cost-settings";
export const LONG_CONTEXT_COST_EVENT = "codex-switch:long-context-cost-settings-changed";
export const MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY = "codex-switch:model-long-context-thresholds";

export function isValidLongContextCostSettings(value: unknown): value is LongContextCostSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Partial<LongContextCostSettings>;
  return typeof settings.enabled === "boolean"
    && isValidLongContextThreshold(settings.thresholdTokens)
    && [settings.inputMultiplier, settings.cachedInputMultiplier, settings.outputMultiplier].every(
      (multiplier) => typeof multiplier === "number" && Number.isFinite(multiplier)
        && multiplier > 0 && multiplier <= MAX_LONG_CONTEXT_COST_MULTIPLIER,
    );
}

export function loadLongContextCostSettings(): LongContextCostSettings {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LONG_CONTEXT_COST_STORAGE_KEY) ?? "null");
    return isValidLongContextCostSettings(value) ? value : { ...DEFAULT_LONG_CONTEXT_COST_SETTINGS };
  } catch {
    return { ...DEFAULT_LONG_CONTEXT_COST_SETTINGS };
  }
}

export function saveLongContextCostSettings(settings: LongContextCostSettings) {
  if (!isValidLongContextCostSettings(settings)) return;
  window.localStorage.setItem(LONG_CONTEXT_COST_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(LONG_CONTEXT_COST_EVENT));
}

export function loadModelLongContextThresholds(): Record<string, number | null> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([model, threshold]) => model.length > 0
      && model.length <= 128 && (threshold === null || isValidLongContextThreshold(threshold))));
  } catch { return {}; }
}

export function modelLongContextThresholdOverride(model: string): number | null {
  const overrides = loadModelLongContextThresholds();
  if (Object.hasOwn(overrides, model)) return overrides[model];
  // Older versions stored the default even when only a multiplier changed.
  const legacy = loadLongContextCostSettings().thresholdTokens;
  return legacy === DEFAULT_LONG_CONTEXT_COST_SETTINGS.thresholdTokens ? null : legacy;
}

export function saveModelLongContextThreshold(model: string, threshold: number | null) {
  const preset = findTokenCostPreset(model);
  if (!preset || (threshold !== null && !isValidLongContextThreshold(threshold))) return;
  const overrides = { ...loadModelLongContextThresholds(), [preset.model]: threshold };
  window.localStorage.setItem(MODEL_LONG_CONTEXT_THRESHOLD_STORAGE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent(LONG_CONTEXT_COST_EVENT));
}

export function presetLongContextThreshold(preset: TokenCostPreset): number {
  return preset.longContextThresholdTokens ?? DEFAULT_LONG_CONTEXT_COST_SETTINGS.thresholdTokens;
}

export function longContextMultipliersForEntry(model: string, inputTokens: number) {
  const settings = loadLongContextCostSettings();
  const preset = findTokenCostPreset(model) ?? referenceTokenCostPreset();
  // The threshold includes cached input and applies to the full request, not only the excess tokens.
  const longContext = settings.enabled && preset.longContextPricing
    && Number.isFinite(inputTokens)
    && inputTokens > (modelLongContextThresholdOverride(preset.model) ?? presetLongContextThreshold(preset));
  return {
    input: longContext ? settings.inputMultiplier : 1,
    cachedInput: longContext ? settings.cachedInputMultiplier : 1,
    output: longContext ? settings.outputMultiplier : 1,
  };
}
