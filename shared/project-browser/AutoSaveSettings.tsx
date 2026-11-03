import { AUTO_SAVE_OPTIONS, type BrowserPreferences } from './preferences';
import type { BrowserTranslate } from './ProjectTree';
import './autoSaveSettings.css';

export function AutoSaveSettings({ preferences, t }: { preferences: BrowserPreferences; t: BrowserTranslate }) {
  return <div className="pf-auto-save-settings">
    <label><span>{t("client.projectBrowser.autoSaveFiles")}</span>
      <select aria-label={t("client.projectBrowser.autoSaveFiles")} value={preferences.delay}
        onChange={event => preferences.change(Number(event.target.value))}>
        {AUTO_SAVE_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
      </select>
    </label>
    <p>{t("client.projectBrowser.saveAfterYouStopTypingWhenOffClickSaveOr")}</p>
  </div>;
}
