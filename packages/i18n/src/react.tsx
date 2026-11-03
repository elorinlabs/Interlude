import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { I18n, Translate } from './engine';

const Context = createContext<I18n | undefined>(undefined);

export function I18nProvider({ instance, children }: { instance: I18n; children: ReactNode }) {
  return <Context.Provider value={instance}>{children}</Context.Provider>;
}

export { I18nProvider as Provider };

export function useI18n(): I18n {
  const instance = useContext(Context);
  if (!instance) throw new Error('An I18nProvider is required');
  return instance;
}

export function useLocale() {
  const instance = useI18n();
  return useSyncExternalStore(instance.subscribe, instance.getLocale, instance.getLocale);
}

/** Resource loads also refresh consumers, even when the selected language does not change. */
export function useT(): Translate {
  const instance = useI18n();
  const revision = useSyncExternalStore(instance.subscribe, instance.getSnapshot, instance.getSnapshot);
  const language = instance.getLocale();
  return useMemo(() => ((key, values) => instance.text(key, values, language)) as Translate,
    [instance, language, revision]);
}
