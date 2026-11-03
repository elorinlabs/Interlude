import { localeForLanguage, type Language } from './registry';

export type DateInput = Date | number | string;

export function formatDate(language: Language, value: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(localeForLanguage(language), options).format(date);
}

export function formatNumber(language: Language, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeForLanguage(language), options).format(value);
}
