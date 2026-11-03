export type TerminalLinkRequest = { type: 'connect'; url: string }
  | { type: 'udpConnect'; url: string; version: number }
  | { type: 'udpRead' | 'udpClose'; id: string }
  | { type: 'udpWrite'; id: string; packets: UdpPacket[] }
  | { type: 'read' | 'close'; id: string } | { type: 'write'; id: string; data: string };
export interface UdpPacket { peer: string; data: string }
export type TerminalLinkReply = { type: 'listener'; id: string; port: number }
  | { type: 'datagrams'; packets: UdpPacket[] }
  | { type: 'socket'; id: string } | { type: 'data'; data: string; eof: boolean } | { type: 'done' };
export type ResolveTerminalLink = (id: string, url: string) => Promise<string>;

export function websiteUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : undefined;
  } catch { return undefined; }
}

/** Remote development addresses belong to the selected computer, never the viewing computer. */
export function remoteDevelopmentUrl(value: string): boolean {
  const url = websiteUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // Include IPv4-mapped loopback/LAN addresses; they must never reach the viewer's own network.
  if (host.includes(':')) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254
      || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
      || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}
