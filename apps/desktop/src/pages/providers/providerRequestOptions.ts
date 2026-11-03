import type { ProviderRequestOptions } from "../../types";

const MAX_OPTIONS_BYTES = 16 * 1024;
const MAX_HEADER_BYTES = 4096;
const MAX_HEADER_COUNT = 32;
const MAX_BODY_DEPTH = 8;
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const RESERVED_HEADERS = new Set([
  "authorization", "proxy-authorization", "x-api-key", "api-key", "x-goog-api-key", "cookie", "set-cookie",
  "host", "connection", "content-length", "content-type", "transfer-encoding", "upgrade", "te", "trailer",
  "keep-alive", "proxy-connection", "forwarded", "chatgpt-account-id",
]);
const RESERVED_PARAMETERS = new Set([
  "model", "stream", "stream_options", "input", "messages", "tools", "tool_choice", "system", "instructions",
  "previous_response_id", "conversation", "include", "api_key", "apiKey", "authorization",
  "contents", "systemInstruction", "system_instruction", "cachedContent", "cached_content", "toolConfig", "tool_config",
]);

export type OptionsError = "invalidJson" | "invalidHeaders" | "reservedBody" | "tooLarge" | "tooDeep";
type ParseResult = { value: ProviderRequestOptions; error?: never } | { value?: never; error: OptionsError };
type ProviderEndpoint = { baseUrl: string; requestOptions?: ProviderRequestOptions | null };

export function retainedRequestOptions(
  existing: ProviderEndpoint | null,
  requested: ProviderEndpoint,
): ProviderRequestOptions | undefined {
  if (requested.requestOptions) return requested.requestOptions;
  const options = existing?.requestOptions;
  if (!options || !existing) return undefined;
  const normalizedUrl = (value: string) => options.useFullUrl ? value.trim() : value.trim().replace(/\/+$/, "");
  if (normalizedUrl(existing.baseUrl) === normalizedUrl(requested.baseUrl)) return options;
  return { useFullUrl: false, headers: {}, body: {} };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tooDeep(value: unknown, depth = 0): boolean {
  if (depth > MAX_BODY_DEPTH) return true;
  if (Array.isArray(value)) return value.some((entry) => tooDeep(entry, depth + 1));
  return object(value) && Object.values(value).some((entry) => tooDeep(entry, depth + 1));
}

function containsPrototypeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrototypeKey);
  return object(value) && Object.entries(value).some(([key, child]) => (
    PROTOTYPE_KEYS.has(key) || containsPrototypeKey(child)
  ));
}

function validHeaders(headers: Record<string, unknown>): headers is Record<string, string> {
  const names = new Set<string>();
  return Object.entries(headers).every(([name, value]) => {
    const lower = name.toLowerCase();
    if (names.has(lower) || RESERVED_HEADERS.has(lower) || PROTOTYPE_KEYS.has(lower) || lower.startsWith("x-forwarded-")
      || lower.startsWith("x-codex-") || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name)) return false;
    names.add(lower);
    return typeof value === "string" && !/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      && new TextEncoder().encode(value).length <= MAX_HEADER_BYTES;
  });
}

export function parseRequestOptions(draft: {
  useFullUrl: boolean; headers: string; body: string;
}): ParseResult {
  try {
    const headers: unknown = JSON.parse(draft.headers.trim() || "{}");
    const body: unknown = JSON.parse(draft.body.trim() || "{}");
    if (!object(headers) || !object(body)) return { error: "invalidJson" };
    const options = { useFullUrl: draft.useFullUrl, headers, body };
    if (Object.keys(headers).length > MAX_HEADER_COUNT
      || new TextEncoder().encode(JSON.stringify(options)).length > MAX_OPTIONS_BYTES) {
      return { error: "tooLarge" };
    }
    if (!validHeaders(headers)) return { error: "invalidHeaders" };
    if (tooDeep(body)) return { error: "tooDeep" };
    if (Object.keys(body).some((key) => RESERVED_PARAMETERS.has(key)) || containsPrototypeKey(body)) {
      return { error: "reservedBody" };
    }
    return { value: { useFullUrl: draft.useFullUrl, headers, body } };
  } catch {
    return { error: "invalidJson" };
  }
}
