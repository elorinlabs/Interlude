import type { ThemeMode } from './mode';

export interface WebviewAppearance {
  mode: ThemeMode;
  background: string;
  foreground: string;
  variables?: Record<string, string>;
}

/** Seed the document itself: Android's before-content script can arrive after its first paint. */
export function themedWebviewDocument(html: string, appearance: WebviewAppearance): string {
  const properties = { 'color-scheme': appearance.mode, background: appearance.background,
    color: appearance.foreground, ...appearance.variables };
  const style = Object.entries(properties).map(([name, value]) => `${name}:${value}`).join(';')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return html.replace(/<html(?=[\s>])/i, `<html data-theme="${appearance.mode}" style="${style}"`);
}
