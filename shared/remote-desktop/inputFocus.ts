import type { DesktopInputFocus } from './protocol';

/** Ignore unsupported, malformed and off-display targets rather than moving to an unrelated window. */
export function desktopInputFocus(value: unknown): DesktopInputFocus | null {
  if (!value || typeof value !== 'object') return null;
  const { top, bottom, lineHeight } = value as Partial<DesktopInputFocus>;
  if (typeof top !== 'number' || typeof bottom !== 'number' || !Number.isFinite(top) || !Number.isFinite(bottom)
    || top < 0 || bottom > 1 || bottom <= top) return null;
  if (lineHeight !== undefined && (typeof lineHeight !== 'number' || !Number.isFinite(lineHeight)
    || lineHeight <= 0 || lineHeight > 1)) return null;
  return { top, bottom, ...(lineHeight === undefined ? {} : { lineHeight }) };
}
