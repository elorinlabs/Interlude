export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export const THEME_LABELS = {
  system: 'client.settings.followSystem',
  light: 'client.settings.light',
  dark: 'client.settings.dark',
} as const;

export const THEME_OPTIONS = [
  { value: 'light', label: THEME_LABELS.light },
  { value: 'dark', label: THEME_LABELS.dark },
] as const;

export const THEME_PREFERENCE_OPTIONS = [
  { value: 'system', label: THEME_LABELS.system },
  ...THEME_OPTIONS,
] as const;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || isThemeMode(value);
}

export function resolveThemeMode(preference: ThemePreference, systemMode: unknown): ThemeMode {
  return preference === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : preference;
}

export const darkColors = {
  ink: '#e6e8eb', muted: '#a2aaa7', faint: '#87938d',
  surface: '#1b201e', canvas: '#121614', elevated: '#252c28', border: '#35413a',
  accent: '#61d6ad', accentSoft: '#193e31',
  info: '#83b9f7', infoSoft: '#203349',
  warning: '#efbd69', warningSoft: '#40331e',
  danger: '#ff9894', dangerSoft: '#442725',
  purple: '#c3a7f0', purpleSoft: '#342a44',
} as const;

export type ThemeColorRole = keyof typeof darkColors;
export type ThemeColor = (light: string, role: ThemeColorRole) => string;

export function themeColor(mode: ThemeMode): ThemeColor {
  return (light, role) => mode === 'dark' ? darkColors[role] : light;
}
