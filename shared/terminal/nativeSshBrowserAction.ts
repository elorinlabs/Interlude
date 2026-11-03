export type NativeSshBrowserAction =
  | { type: 'ssh'; action: 'navigate'; path: string }
  | { type: 'ssh'; action: 'hidden'; value: boolean }
  | { type: 'ssh'; action: 'upload' };

export function isNativeSshBrowserAction(message: unknown): message is NativeSshBrowserAction {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'ssh'
    || !('action' in message)) return false;
  if (message.action === 'upload') return true;
  if (message.action === 'hidden') return 'value' in message && typeof message.value === 'boolean';
  return message.action === 'navigate' && 'path' in message && typeof message.path === 'string'
    && !!message.path.trim() && message.path.length <= 4096 && !/[\x00-\x1f]/.test(message.path);
}
