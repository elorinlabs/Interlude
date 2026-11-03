import type { Model } from './client/types';
import { ACCESS_OPTIONS, EFFORT_LABELS, type ComposerSettings } from './composer';

export type SettingField = keyof ComposerSettings;
export const SETTINGS_FIELDS = [
  { field: 'model', label: "client.shared.model", title: "client.shared.chooseModel" },
  { field: 'effort', label: "client.shared.reasoningEffort", title: "client.shared.reasoningEffort" },
  { field: 'speed', label: "client.shared.speedMode", title: "client.shared.chooseSpeedMode" },
  { field: 'access', label: "client.shared.access", title: "client.shared.access" },
] satisfies { field: SettingField; label: string; title: string }[];
export interface SettingOption { value: string; label: string; description?: string }

export function settingOptions(field: SettingField, models: Model[], selection: ComposerSettings): SettingOption[] {
  if (field === 'speed') return [
    { value: 'normal', label: "client.chat.standardMode" },
    { value: 'fast', label: "client.chat.fastMode.6e02d1", description: "client.shared.syncsWithYourComputerAndAppliesToFutureMessages" },
    { value: 'ultrafast', label: "client.chat.ultrafastMode", description: "client.shared.syncsWithYourComputerAndAppliesToFutureMessages" },
  ];
  if (field === 'access') return ACCESS_OPTIONS;
  if (field === 'model') return models.map((model) => ({
    value: model.model, label: model.displayName || model.model,
  }));
  const model = models.find((entry) => entry.model === selection.model);
  return (model?.supportedReasoningEfforts ?? []).map(({ reasoningEffort }) => ({
    value: reasoningEffort, label: EFFORT_LABELS[reasoningEffort] || reasoningEffort,
  }));
}

export function visibleSettingsFields(selection: ComposerSettings) {
  // Older computers do not advertise speed control; avoid offering a setting they cannot save.
  return SETTINGS_FIELDS.filter(({ field }) => field !== 'speed' || selection.speed !== undefined);
}

export function settingValue(field: SettingField, models: Model[], selection: ComposerSettings,
  translate = (value: string) => value) {
  const label = settingOptions(field, models, selection).find((option) => option.value === selection[field])?.label
    || selection[field];
  if (!label) return translate("client.app.syncing");
  return field === 'model' ? label : translate(label);
}

export function settingsNotice({ saving, ready, error }: { saving: boolean; ready: boolean; error: string }) {
  if (error) return error;
  if (!saving || ready) return '';
  return '已保留选择，连接后自动保存。';
}
