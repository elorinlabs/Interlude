import type { Model, ThreadTokenUsage } from '../client/types';
import type { ComposerSettings } from '../composer';
import type { GuiAccountsClient } from '../guiAccounts';

export const settingsModels: Model[] = [{
  id: 'gpt-6-astra', model: 'gpt-6-astra', displayName: 'GPT-6-Astra', isDefault: true,
  defaultReasoningEffort: 'xhigh', supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
    .map(reasoningEffort => ({ reasoningEffort, description: '' })),
}];
// A long picker exercises scrolling and pull-to-dismiss without changing the selected model preview.
settingsModels.push(...Array.from({ length: 24 }, (_, index) => ({
  ...settingsModels[0], id: `preview-${index}`, model: `preview-${index}`,
  displayName: `Preview ${index + 1}`, isDefault: false,
})));
export const initialSettings: ComposerSettings = {
  model: 'gpt-6-astra', effort: 'xhigh', speed: 'normal', access: 'danger-full-access',
};
const accounts: GuiAccountsClient = {
  read: async () => ({ running: true, selection: { kind: 'account', id: 'preview' }, choices: [{
    kind: 'account', id: 'preview', name: 'preview@example.com', detail: '', available: true,
  }] }),
  select: async selection => selection,
  subscribe: () => () => {},
};
export const settingsFixture = {
  models: settingsModels, ready: true, saving: false, error: '', threadId: 'settings-preview',
  contextSettings: { read: async () => ({ capacity: null }), write: async () => ({ capacity: null }) },
  refreshModels: async () => {},
  connection: { client: accounts, deviceName: 'ZH', chooseDevice: () => {} },
  readUsage: async () => ({ totalTokens: 437_770_000, estimatedCostUsd: 640.61, primaryRemainingPercent: 78 }),
  readConversationMetrics: async () => ({ totalOutputTokens: 0, totalOutputTimeMs: 0, outputRequestCount: 0 }),
  tokenUsage: {
    total: { totalTokens: 24_980_000 }, last: { totalTokens: 244_900 }, modelContextWindow: 258_400,
  } satisfies ThreadTokenUsage,
};
