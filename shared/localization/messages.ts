import { createI18n, type MessageKey, type TranslationValues } from '@interlude/i18n';
import { resources } from '@interlude/i18n/client';
import type { Language } from './language';
import { getInterfaceLanguage } from './interfaceLanguage';

export { interpolate } from '@interlude/i18n';
export type { MessageKey, TranslationValues } from '@interlude/i18n';

// This client bundle owns its resources. Locale and persistence remain with each application.
const messages = createI18n({ locale: 'zh', resources });

export function translateMessage(language: Language, key: MessageKey, values?: TranslationValues): string {
  return messages.text(key, values, language);
}

export type MessageTranslator = (key: MessageKey, values?: TranslationValues) => string;

/** Presentation models may contain keys or already formatted user text. Only keys are looked up. */
export function displayText(value: string, values?: TranslationValues, language = getInterfaceLanguage()): string {
  return messages.text(value, values, language);
}

export const defaultText = (value: string, values?: TranslationValues) => messages.text(value, values, 'zh');
