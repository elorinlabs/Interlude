import type { Model, Settings } from "./types";

export type ModelSelection = Pick<Settings, "model" | "effort">;

/** Fill unspecified defaults without replacing a conversation's explicit choice. */
export function resolveModelSelection(models: Model[], selection: ModelSelection): ModelSelection {
  const selected = models.find((entry) => entry.model === selection.model);
  if (selection.model && !selected) return { model: selection.model, effort: selection.effort };
  const target = selected ?? models.find((entry) => entry.isDefault) ?? models[0];
  if (!target) return { model: selection.model, effort: selection.effort };
  const efforts = target.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
  const preferred = target.defaultReasoningEffort;
  const defaultEffort = preferred && (!efforts.length || efforts.includes(preferred))
    ? preferred : efforts.at(-1) ?? "none";
  const effort = selection.effort || defaultEffort;
  return { model: target.model, effort };
}

/** Shared by pickers and send paths so an unavailable selection never silently changes. */
export function modelSelectionError(models: Model[], selection: ModelSelection) {
  const resolved = resolveModelSelection(models, selection);
  const selected = models.find(entry => entry.model === resolved.model);
  if (!selected) return "client.chat.modelUnavailableForAccount" as const;
  const efforts = selected.supportedReasoningEfforts.map(entry => entry.reasoningEffort);
  const supported = efforts.length ? efforts.includes(resolved.effort)
    : resolved.effort === resolveModelSelection([selected], { model: selected.model, effort: "" }).effort;
  return supported ? null : "client.chat.effortUnavailableForAccount" as const;
}
