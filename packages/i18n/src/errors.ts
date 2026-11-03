import { createTextErrorFormatter, safeString, type ErrorDictionaries } from './errorText';
import type { Language } from './registry';
import { createI18n } from './engine';
import type { Resources, TranslationValues } from './messages';

export interface DisplayError {
  code: string;
  params?: TranslationValues;
  message?: string;
}

function structuredText(message: string): DisplayError | undefined {
  if (!message.startsWith('{')) return;
  try {
    const value: unknown = JSON.parse(message);
    if (!value || typeof value !== 'object' || !('code' in value) || typeof value.code !== 'string') return;
    const params = 'params' in value ? value.params : undefined;
    if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params)
      || Object.values(params).some(item => typeof item !== 'string' && typeof item !== 'number'))) return;
    return { code: value.code, params: params as TranslationValues | undefined };
  } catch { return; }
}

/** Decode text responses at the transport boundary; application copy uses semantic keys directly. */
export function createErrorFormatter(resources: Resources, templateKeys?: readonly string[]) {
  const engine = createI18n({ locale: 'zh', resources });
  const sources = resources.zh ?? {};
  const dictionaries: ErrorDictionaries = {};
  for (const language of Object.keys(resources) as Language[]) {
    if (language === 'zh') continue;
    const exact: Record<string, string> = {};
    const templates: Record<string, string> = {};
    for (const [key, source] of Object.entries(sources)) {
      if (typeof source !== 'string') continue;
      exact[source] = engine.text(key, {}, language);
      if (!templateKeys || templateKeys.includes(key)) templates[source] = exact[source];
    }
    dictionaries[language] = { exact, templates };
  }
  const decodeText = createTextErrorFormatter(dictionaries);
  return (language: Language, error: unknown): string => {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      const display = error as DisplayError;
      if (Object.hasOwn(sources, display.code)) return engine.text(display.code, display.params, language);
      return decodeText(language, display.message ?? display.code);
    }
    const message = error instanceof Error ? error.message : safeString(error);
    // Tauri and remote chat both transport safe errors as strings. Decode only known semantic keys.
    const structured = structuredText(message);
    if (structured && typeof sources[structured.code] === 'string' && Object.hasOwn(sources, structured.code)) {
      return engine.text(structured.code, structured.params, language);
    }
    if (Object.hasOwn(sources, message)) return engine.text(message, {}, language);
    return decodeText(language, message);
  };
}
