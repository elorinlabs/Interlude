import { Languages } from 'lucide-react';
import { LanguageSelect } from '../../../../shared/localization/LanguageSelect';
import { LANGUAGE_OPTIONS, setLanguage, t, useLanguage } from '../i18n';

export function LanguageSettingsRow() {
  const language = useLanguage();
  return <div className="settings-row">
    <span className="settings-row-icon blue"><Languages size={21} aria-hidden="true" /></span>
    <label className="settings-row-label" htmlFor="settings-language">{t('client.settings.language')}</label>
    <LanguageSelect id="settings-language" label={t('client.settings.language')}
      value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
  </div>;
}
