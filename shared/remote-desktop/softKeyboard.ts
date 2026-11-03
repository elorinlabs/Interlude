import type { DesktopInput, DesktopPlatform } from './protocol';

export const INPUT_TABS = [
  { id: 'ime', label: "client.remoteDesktop.inputMethod" }, { id: 'shortcuts', label: "client.remoteDesktop.shortcuts" }, { id: 'keyboard', label: "client.remoteDesktop.computerKeyboard" },
] as const;
export type InputTab = typeof INPUT_TABS[number]['id'];
export interface SoftKey { code: string; label: string; weight?: number }
export const MODIFIERS: SoftKey[] = [
  { code: 'ControlLeft', label: 'Ctrl' }, { code: 'ShiftLeft', label: 'Shift' },
  { code: 'AltLeft', label: 'Alt' }, { code: 'MetaLeft', label: 'Win' },
];
const letters = (row: string): SoftKey[] => [...row].map(label => ({ code: `Key${label}`, label }));
export const KEYBOARD_PAGES: SoftKey[][][] = [
  [
    [...'1234567890'].map(label => ({ code: `Digit${label}`, label })),
    letters('QWERTYUIOP'),
    [...letters('ASDFGHJKL'), { code: 'Backspace', label: '⌫' }],
    [...letters('ZXCVBNM'), { code: 'Space', label: 'Space', weight: 1.5 },
      { code: 'Enter', label: 'Enter', weight: 1.5 }],
  ],
  [
    Array.from({ length: 12 }, (_, index) => ({ code: `F${index + 1}`, label: `F${index + 1}` })),
    [{ code: 'Escape', label: 'Esc' }, { code: 'Tab', label: 'Tab' }, { code: 'CapsLock', label: 'Caps Lock' },
      { code: 'Insert', label: 'Insert' }, { code: 'Delete', label: 'Delete' }, { code: 'Backspace', label: '⌫' }],
    [{ code: 'Backquote', label: '`' }, { code: 'Minus', label: '-' }, { code: 'Equal', label: '=' },
      { code: 'BracketLeft', label: '[' }, { code: 'BracketRight', label: ']' }, { code: 'Backslash', label: '\\' },
      { code: 'Semicolon', label: ';' }, { code: 'Quote', label: "'" }, { code: 'Comma', label: ',' },
      { code: 'Period', label: '.' }, { code: 'Slash', label: '/' }],
    [{ code: 'Home', label: 'Home' }, { code: 'End', label: 'End' }, { code: 'PageUp', label: 'PgUp' },
      { code: 'PageDown', label: 'PgDn' }, { code: 'ArrowLeft', label: '←' }, { code: 'ArrowUp', label: '↑' },
      { code: 'ArrowDown', label: '↓' }, { code: 'ArrowRight', label: '→' }],
  ],
];
export const DESKTOP_SHORTCUTS = [
  { label: 'Caps Lock', description: "client.remoteDesktop.capsLock", codes: ['CapsLock'] },
  ...[['C', "client.projectBrowser.copied"], ['V', "client.projectBrowser.paste"], ['X', "client.projectBrowser.cut"], ['A', "client.projectBrowser.selectAll"], ['Z', "client.projectBrowser.undo"], ['S', "client.projectBrowser.save"]]
    .map(([key, description]) => ({ label: `Ctrl+${key}`, description, codes: ['ControlLeft', `Key${key}`] })),
  { label: 'Win', description: "client.remoteDesktop.start", codes: ['MetaLeft'] },
  { label: 'Win+D', description: "client.remoteDesktop.showDesktop", codes: ['MetaLeft', 'KeyD'] },
  { label: 'Win+Tab', description: "client.remoteDesktop.switchWindows", codes: ['MetaLeft', 'Tab'] },
  { label: 'Win+L', description: "client.remoteDesktop.lockScreen", codes: ['MetaLeft', 'KeyL'] },
];

/** Complete every chord in one turn; tab changes and disconnects cannot leave a modifier held. */
export function sendDesktopChord(input: (event: DesktopInput) => void, codes: string[]) {
  const unique = [...new Set(codes)];
  for (const code of unique) input({ kind: 'keyboard', code, down: true });
  for (const code of unique.reverse()) input({ kind: 'keyboard', code, down: false });
}

const MAC_MODIFIERS = MODIFIERS.map(key => ({ ...key,
  label: key.code === 'MetaLeft' ? 'Cmd' : key.code === 'AltLeft' ? 'Option' : key.label }));
const MAC_SHORTCUTS = [
  DESKTOP_SHORTCUTS[0],
  ...[['C', "client.projectBrowser.copied"], ['V', "client.projectBrowser.paste"], ['X', "client.projectBrowser.cut"], ['A', "client.projectBrowser.selectAll"], ['Z', "client.projectBrowser.undo"], ['S', "client.projectBrowser.save"]]
    .map(([key, description]) => ({ label: `Cmd+${key}`, description, codes: ['MetaLeft', `Key${key}`] })),
  { label: 'Cmd+Space', description: "client.chat.search", codes: ['MetaLeft', 'Space'] },
  { label: 'F11', description: "client.remoteDesktop.showDesktop", codes: ['F11'] },
  { label: 'Cmd+Tab', description: "client.remoteDesktop.switchWindows", codes: ['MetaLeft', 'Tab'] },
  { label: 'Ctrl+Cmd+Q', description: "client.remoteDesktop.lockScreen", codes: ['ControlLeft', 'MetaLeft', 'KeyQ'] },
];

export function desktopModifiers(platform?: DesktopPlatform) { return platform === 'macos' ? MAC_MODIFIERS : MODIFIERS; }
export function desktopShortcuts(platform?: DesktopPlatform) {
  return platform === 'macos' ? MAC_SHORTCUTS : DESKTOP_SHORTCUTS;
}
