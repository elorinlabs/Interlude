import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PromptSuggestionSource } from './nextPromptSuggestion';
import { browserSuggestionStorage, PromptSuggestionCache } from './promptSuggestionCache';

const REQUEST_DELAY_MS = 500;
export function usePromptSuggestion(source: PromptSuggestionSource | undefined, blocked = false) {
  const target = source?.target;
  const key = target ? JSON.stringify([target.threadId, target.sourceTurnId]) : '';
  const serializedTarget = target ? JSON.stringify(target) : '';
  const enabled = Boolean(source?.enabled && !blocked);
  const storage = source?.storage ?? browserSuggestionStorage;
  const scope = source?.scope ?? 'local';
  const cache = useMemo(() => new PromptSuggestionCache(storage, scope), [storage, scope]);
  const [loaded, setLoaded] = useState<PromptSuggestionCache>();
  const [, refresh] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const request = source?.request;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void cache.load().then(() => { if (!cancelled) setLoaded(cache); });
    return () => { cancelled = true; };
  }, [cache]);

  // Keystrokes hide the overlay immediately; changing or clearing the draft restores eligibility.
  useEffect(() => { setDismissed(''); }, [key, blocked]);
  const dismiss = useCallback(() => setDismissed(key), [key]);
  const restore = useCallback(() => setDismissed(''), []);

  useEffect(() => {
    if (!key || !enabled || !request || loaded !== cache) return;
    const timer = setTimeout(() => {
      const target = JSON.parse(serializedTarget) as NonNullable<PromptSuggestionSource['target']>;
      void cache.request(key, target, request).then(() => { if (mounted.current) refresh(value => value + 1); });
    }, REQUEST_DELAY_MS);
    // Already-started work still saves its result, even while a draft or another page is visible.
    return () => clearTimeout(timer);
  }, [cache, loaded, key, serializedTarget, enabled, request]);

  const visible = (source?.visible ?? source?.enabled) && !blocked && dismissed !== key;
  return { text: visible && loaded === cache ? cache.get(key) : '', dismiss, restore };
}
