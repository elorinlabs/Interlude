import type { Language, Translate } from '../i18n';
import { LANGUAGE_OPTIONS } from '../i18n';
import { accountThemes, type AccountTheme } from './useAccountTheme';

interface Props {
  language: Language;
  onLanguage: (value: Language) => void;
  theme: AccountTheme;
  onTheme: (value: AccountTheme) => void;
  t: Translate;
}

export function AppearanceControls({ language, onLanguage, theme, onTheme, t }: Props) {
  return <div className="appearance-controls">
    <label className="language-control">
      <span>{t('accountsOnly.appearance.language')}</span>
      <select value={language} onChange={event => onLanguage(event.target.value as Language)}>
        {LANGUAGE_OPTIONS.filter(option => option.value === 'zh' || option.value === 'en' || option.value === language)
          .map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <fieldset className="palette-control">
      <legend>{t('accountsOnly.appearance.palette')}</legend>
      {(Object.keys(accountThemes) as AccountTheme[]).map(value =>
        <button type="button" key={value} aria-pressed={theme === value}
          onClick={() => onTheme(value)} className={`palette-option palette-${value}`}>
          <span className="palette-swatch" aria-hidden="true" />
          <span>{t(`accountsOnly.appearance.${value}`)}</span>
        </button>)}
    </fieldset>
  </div>;
}
