import { resources as translations } from '@interlude/i18n/desktop';
import { applications, createI18n, isAppLanguage, languageOptions, localeForLanguage } from '@interlude/i18n';
import { DEFAULT_LANGUAGE } from "../../../shared/localization/language";
export { DEFAULT_LANGUAGE, systemLanguage as defaultLanguage } from "../../../shared/localization/language";

export const LANGUAGE_STORAGE_KEY = "codex-switch:language";

export const LANGUAGE_OPTIONS = languageOptions(applications.desktop, true);

export type Language = (typeof LANGUAGE_OPTIONS)[number]["value"];

const engine = createI18n({ locale: DEFAULT_LANGUAGE, resources: translations });

export type TranslationKey = keyof typeof translations.en;
export type TranslationValues = Record<string, string | number>;
export type Translate = (key: TranslationKey, values?: TranslationValues) => string;

export function isLanguage(value: unknown): value is Language {
  return isAppLanguage('desktop', value);
}

export function getLocale(language: Language) {
  return localeForLanguage(language);
}

export function translate(language: Language, key: TranslationKey, values: TranslationValues = {}) {
  return engine.text(key, values, language);
}
