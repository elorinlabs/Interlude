import type { DictationClient } from '../chat/dictation/client';
import { audioBase64 } from '../chat/dictation/recording';

export const DICTATION_OPERATION = 'dictation';
// The host may refresh credentials and retry a 60-second transcription request once.
export const DICTATION_TIMEOUT_MS = 150_000;

export function createRemoteDictationClient(options: {
  request: <T>(body: unknown) => Promise<T>;
  subscribeAccountChange: DictationClient['subscribeAccountChange'];
}): DictationClient {
  return {
    prepare: () => options.request({ operation: DICTATION_OPERATION, action: 'prepare' }),
    cancel: sessionId => options.request({ operation: DICTATION_OPERATION, action: 'cancel', sessionId }),
    transcribe: async (sessionId, audio) => options.request({ operation: DICTATION_OPERATION,
      action: 'transcribe', sessionId, data: await audioBase64(audio), mimeType: audio.type }),
    subscribeAccountChange: options.subscribeAccountChange,
  };
}
