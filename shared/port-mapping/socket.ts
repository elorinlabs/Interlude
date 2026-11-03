import type { ForwardingClient } from './service';
import { MAPPING_UPDATE_REQUIRED } from './errors';

export interface MappingRead { data: Uint8Array; eof: boolean }
export interface MappingSocket {
  read(): Promise<MappingRead>;
  write(bytes: Uint8Array): Promise<void>;
  end?(): Promise<void>;
  close(): void;
}
export interface MappingSocketOptions { nativeSocketId?: number }
export type MappingSocketFactory = (resource: string, url: string,
  options?: MappingSocketOptions) => Promise<MappingSocket>;

/** Port mappings require the encrypted byte stream on both peers. */
export async function openMappingSocket(client: ForwardingClient, resource: string, url: string,
  options: MappingSocketOptions & { signal?: AbortSignal } = {}): Promise<MappingSocket> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (!client.stream) throw new Error(MAPPING_UPDATE_REQUIRED);
  const opened = client.stream(resource, url, options);
  if (!signal) return opened;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Mapping request cancelled'));
    signal.addEventListener('abort', abort, { once: true });
    void opened.then(socket => {
      if (signal.aborted) { socket.close(); abort(); } else resolve(socket);
    }, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
