export const LOUNGE_EMOJI = ['😀', '😂', '🥹', '😊', '😍', '😎', '🤔', '😅', '😭', '😴', '🙃', '🤫',
  '👍', '👏', '🙌', '🙏', '❤️', '🎉', '🔥', '✨', '☕', '🍉', '🐟', '🚀'];

export interface EmojiSelection { start: number; end: number }

/** Clamp a cursor retained across sends and replace selections using UTF-16 input offsets. */
export function insertLoungeEmoji(text: string, selection: EmojiSelection, emoji: string) {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const cursor = start + emoji.length;
  return { text: text.slice(0, start) + emoji + text.slice(end), selection: { start: cursor, end: cursor } };
}

export function loungeEmojiPanelHeight(viewportHeight: number, keyboardHeight = 0) {
  const defaultHeight = 300;
  return keyboardHeight || Math.min(defaultHeight, viewportHeight * 0.55);
}
