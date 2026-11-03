import { defaultText } from '../localization/messages';
import type { DesktopDisplay } from './protocol';

export function displayName(display: DesktopDisplay, translate: (text: string) => string = defaultText) {
  const number = display.name.replace(/^DISPLAY(\d+)$/i, '$1');
  return `${translate("client.remoteDesktop.monitor")} ${number}`;
}

export function displayLabel(display: DesktopDisplay, translate: (text: string) => string = defaultText) {
  const primary = display.primary ? ` · ${translate("client.remoteDesktop.primary")}` : '';
  return `${displayName(display, translate)}${primary} · ${display.width} × ${display.height}`;
}
