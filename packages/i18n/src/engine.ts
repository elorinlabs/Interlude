import { fallbackChain, isLanguage, type Language } from './registry';
import { formatDate, formatNumber, type DateInput } from './format';
import { interpolate, ownMessage, renderMessage } from './messages';
import type { Messages, ResourceLoader, Resources, TranslationValues } from './messages';
import type { MessageKey, MessageParams } from './generated/messages';

export type TranslateArgs<K extends MessageKey> = MessageParams[K] extends Record<string, never>
  ? [values?: MessageParams[K]] : [values: MessageParams[K]];
export type Translate = <K extends MessageKey>(key: K, ...args: TranslateArgs<K>) => string;

export interface I18nOptions {
  locale: Language;
  enabledLanguages?: readonly Language[];
  fallbackLocale?: Language;
  resources?: Resources;
  loadResource?: ResourceLoader;
}

/** Each request or application owns its instance, including resources and subscriptions. */
export function createI18n(options: I18nOptions) {
  const enabled = [...(options.enabledLanguages ?? [options.locale])];
  const assertEnabled = (value: Language) => {
    if (!isLanguage(value) || !enabled.includes(value)) throw new RangeError(`Language is not enabled: ${value}`);
  };
  assertEnabled(options.locale);
  let locale = options.locale;
  let revision = 0;
  const listeners = new Set<() => void>();
  const resources: Resources = {};
  for (const [id, messages] of Object.entries(options.resources ?? {})) resources[id as Language] = { ...messages };
  const notify = () => { revision += 1; listeners.forEach(listener => listener()); };
  const text = (key: string, values: TranslationValues = {}, language = locale): string => {
    for (const candidate of fallbackChain(language, options.fallbackLocale)) {
      const message = ownMessage(resources[candidate], key);
      if (message !== undefined) return renderMessage(message, candidate, values);
    }
    return interpolate(key, values);
  };
  const addResources = (language: Language, messages: Messages) => {
    resources[language] = { ...resources[language], ...messages };
    notify();
  };
  return {
    t: text as Translate, text,
    getLocale: () => locale,
    getSnapshot: () => revision,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setLocale(next: Language) { assertEnabled(next); if (locale !== next) { locale = next; notify(); } },
    addResources,
    load: createLoader({ loadResource: options.loadResource, addResources, fallback: options.fallbackLocale }),
    formatDate: (value: DateInput, settings?: Intl.DateTimeFormatOptions) => formatDate(locale, value, settings),
    formatNumber: (value: number, settings?: Intl.NumberFormatOptions) => formatNumber(locale, value, settings),
  };
}

type LoaderOptions = Pick<I18nOptions, 'loadResource'> & {
  fallback?: Language;
  addResources: (language: Language, messages: Messages) => void;
};

/** Cache per instance; failures are evicted so an offline client can retry. Loading never changes locale. */
function createLoader(options: LoaderOptions) {
  const pending = new Map<string, Promise<void>>();
  const loadOne = (language: Language, module: string): Promise<void> => {
    const key = `${language}/${module}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(async () => {
      const messages = await options.loadResource?.(language, module);
      if (messages) options.addResources(language, messages);
    }).catch(error => { pending.delete(key); throw error; });
    pending.set(key, request);
    return request;
  };
  return async (language: Language, modules: readonly string[]): Promise<void> => {
    if (!options.loadResource) throw new Error('No resource loader configured');
    await Promise.all(fallbackChain(language, options.fallback).flatMap(id => modules.map(module => loadOne(id, module))));
  };
}

export type I18n = ReturnType<typeof createI18n>;
