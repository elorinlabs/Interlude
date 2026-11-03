import { localeForLanguage, type Language } from './registry';

export type TranslationValues = Readonly<Record<string, string | number>>;
export type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule | `=${number}`, string>> & { other: string }>;
export type Message = string | PluralMessage;
export type Messages = Readonly<Record<string, Message>>;
export type Resources = Partial<Record<Language, Messages>>;
export type ResourceLoader = (language: Language, module: string) => Promise<Messages | undefined>;

/** One pass preserves braces and replacement tokens inside user-supplied values. */
export function interpolate(template: string, values: TranslationValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}

export function renderMessage(message: Message, language: Language, values: TranslationValues = {}): string {
  if (typeof message === 'string') return interpolate(message, values);
  const count = values.count;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new TypeError('Plural messages require a finite numeric count');
  }
  const category = new Intl.PluralRules(localeForLanguage(language)).select(count);
  return interpolate(message[`=${count}`] ?? message[category] ?? message.other, values);
}

export function ownMessage(messages: Messages | undefined, key: string): Message | undefined {
  return messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
}
