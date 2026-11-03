import { useState } from 'react';
import { Check } from 'lucide-react';
import { THEME_PREFERENCE_OPTIONS } from '../../../../shared/theme/mode';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { t } from '../i18n';
import { setThemeMode, useThemePreference } from '../theme/preference';

export function ThemeSheet({ onClose }: { onClose: () => void }) {
  const preference = useThemePreference();
  const [error, setError] = useState(false);
  return <AdaptiveSheet open title={t("client.workspaceSettings.appearance")} onClose={onClose} width={400}>
    <div role="radiogroup" aria-label={t("client.workspaceSettings.appearance")}>
      {THEME_PREFERENCE_OPTIONS.map(option => <button key={option.value} type="button" className="settings-row"
        role="radio" aria-checked={preference === option.value} onClick={() => {
          if (setThemeMode(option.value)) onClose();
          else setError(true);
        }}>
        <span className="settings-row-label">{t(option.label)}</span>
        {preference === option.value && <Check size={18} aria-hidden="true" />}
      </button>)}
      {error && <p role="alert">{t("client.settings.appearanceChangedButCouldNotBeSavedPleaseChooseAgain")}</p>}
    </div>
  </AdaptiveSheet>;
}
