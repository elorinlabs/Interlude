import { useState } from 'react';
import { Contrast } from 'lucide-react';
import { ThemeModeTabs } from '../../../../shared/theme/ThemeModeTabs';
import { THEME_LABELS } from '../../../../shared/theme/mode';
import { t } from '../i18n';
import { setThemeMode, useThemeMode, useThemePreference } from '../theme/preference';
import { useDesktopLayout } from '../useDesktopLayout';
import { SettingsRow } from './SettingsRow';

export function ThemeSettingsRow({ onOpen }: { onOpen: () => void }) {
  const desktop = useDesktopLayout();
  const mode = useThemeMode();
  const preference = useThemePreference();
  const [error, setError] = useState(false);
  if (!desktop) return <SettingsRow label={t('client.workspaceSettings.appearance')}
    value={t(THEME_LABELS[preference])}
    icon={Contrast} onClick={onOpen} />;

  return <div className="settings-row settings-theme-row">
    <span className="settings-row-icon green"><Contrast size={21} aria-hidden="true" /></span>
    <span className="settings-row-label">{t('client.workspaceSettings.appearance')}</span>
    <ThemeModeTabs mode={mode} t={t} onChange={next => setError(!setThemeMode(next))} />
    {error && <p className="settings-theme-error" role="alert">
      {t('client.settings.appearanceChangedButCouldNotBeSavedPleaseChooseAgain')}
    </p>}
  </div>;
}
