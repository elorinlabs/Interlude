/** Recording stays on the viewing device; adapters choose the transcription host. */
export interface DictationClient {
  prepare: () => Promise<{ sessionId: string }>;
  transcribe: (sessionId: string, audio: Blob) => Promise<{ text: string }>;
  cancel: (sessionId: string) => Promise<void>;
  subscribeAccountChange: (changed: () => void) => (() => void) | Promise<() => void>;
}
