import { Channel, invoke } from "@tauri-apps/api/core";
import { sshApi, attachSsh, closeSsh } from './sshApi';

import type { TerminalSize, TerminalInfo, TerminalEvent, TerminalLaunchOptions } from '../../../../../../shared/terminal/types';
export type { TerminalSize, TerminalInfo, TerminalEvent, TerminalApi } from '../../../../../../shared/terminal/types';

export const terminalApi = {
  ssh: sshApi,
  attach: (info: TerminalInfo, _size: TerminalSize, onEvent: (event: TerminalEvent) => void) => attachSsh(info, onEvent),
  open(cwd: string, size: TerminalSize, onEvent: (event: TerminalEvent) => void, options?: TerminalLaunchOptions) {
    const onEventChannel = new Channel<TerminalEvent>();
    onEventChannel.onmessage = onEvent;
    return invoke<TerminalInfo>("codex_gui_terminal_open", {
      request: { cwd: cwd || null, size, ...options }, onEvent: onEventChannel,
    });
  },
  write: (id: string, data: string) => invoke<void>(commandName(id), {
    request: { type: "write", id, data },
  }),
  writeBinary: (id: string, data: number[]) => invoke<void>('codex_gui_ssh_command', {
    request: { type: 'writeBinary', id, data },
  }),
  outputFlow: (id: string, enabled: boolean) => invoke<void>('codex_gui_ssh_command', {
    request: { type: 'outputFlow', id, enabled },
  }),
  outputAck: (id: string, bytes: number) => invoke<void>('codex_gui_ssh_command', {
    request: { type: 'outputAck', id, bytes },
  }),
  resize: (id: string, size: TerminalSize) => invoke<void>(commandName(id), {
    request: { type: "resize", id, size },
  }),
  close: (id: string) => id.startsWith('ssh-') ? closeSsh(id)
    : invoke<void>("codex_gui_terminal_command", { request: { type: "close", id } }),
};

const commandName = (id: string) => id.startsWith('ssh-') ? 'codex_gui_ssh_command' : 'codex_gui_terminal_command';
