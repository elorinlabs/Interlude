import { createI18n } from '../engine';
import type { Language } from '../registry';
import zh from '../catalogs/desktop/zh/petDock.json';
import en from '../catalogs/desktop/en/petDock.json';
import ru from '../catalogs/desktop/ru/petDock.json';
import ja from '../catalogs/desktop/ja/petDock.json';

// The independent Web settings page needs this narrow desktop feature's guidance.
const messages = createI18n({ locale: 'en', resources: { zh, en, ru, ja } });
export function petDockText(language: Language, key: keyof typeof en): string {
  return messages.text(key, undefined, language);
}
