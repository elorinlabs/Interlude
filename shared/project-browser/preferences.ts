export const AUTO_SAVE_KEY = 'codex-switch.project-browser.auto-save';
export const DEFAULT_AUTO_SAVE_DELAY = 1000;
export const AUTO_SAVE_OPTIONS = [
  { value: 0, label: "client.projectBrowser.off" },
  { value: 1000, label: "client.projectBrowser.1Second" },
  { value: 2000, label: "client.projectBrowser.2Seconds" },
  { value: 5000, label: "client.projectBrowser.5Seconds" },
  { value: 10000, label: "client.projectBrowser.10Seconds" },
] as const;

export function autoSaveDelay(value: unknown): number {
  return typeof value === 'number' && AUTO_SAVE_OPTIONS.some(option => option.value === value)
    ? value : DEFAULT_AUTO_SAVE_DELAY;
}

export interface BrowserPreferences {
  delay: number;
  change: (delay: number) => void;
}
