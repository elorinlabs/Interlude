import type { GuiToolsClient } from './guiTools';
import type { TerminalApi } from '../terminal/types';
import { readTerminal } from './terminalReader';
import { remoteDevelopmentUrl } from '../terminal/links';
import type { ResolveTerminalLink } from '../terminal/links';

export function remoteTerminalApi(client: Omit<GuiToolsClient['terminal'], 'link' | 'ssh' | 'writeBinary' | 'binaryMode'>
  & { ssh?: GuiToolsClient['terminal']['ssh']; writeBinary?: TerminalApi['writeBinary'];
    binaryMode?: TerminalApi['binaryMode'] },
  resolveLink?: ResolveTerminalLink): TerminalApi {
  const readers = new Map<string, () => void>();
  const leases = new Map<string, string>();
  const attach: NonNullable<TerminalApi['attach']> = async (info, size, onEvent) => {
    readers.get(info.id)?.();
    const stop = readTerminal({ client: {
      read: (id, cursor) => client.read(id, cursor, leases.get(id)),
    }, id: info.id, onEvent });
    readers.set(info.id, stop);
    // Resizing can fail during a reconnect; output polling keeps the attachment alive.
    void client.resize(info.id, size).catch(() => undefined);
    return { ...info, detach: () => {
      stop();
      if (readers.get(info.id) === stop) readers.delete(info.id);
    } };
  };
  const detach = (id: string) => { readers.get(id)?.(); readers.delete(id); };
  return {
    ssh: client.ssh,
    resolveLink: async (id, url) => {
      if (!remoteDevelopmentUrl(url)) return url;
      if (resolveLink) return resolveLink(id, url);
      throw new Error('请在桌面端打开远程电脑的网页。');
    },
    async open(cwd, size, onEvent, options) {
      const info = await client.open(cwd, size, undefined, options);
      return attach(info, size, onEvent);
    },
    attach,
    detach,
    write: client.write,
    writeBinary: client.writeBinary,
    binaryMode: client.binaryMode ? async (id, token, enabled) => {
      if (enabled) leases.set(id, token);
      try { await client.binaryMode!(id, token, enabled); }
      finally { if (!enabled && leases.get(id) === token) leases.delete(id); }
    } : undefined,
    resize: client.resize,
    close: async (id) => { await client.close(id); detach(id); },
  };
}
