export const INLINE_PASTE_CHARACTERS = 10_000;
export const INLINE_PASTE_LINES = 200;
let sequence = 0;

/** Bound editor layout work before inserting clipboard text into the DOM. */
export function isLongPaste(text: string): boolean {
  if (text.length > INLINE_PASTE_CHARACTERS) return true;
  let lines = 1;
  for (const character of text) {
    if (character === '\n' && ++lines > INLINE_PASTE_LINES) return true;
  }
  return false;
}

export function pastedTextFile(text: string): File | null {
  if (!isLongPaste(text)) return null;
  return new File([text], `pasted-text-${Date.now()}-${++sequence}.txt`, { type: 'text/plain;charset=utf-8' });
}
