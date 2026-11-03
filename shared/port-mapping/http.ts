export interface MappingHttpRequest { url: string; method?: string; headers?: [string, string][]; body?: Uint8Array }
export interface MappingHttpResponse { status: number; headers: [string, string][]; body: Uint8Array; url: string }
const BROWSER_HEADERS = new RegExp(
  '^(host|connection|content-length|transfer-encoding|accept-encoding|cookie|origin|referer|upgrade|sec-)', 'i');
export const MAX_HTTP_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
export function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left); result.set(right, left.length);
  return result;
}

/** Preview requests stay on the selected IP and port; localhost is an alias only for IPv4 loopback. */
export function mappingUrl(value: string, origin: string): URL {
  const url = new URL(value, origin);
  const target = new URL(origin);
  if (url.hostname === 'localhost' && target.hostname === '127.0.0.1') url.hostname = '127.0.0.1';
  if (url.origin !== target.origin || url.username || url.password) throw new Error('Preview origin rejected');
  return url;
}

export function httpRequest(input: MappingHttpRequest, origin: string,
  options: { keepAlive?: boolean; compression?: boolean } = {}): Uint8Array {
  const url = mappingUrl(input.url, origin);
  const method = (input.method ?? 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method) || ['CONNECT', 'TRACE', 'TRACK'].includes(method)) throw new Error('Invalid method');
  const headers = (input.headers ?? []).filter(([name, value]) => {
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || /[\r\n\0]/.test(value)) throw new Error('Invalid header');
    return !BROWSER_HEADERS.test(name);
  });
  const body = input.body ?? new Uint8Array();
  if (body.length > MAX_HTTP_BYTES) throw new Error('Request too large');
  const lines = [`${method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`,
    `Connection: ${options.keepAlive ? 'keep-alive' : 'close'}`,
    `Accept-Encoding: ${options.compression ? 'gzip, deflate' : 'identity'}`,
    ...headers.map(([name, value]) => `${name}: ${value}`)];
  if (body.length || !['GET', 'HEAD'].includes(method)) lines.push(`Content-Length: ${body.length}`);
  return concatBytes(encoder.encode(lines.join('\r\n') + '\r\n\r\n'), body);
}

export { HttpResponseReader } from './httpResponse';
