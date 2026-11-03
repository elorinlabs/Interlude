import type { PreviewLoader } from './kinds';

export const HTML_ASSET_TIMEOUT_MS = 30_000;

/** A peer can ignore cancellation or never reply. Bound the UI wait as well as the transfer signal. */
export function loadHtmlAsset(options: { load: PreviewLoader; path: string; signal: AbortSignal }) {
  return new Promise<Blob>((resolve, reject) => {
    const controller = new AbortController();
    const finish = (error?: unknown, file?: Blob) => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(file!);
    };
    const abort = () => { controller.abort(); finish(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(abort, HTML_ASSET_TIMEOUT_MS);
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) { abort(); return; }
    Promise.resolve().then(() => options.load(options.path, { signal: controller.signal, progress: () => {} }))
      .then(file => finish(undefined, file), error => finish(error));
  });
}
