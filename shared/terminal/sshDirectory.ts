import type { Terminal } from '@xterm/xterm';

interface DirectoryState {
  path?: string;
  requested?: string;
  ready: boolean;
  outputs: number;
  clean?: () => boolean;
  write?: (data: string) => void;
  listeners: Set<() => void>;
}

const directories = new Map<string, DirectoryState>();
const MAX_DIRECTORY_LENGTH = 4096;

function state(id: string): DirectoryState {
  let value = directories.get(id);
  if (!value) {
    value = { ready: false, outputs: 0, listeners: new Set() };
    directories.set(id, value);
  }
  return value;
}

export function validSshDirectory(path: string) {
  return path.startsWith('/') && path.length <= MAX_DIRECTORY_LENGTH && !/[\x00-\x1f\x7f]/.test(path);
}

export function parseSshDirectory(value: string): string | undefined {
  if (!value.startsWith('file://')) return;
  try {
    // Keep literal # and ? in filenames; these sequences are terminal reports, not navigation URLs.
    const slash = value.indexOf('/', 'file://'.length);
    if (slash < 0) return;
    const path = decodeURIComponent(value.slice(slash));
    return validSshDirectory(path) ? path : undefined;
  } catch { return undefined; }
}

export const getSshDirectory = (id: string) => directories.get(id)?.path;

export function subscribeSshDirectory(id: string, listener: () => void) {
  if (!id) return () => {};
  const value = state(id);
  value.listeners.add(listener);
  return () => {
    value.listeners.delete(listener);
    if (!value.listeners.size && !value.write) directories.delete(id);
  };
}

export function reportSshDirectory(id: string, path: string) {
  if (!validSshDirectory(path)) return;
  const value = state(id);
  if (value.path === path) return;
  value.path = path;
  for (const listener of value.listeners) listener();
}

/** A browser navigation waits for a clean prompt instead of typing into a running program. */
export function requestSshDirectory(id: string, path: string) {
  if (!validSshDirectory(path)) return;
  const value = state(id);
  if (path === value.path) { value.requested = undefined; return; }
  if (!value.write) return;
  value.requested = path;
  flushDirectory(value);
}

function flushDirectory(value: DirectoryState) {
  if (!value.ready || value.outputs || !value.write || !value.requested || !value.clean?.()) return;
  const path = value.requested;
  value.requested = undefined;
  value.ready = false;
  // Single quotes prevent every shell expansion, including whitespace, quotes and command substitutions.
  value.write(`cd -- '${path.replace(/'/g, `'"'"'`)}'\r`);
}

/** Registers output parsers only; shell integration never changes the user's input or interrupted command. */
export function bindSshDirectory(options: { id: string; terminal: Terminal; write: (data: string) => void }) {
  const { id, terminal, write } = options;
  const value = state(id);
  value.ready = false;
  value.outputs = 0;
  value.write = write;
  let inputRevision = 0;
  let disposed = false;
  let promptCursor = '';
  const cursor = () => {
    const buffer = terminal.buffer.active;
    return `${buffer.type}:${buffer.baseY}:${buffer.cursorY}:${buffer.cursorX}`;
  };
  value.clean = () => promptCursor === cursor();
  const handlers = [
    terminal.parser.registerOscHandler(7, data => {
      const path = parseSshDirectory(data);
      if (path) reportSshDirectory(id, path);
      return true;
    }),
    ...[133, 633].map(code => terminal.parser.registerOscHandler(code, data => {
      if (code === 633 && data === 'P;InterludeInput=1') { value.ready = false; return true; }
      const marker = data.split(';', 1)[0];
      if (marker === 'B') { value.ready = true; promptCursor = cursor(); }
      if (marker === 'A' || marker === 'C' || marker === 'D') value.ready = false;
      return false;
    })),
  ];
  return {
    output: (data: number[]) => {
      const revision = inputRevision;
      value.outputs++;
      terminal.write(new Uint8Array(data), () => {
        if (disposed) return;
        value.outputs--;
        if (revision !== inputRevision) value.ready = false;
        flushDirectory(value);
      });
    },
    input: () => { inputRevision++; value.ready = false; },
    disconnect: () => { inputRevision++; value.ready = false; value.requested = undefined; },
    dispose: () => {
      disposed = true;
      for (const handler of handlers) handler.dispose();
      if (value.write !== write) return;
      value.write = undefined; value.ready = false; value.outputs = 0; value.requested = undefined;
      value.clean = undefined;
      if (!value.listeners.size) directories.delete(id);
    },
  };
}
