const reported = new Set<string>();

function reportMissing(path: string) {
  // Report during the static export only; visitors silently get the English text.
  if (!(import.meta as ImportMeta & { env?: { SSR?: boolean } }).env?.SSR || reported.has(path)) return;
  reported.add(path);
  console.warn(`[website] Translation is missing for ${path}; using English.`);
}

/**
 * Returns `value` shaped like `english`. Anything missing or empty in `value` is replaced by the
 * English text, so an incomplete Russian translation never blocks the build or shows Chinese.
 */
export function withEnglishFallback<T>(value: unknown, english: T, path: string): T {
  if (typeof english === 'string') {
    if (typeof value === 'string' && value.trim()) return value as T;
    reportMissing(path);
    return english;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(value) || value.length === 0) {
      reportMissing(path);
      return english;
    }
    return value.map((item, index) =>
      index < english.length ? withEnglishFallback(item, english[index], `${path}[${index}]`) : item,
    ) as T;
  }
  if (english && typeof english === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      reportMissing(path);
      return english;
    }
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(english).map(([key, item]) => [key, withEnglishFallback(source[key], item, `${path}.${key}`)]),
    ) as T;
  }
  return (value ?? english) as T;
}
