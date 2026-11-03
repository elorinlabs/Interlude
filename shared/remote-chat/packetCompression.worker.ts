import { MAX_PACKET_PLAIN_BYTES } from './packetCompression';

interface Request { id: number; action: 'compress' | 'decompress'; bytes: Uint8Array; length?: number }
const DECODE_INPUT_CHUNK_BYTES = 256;
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (value: object, transfer?: Transferable[]) => void;
};

async function transform(request: Request) {
  const { action, bytes, length } = request;
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PACKET_PLAIN_BYTES
    || (action !== 'compress' && action !== 'decompress')) throw new Error('Invalid packet');
  const limit = action === 'compress' ? MAX_PACKET_PLAIN_BYTES + 128 : length;
  if (!Number.isSafeInteger(limit) || !limit || limit < 1
    || (action === 'decompress' && limit > MAX_PACKET_PLAIN_BYTES)) throw new Error('Invalid packet length');
  // Both transforms are browser-native implementations. No JavaScript compression library is bundled.
  const codec = action === 'compress' ? new CompressionStream('deflate-raw')
    : new DecompressionStream('deflate-raw');
  // Feed bounded pieces so native expansion can be cancelled between input chunks.
  let inputOffset = 0;
  const chunkSize = action === 'compress' ? MAX_PACKET_PLAIN_BYTES : DECODE_INPUT_CHUNK_BYTES;
  const input = new ReadableStream<Uint8Array>({ pull(controller) {
    if (inputOffset === bytes.length) { controller.close(); return; }
    const end = Math.min(inputOffset + chunkSize, bytes.length);
    controller.enqueue(bytes.subarray(inputOffset, end)); inputOffset = end;
  } });
  const reader = input.pipeThrough(codec).getReader();
  const output = new Uint8Array(limit);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > limit) throw new Error('Packet output too large');
      output.set(value, offset); offset += value.length;
    }
    if (action === 'decompress' && offset !== length) throw new Error('Invalid decompressed length');
    return output.slice(0, offset);
  } finally { await reader.cancel(); reader.releaseLock(); }
}

worker.onmessage = ({ data }) => {
  void transform(data).then(bytes => worker.postMessage({ id: data.id, bytes }, [bytes.buffer]))
    .catch(() => worker.postMessage({ id: data.id, error: true }));
};
