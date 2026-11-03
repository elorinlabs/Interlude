import type { SshX11 } from './ssh';

const MAX_DISPLAY = 59535;
const MAX_SCREEN = 65535;
const LOCAL_DISPLAY = /^(?:(?:unix|localhost|127\.0\.0\.1|\[::1\]))?:(\d+)(?:\.(\d+))?$/;

/** Only the SSH computer's local X server may receive forwarded connections. */
export function validSshX11(value: unknown): value is SshX11 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  if (Object.keys(options).some(key => key !== 'display')) return false;
  if (options.display === undefined || options.display === '') return true;
  if (typeof options.display !== 'string' || options.display.length > 256) return false;
  const match = LOCAL_DISPLAY.exec(options.display);
  return !!match && match[0] === options.display
    && Number(match[1]) <= MAX_DISPLAY && Number(match[2] ?? 0) <= MAX_SCREEN;
}
