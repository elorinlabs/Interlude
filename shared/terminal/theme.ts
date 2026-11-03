import type { ITheme } from '@xterm/xterm';
import { darkColors } from '../theme/mode';

const themes = {
  dark: {
    background: '#000000', foreground: '#e5e5e5', cursor: '#e5e5e5', cursorAccent: '#000000',
    selectionBackground: '#ffffff40', black: '#000000', brightBlack: '#767676',
    red: '#f14c4c', green: '#23d18b', yellow: '#f5f543', blue: '#3b8eea',
    magenta: '#d670d6', cyan: '#29b8db', white: '#e5e5e5',
  },
  light: {
    background: '#ffffff', foreground: '#242424', cursor: '#242424', cursorAccent: '#ffffff',
    selectionBackground: '#00000025', black: '#242424', brightBlack: '#666666',
    red: '#b52020', green: '#137333', yellow: '#8a6500', blue: '#1554b0',
    magenta: '#922b91', cyan: '#087c8c', white: '#b5b5b5',
  },
} satisfies Record<'light' | 'dark', ITheme>;

export function terminalTheme(dark: boolean) {
  return { ...themes[dark ? 'dark' : 'light'] };
}

/** Native HTML and desktop/mobile Web use the same emulator palette. */
export function terminalAppearance(dark: boolean) {
  const theme = terminalTheme(dark);
  return { theme, variables: {
    '--terminal-background': theme.background,
    '--terminal-foreground': theme.foreground,
    '--terminal-border': dark ? darkColors.border : '#dfe5df',
    '--terminal-key-background': dark ? darkColors.canvas : '#eef4f1',
    '--terminal-key-foreground': dark ? darkColors.ink : '#17211b',
    '--terminal-scrollbar': dark ? darkColors.muted : '#b7c4bd',
  } };
}
