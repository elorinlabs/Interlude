import { CLIPBOARD_CHUNK_BYTES, MAX_CLIPBOARD_BYTES, MAX_CLIPBOARD_FILES, decodeClipboardBytes,
  encodeClipboardBytes, type ClipboardContent, type ClipboardRequest, type ClipboardReply } from './clipboard';

export interface FileOffer { id: string; files: { name: string; size: number }[] }
export interface FileRead { offerId: string; index: number; offset: number; length: number }
export interface FileReadEvent extends FileRead { kind: 'clipboardFileRead'; requestId: string }
export type FileRequest = { action: 'publish'; offer: FileOffer; paste: boolean; expectedRevision?: string }
  | { action: 'chunk'; request: FileRead } | { action: 'reply'; requestId: string; data?: string }
  | { action: 'release' };
export interface LocalFileClipboard {
  read(): Promise<ClipboardContent>;
  chunk(request: FileRead): Promise<string>;
  publish(offer: FileOffer, read: (request: FileRead) => Promise<string>): Promise<void>;
  close(): void;
}

export function validFileOffer(value: unknown): value is FileOffer {
  const offer = value as Partial<FileOffer> | undefined;
  return !!offer && typeof offer.id === 'string' && /^[0-9a-f-]{36}$/i.test(offer.id)
    && Array.isArray(offer.files) && offer.files.length > 0 && offer.files.length <= MAX_CLIPBOARD_FILES
    && offer.files.every(file => typeof file?.name === 'string' && file.name.length > 0 && file.name.length <= 240
      && Number.isSafeInteger(file.size) && file.size >= 0)
    && offer.files.reduce((size, file) => size + file.size, 0) <= MAX_CLIPBOARD_BYTES;
}

type Request = (id: string, request: ClipboardRequest) => Promise<NonNullable<ClipboardReply['result']>>;
type Source = { offer: FileOffer; read: (request: FileRead) => Promise<string> };

async function readSource(source: Source, request: FileRead) {
  const file = source.offer.files[request.index];
  if (!file || !Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset > file.size
    || !Number.isSafeInteger(request.length) || request.length < 1 || request.length > CLIPBOARD_CHUNK_BYTES) {
    throw new Error('文件信息无效，请重新复制。');
  }
  const data = await source.read(request);
  if (decodeClipboardBytes(data).length !== Math.min(request.length, file.size - request.offset)) {
    throw new Error('文件传输失败，请重新复制。');
  }
  return data;
}

/** Shell reads use separate requests so a copy gesture cannot deadlock a pending file read. */
export class DesktopFileClipboard {
  private sources = new Map<string, Source>();
  constructor(private readonly request: Request) {}
  register(offer: FileOffer, read: Source['read']) {
    if (!validFileOffer(offer)) throw new Error('文件信息无效，请重新复制。');
    this.sources.clear(); this.sources.set(offer.id, { offer, read });
  }
  async receive(event: FileReadEvent) {
    let data: string | undefined;
    try {
      const source = this.sources.get(event.offerId);
      if (!source) throw new Error('文件信息无效，请重新复制。');
      data = await readSource(source, event);
    } catch { /* Return failed reads to Explorer instead of creating a successful empty file. */ }
    await this.request('files', { action: 'files', request: { action: 'reply', requestId: event.requestId, data } })
      .catch(() => undefined); // Disconnection already cancels the native reader.
  }
  async read(request: FileRead) {
    // Reading back an unchanged promise we originally sent must use its source, not loop through the host.
    const source = this.sources.get(request.offerId);
    if (source) return readSource(source, request);
    const result = await this.request('files', { action: 'files', request: { action: 'chunk', request } });
    if (typeof result.data !== 'string') throw new Error('文件传输失败，请重新复制。');
    return result.data;
  }
  async publish(offer: FileOffer, paste: boolean, expectedRevision?: string) {
    await this.request('files', { action: 'files', request: { action: 'publish', offer, paste, expectedRevision } });
  }
  async writeFiles(content: Extract<ClipboardContent, { format: 'files' }>, paste: boolean, revision?: string) {
    const bytes = content.files.map(file => decodeClipboardBytes(file.data));
    const offer = { id: crypto.randomUUID(), files: content.files.map((file, index) => ({
      name: file.name, size: bytes[index].length,
    })) };
    this.register(offer, async request => encodeClipboardBytes(bytes[request.index]
      .subarray(request.offset, request.offset + request.length)));
    await this.publish(offer, paste, revision);
  }
  close() { this.sources.clear(); }
}
