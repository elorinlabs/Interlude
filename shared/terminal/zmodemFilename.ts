/** A remote filename is display/download metadata, never a local path. */
export function zmodemFilename(name: string) {
  const base = name.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!base || base === '.' || base === '..') throw new Error('Invalid ZMODEM filename');
  return base;
}
