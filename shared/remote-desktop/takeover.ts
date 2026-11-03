// A capture group identifies the connection the viewer actually agreed to replace.
const OCCUPIED_PREFIX = 'REMOTE_DESKTOP_OCCUPIED:';
const GROUP_PATTERN = /^[a-f0-9-]{36}$/i;

export function desktopOccupied(group: string) { return `${OCCUPIED_PREFIX}${group}`; }

export function occupiedDesktopGroup(message: string): string | undefined {
  if (!message.startsWith(OCCUPIED_PREFIX)) return;
  const group = message.slice(OCCUPIED_PREFIX.length);
  return GROUP_PATTERN.test(group) ? group : undefined;
}
