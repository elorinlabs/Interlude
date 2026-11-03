import { interpolate } from './messages';
import type { Language } from './registry';

export type ErrorLanguage = Exclude<Language, 'zh'>;
type Dictionary = Readonly<Record<string, string>>;

export interface ErrorDictionary {
  /** Whole dictionary for exact lookups, also used for captured values that are themselves keys. */
  readonly exact: Dictionary;
  /** Sources containing {placeholders} become templates; defaults to `exact`. */
  readonly templates?: Dictionary;
}

export type ErrorDictionaries = Partial<Record<ErrorLanguage, ErrorDictionary>>;
export type ErrorFormatter = (language: Language, message: unknown) => string;

interface CompiledTemplate {
  readonly pattern: RegExp;
  /** Capture group N + 1 holds the value of names[N]; repeated placeholders use backreferences. */
  readonly names: readonly string[];
  /** Literal text around the placeholders; length is the placeholder count + 1. */
  readonly literals: readonly string[];
  readonly backreferences: boolean;
  /** Literal length: longer literal text means a more specific template, which is tried first. */
  readonly weight: number;
  readonly translation: string;
}

const PLACEHOLDER = /\{(\w+)\}/;
const HAN = /[㐀-鿿豈-﫿]/;
const LINE_BREAK = /(\r\n|\n|\r)/;
/** Backreferences can make lazy groups backtrack, so such templates skip long inputs. */
const MAX_BACKREFERENCE_INPUT = 2048;
/** Larger multi-line output (logs, command dumps) is only matched as a whole. */
const MAX_TRANSLATED_LINES = 400;

const own = (dictionary: Dictionary, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compileTemplate(source: string, translation: unknown): CompiledTemplate | undefined {
  if (typeof translation !== 'string') return undefined;
  // split() with a capture group alternates literal text (even indices) and placeholder names.
  const pieces = source.split(PLACEHOLDER);
  if (pieces.length < 3) return undefined;
  const literals = pieces.filter((_, index) => index % 2 === 0);
  const literalText = literals.join('');
  // Templates without Chinese literal text (such as '{value1}: {value2}') would match anything.
  if (!HAN.test(literalText)) return undefined;
  const names: string[] = [];
  let pattern = '^';
  let backreferences = false;
  pieces.forEach((piece, index) => {
    if (index % 2 === 0) {
      pattern += escapeRegExp(piece);
      return;
    }
    const previous = names.indexOf(piece);
    if (previous >= 0) {
      backreferences = true;
      // The group keeps a following literal digit from extending the backreference number.
      pattern += `(?:\\${previous + 1})`;
    } else {
      names.push(piece);
      pattern += '([\\s\\S]*?)';
    }
  });
  try {
    return {
      pattern: new RegExp(`${pattern}$`),
      names,
      literals,
      backreferences,
      weight: literalText.length,
      translation,
    };
  } catch {
    return undefined;
  }
}

function compileTemplates(dictionary: Dictionary): readonly CompiledTemplate[] {
  const templates: CompiledTemplate[] = [];
  for (const source of Object.keys(dictionary)) {
    if (source.indexOf('{') < 0) continue;
    const template = compileTemplate(source, dictionary[source]);
    if (template) templates.push(template);
  }
  // Array sort is stable, so equally specific templates keep dictionary order.
  return templates.sort((left, right) => right.weight - left.weight);
}

/**
 * Finds every literal in order, each at its earliest position. Without backreferences this
 * succeeds exactly when the anchored lazy pattern matches, so exec() never backtracks in vain.
 */
function literalsFit(literals: readonly string[], text: string): boolean {
  const first = literals[0];
  const last = literals[literals.length - 1];
  const end = text.length - last.length;
  if (end < first.length || !text.startsWith(first) || !text.endsWith(last)) return false;
  let cursor = first.length;
  for (let index = 1; index < literals.length - 1; index += 1) {
    const literal = literals[index];
    if (!literal) continue;
    const position = text.indexOf(literal, cursor);
    if (position < 0 || position + literal.length > end) return false;
    cursor = position + literal.length;
  }
  return true;
}

export function safeString(message: unknown): string {
  if (typeof message === 'string') return message;
  try {
    return String(message);
  } catch {
    try {
      return Object.prototype.toString.call(message);
    } catch {
      return '';
    }
  }
}

/**
 * Builds a translator over explicit dictionaries. Templates are compiled once per language, on the
 * first message that has no exact translation.
 */
export function createTextErrorFormatter(dictionaries: ErrorDictionaries): ErrorFormatter {
  const compiled = new Map<ErrorLanguage, readonly CompiledTemplate[]>();

  const templatesFor = (language: ErrorLanguage, dictionary: ErrorDictionary) => {
    let templates = compiled.get(language);
    if (!templates) {
      templates = compileTemplates(dictionary.templates ?? dictionary.exact);
      compiled.set(language, templates);
    }
    return templates;
  };

  return (language, message) => {
    const text = safeString(message);
    if (language === 'zh' || !text) return text;
    try {
      const target: ErrorLanguage = language;
      if (!Object.prototype.hasOwnProperty.call(dictionaries, target)) return text;
      const dictionary = dictionaries[target];
      if (!dictionary) return text;

      const exact = (source: string): string | undefined =>
        own(dictionary.exact, source) ? String(dictionary.exact[source]) : undefined;

      const fromTemplate = (source: string): string | undefined => {
        for (const template of templatesFor(target, dictionary)) {
          if (template.weight > source.length || !literalsFit(template.literals, source)) continue;
          if (template.backreferences && source.length > MAX_BACKREFERENCE_INPUT) continue;
          const match = template.pattern.exec(source);
          if (!match) continue;
          const values: Record<string, string> = {};
          template.names.forEach((name, index) => {
            const value = match[index + 1] ?? '';
            // One level only: a captured value is translated when it is itself an exact key.
            values[name] = exact(value) ?? value;
          });
          return interpolate(template.translation, values);
        }
        return undefined;
      };

      const translateOne = (source: string): string | undefined => {
        const direct = exact(source) ?? fromTemplate(source);
        if (direct !== undefined) return direct;
        // Keep indentation and trailing spaces, such as in command output lists.
        const core = source.trim();
        if (!core || core === source) return undefined;
        const inner = exact(core) ?? fromTemplate(core);
        if (inner === undefined) return undefined;
        const start = source.indexOf(core);
        return source.slice(0, start) + inner + source.slice(start + core.length);
      };

      const whole = translateOne(text);
      if (whole !== undefined) return whole;
      if (!LINE_BREAK.test(text)) return text;
      // Separators are captured at odd indices, so the original line breaks survive the join.
      const parts = text.split(LINE_BREAK);
      if (parts.length > MAX_TRANSLATED_LINES * 2) return text;
      return parts
        .map((part, index) => (index % 2 === 1 || !part ? part : translateOne(part) ?? part))
        .join('');
    } catch {
      return text;
    }
  };
}
