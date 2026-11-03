import { concatBytes, MAX_HTTP_BYTES, type MappingHttpResponse } from './http';

const MAX_HEADER_BYTES = 64 * 1024;
const decoder = new TextDecoder();
type State = 'headers' | 'length' | 'chunkSize' | 'chunkData' | 'chunkEnd' | 'trailers' | 'close' | 'complete';

/** Consume framing once and collect body slices; a large reply must not be copied after every network read. */
export class HttpResponseReader {
  private buffer: Uint8Array = new Uint8Array();
  private readonly body: Uint8Array[] = [];
  private size = 0;
  private remaining = 0;
  private received = 0;
  private metadataBytes = 0;
  private persistent = false;
  private state: State = 'headers';
  private head?: { status: number; headers: [string, string][] };
  constructor(private readonly method = 'GET') {}
  get reusable() { return this.persistent && this.state === 'complete' && !this.buffer.length; }
  get receivedBytes() { return this.received; }

  push(bytes: Uint8Array, eof: boolean): Omit<MappingHttpResponse, 'url'> | undefined {
    this.received += bytes.length;
    if (this.received > MAX_HTTP_BYTES) throw new Error('Response too large');
    this.buffer = this.buffer.length ? concatBytes(this.buffer, bytes) : bytes;
    while (this.step()) { /* Each step consumes bytes or advances framing state. */ }
    if (eof) {
      this.persistent = false;
      if (this.state === 'close') this.state = 'complete';
      if (this.state !== 'complete') throw new Error('Truncated response');
    }
    if (this.state !== 'complete') return;
    const body = new Uint8Array(this.size);
    let offset = 0;
    for (const part of this.body) { body.set(part, offset); offset += part.length; }
    return { ...this.head!, body };
  }

  private step(): boolean {
    switch (this.state) {
      case 'headers': return this.headers();
      case 'chunkSize': return this.chunkSize();
      case 'trailers': return this.trailer();
      case 'chunkEnd': return this.chunkEnd();
      case 'length': case 'chunkData': return this.payload();
      case 'close': if (this.buffer.length) this.append(this.buffer.length); return false;
      case 'complete': return false;
    }
  }

  private headers() {
    const end = boundary(this.buffer, true);
    if (end < 0) { this.checkMetadata(this.buffer.length); return false; }
    this.metadataBytes += end + 4; this.checkMetadata(0);
    const [statusLine, ...lines] = decoder.decode(this.take(end + 4)).slice(0, -4).split('\r\n');
    const status = Number(/^HTTP\/1\.[01] (\d{3})\b/.exec(statusLine)?.[1]);
    if (!status || status < 100 || status > 599) throw new Error('Invalid HTTP response');
    if (status === 101) throw new Error('Unexpected protocol upgrade');
    if (status < 200) return true;
    const headers = lines.map((line): [string, string] => {
      const split = line.indexOf(':');
      if (split <= 0) throw new Error('Invalid HTTP header');
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    });
    this.head = { status, headers };
    const fields = new Headers(headers);
    this.persistent = /^HTTP\/1\.1 /.test(statusLine) && !/\bclose\b/i.test(fields.get('connection') ?? '');
    this.framing(fields, status);
    return true;
  }

  private framing(fields: Headers, status: number) {
    const transfer = fields.get('transfer-encoding');
    const length = fields.get('content-length');
    if (transfer && length !== null) throw new Error('Ambiguous response length');
    if (transfer && transfer.toLowerCase() !== 'chunked') throw new Error('Unsupported transfer encoding');
    if (this.method.toUpperCase() === 'HEAD' || [204, 304].includes(status)) { this.state = 'complete'; return; }
    if (transfer) { this.state = 'chunkSize'; return; }
    if (length === null) { this.persistent = false; this.state = 'close'; return; }
    if (!/^\d+$/.test(length) || Number(length) > MAX_HTTP_BYTES) throw new Error('Invalid response length');
    this.remaining = Number(length);
    this.state = this.remaining ? 'length' : 'complete';
  }

  private chunkSize() {
    const end = boundary(this.buffer);
    if (end < 0) { this.checkMetadata(this.buffer.length); return false; }
    if (end > MAX_HEADER_BYTES) throw new Error('Chunk header too large');
    const field = decoder.decode(this.take(end + 2)).slice(0, -2).split(';')[0];
    if (!/^[\da-f]+$/i.test(field)) throw new Error('Invalid chunk');
    this.remaining = Number.parseInt(field, 16);
    if (this.remaining > MAX_HTTP_BYTES - this.size) throw new Error('Chunk too large');
    this.state = this.remaining ? 'chunkData' : 'trailers';
    return true;
  }

  private payload() {
    if (!this.buffer.length) return false;
    const count = Math.min(this.buffer.length, this.remaining);
    this.append(count); this.remaining -= count;
    if (!this.remaining) this.state = this.state === 'length' ? 'complete' : 'chunkEnd';
    return true;
  }

  private chunkEnd() {
    if (this.buffer.length < 2) return false;
    if (this.buffer[0] !== 13 || this.buffer[1] !== 10) throw new Error('Invalid chunk boundary');
    this.take(2); this.state = 'chunkSize';
    return true;
  }

  private trailer() {
    const end = boundary(this.buffer);
    if (end < 0) { this.checkMetadata(this.buffer.length); return false; }
    this.metadataBytes += end + 2; this.checkMetadata(0);
    const line = decoder.decode(this.take(end + 2)).slice(0, -2);
    if (!line) this.state = 'complete';
    else if (!line.includes(':')) throw new Error('Invalid trailer');
    return true;
  }

  private append(count: number) { this.body.push(this.take(count)); this.size += count; }
  private take(count: number) {
    const result = this.buffer.subarray(0, count);
    this.buffer = this.buffer.subarray(count);
    return result;
  }
  private checkMetadata(pending: number) {
    if (this.metadataBytes + pending > MAX_HEADER_BYTES) throw new Error('Headers too large');
  }
}

function boundary(bytes: Uint8Array, double = false) {
  for (let index = 0; index < bytes.length - (double ? 3 : 1); index++) {
    if (bytes[index] === 13 && bytes[index + 1] === 10
      && (!double || bytes[index + 2] === 13 && bytes[index + 3] === 10)) return index;
  }
  return -1;
}
