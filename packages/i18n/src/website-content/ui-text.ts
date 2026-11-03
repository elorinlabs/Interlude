import { applications, languageOptions } from '@interlude/i18n';
import type { Language } from './types';
import resources from './ui-text-resources.json';
import japanese from './ja/ui.json';

export type UiTextKey = keyof typeof resources.en;
const uiText = { ...resources, ja: japanese } satisfies Record<Language, Record<UiTextKey, string>>;

/** Returns the interface string for the page language, filling placeholders once. */
export function ui(language: Language, key: UiTextKey, values: Record<string, string> = {}) {
  return uiText[language][key].replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

/** Keep the established compact EN/RU labels; language names come from the registry. */
export const languageLabels: Record<Language, string> = { zh: '中文', en: 'EN', ru: 'RU', ja: '日本語' };
export const languageNames = Object.fromEntries(languageOptions(applications.website)
  .map(option => [option.value, option.label])) as Record<Language, string>;
