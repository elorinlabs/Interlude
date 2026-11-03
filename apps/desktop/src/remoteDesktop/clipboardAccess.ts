export const CLIPBOARD_ACCESS_ERROR = '无法访问剪贴板，请重新复制后再试。';
const RETRY_DELAY_MS = 60;
const MAX_ATTEMPTS = 3;

export async function withClipboardRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      // Retry brief OS clipboard locks, never the remote copy/cut gesture itself.
      const message = error instanceof Error ? error.message : error;
      if (message !== CLIPBOARD_ACCESS_ERROR || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
