import { applications, isEnabledLanguage, languageOptions, resolveLanguage, type EnabledLanguage } from '@interlude/i18n';

/** Client adapters accept released languages; selectors and persistence validate each application policy. */
export type Language = EnabledLanguage;
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_OPTIONS = languageOptions(applications.native);
export { languageLabel, localeForLanguage } from '@interlude/i18n';
export const isLanguage = isEnabledLanguage;

/** Use Chinese only in a Chinese locale; all other locales fall back to English. */
export function systemLanguage(locale: string): Language {
  return resolveLanguage(locale) === 'zh' ? 'zh' : DEFAULT_LANGUAGE;
}

type DesktopLocaleGlobal = typeof globalThis & { __REMOTE_AI_SYSTEM_LOCALE__?: string };

/** Linux supplies its message locale before rendering; other clients use native locale APIs. */
export function deviceLanguage(): Language {
  try {
    const desktopLocale = (globalThis as DesktopLocaleGlobal).__REMOTE_AI_SYSTEM_LOCALE__;
    const locale = desktopLocale || globalThis.navigator?.language || Intl.DateTimeFormat().resolvedOptions().locale;
    return systemLanguage(locale);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
