import type { ZmodemState } from './zmodem';

export function zmodemMessage(state: ZmodemState) {
  if (state.message) return state.message;
  if (state.phase === 'offer') return state.direction === 'send'
    ? 'client.ssh.zmodemChooseFiles' : 'client.ssh.zmodemReceivePrompt';
  const messages = { transfer: 'client.ssh.zmodemProgress', complete: 'client.ssh.zmodemComplete',
    cancelled: 'client.ssh.zmodemCancelled', error: 'client.ssh.zmodemFailed' };
  return messages[state.phase];
}
