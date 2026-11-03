import { applications, languages } from './generated/languages';

export { applications, languages };
export type Language = (typeof languages)[number]['id'];
export type Application = keyof typeof applications;
export type AppLanguage<A extends Application> = (typeof applications)[A][number];
export type EnabledLanguage = AppLanguage<Application>;
export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return languages.some(language => language.id === value);
}

export function isAppLanguage<A extends Application>(app: A, value: unknown): value is AppLanguage<A> {
  return applications[app].some(language => language === value);
}

/** Compatibility clients share a store inside their own bundle, but retain separate release policies. */
export function isEnabledLanguage(value: unknown): value is EnabledLanguage {
  return Object.values(applications).some(enabled => enabled.some(language => language === value));
}

export function languageInfo(language: Language) {
  const info = languages.find(item => item.id === language);
  if (!info) throw new RangeError(`Unknown language: ${language}`);
  return info;
}

export const localeForLanguage = (language: Language): string => languageInfo(language).locale;
export const languageLabel = (language: Language): string => languageInfo(language).name;

export function languageOptions<L extends Language>(enabled: readonly L[], short = false) {
  return enabled.map(value => ({ value, label: short ? languageInfo(value).shortName : languageLabel(value) }));
}

/** Resolve locale aliases without enabling that language in an application. */
export function resolveLanguage(value: string): Language | undefined {
  const normalized = value.trim().replace(/_/g, '-').split(/[.@]/)[0].toLowerCase();
  const exact = languages.find(item => [item.id, ...item.aliases].some(alias => alias.toLowerCase() === normalized));
  if (exact) return exact.id;
  const base = normalized.split('-')[0];
  return isLanguage(base) ? base : undefined;
}

export function fallbackChain(language: Language, fallback?: Language): Language[] {
  const result: Language[] = [];
  let current: Language | null = language;
  while (current && !result.includes(current)) {
    result.push(current);
    current = languageInfo(current).fallback;
  }
  if (fallback && !result.includes(fallback)) result.push(...fallbackChain(fallback).filter(id => !result.includes(id)));
  return result;
}
