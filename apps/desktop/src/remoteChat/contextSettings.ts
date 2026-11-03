import { invoke } from '../api/backend';
import { composerThreadId } from '../../../../shared/remote-chat/composer';
import { CONTEXT_READ_OPERATION, CONTEXT_WRITE_OPERATION,
  type ContextSettings } from '../../../../shared/remote-chat/contextSettings';

/** Forward only scoped capacity commands; Rust validates the complete settings DTO before writing. */
export function contextSettingsRequest(body: Record<string, unknown>): Promise<ContextSettings> {
  const threadId = composerThreadId(body.threadId);
  if (!threadId) throw new Error('请先选择一个对话。');
  if (body.operation === CONTEXT_READ_OPERATION) return invoke('codex_gui_context_settings', { threadId });
  if (body.operation === CONTEXT_WRITE_OPERATION) {
    return invoke('codex_gui_set_context_settings', { threadId, settings: body.settings });
  }
  throw new Error('当前手机端暂不支持此操作。');
}
