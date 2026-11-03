import { CONTEXT_READ_OPERATION, CONTEXT_WRITE_OPERATION, type ContextSettingsApi } from '../contextSettings';

export function createContextSettingsClient(request: <T>(body: unknown) => Promise<T>): ContextSettingsApi {
  return {
    read: (threadId) => request({ operation: CONTEXT_READ_OPERATION, threadId }),
    write: (threadId, settings) => request({ operation: CONTEXT_WRITE_OPERATION, threadId, settings }),
  };
}
