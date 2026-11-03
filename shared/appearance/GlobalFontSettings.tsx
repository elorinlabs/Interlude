import { useState } from 'react';
import type { MessageKey } from '@interlude/i18n';
import { FontSizeControl } from './FontSizeControl';
import { saveGlobalFontSize, useGlobalFontSize } from './fontSize';

export function GlobalFontSettings({ t }: { t: (key: MessageKey) => string }) {
  const fontSize = useGlobalFontSize();
  const [error, setError] = useState(false);
  return <div className="global-font-settings">
    <p>{t('client.appearance.globalFontDescription')}</p>
    <FontSizeControl value={fontSize} onChange={value => setError(!saveGlobalFontSize(value))}
      label={t('client.appearance.globalFontSize')} resetLabel={t('client.chat.restoreDefaults')} />
    <p style={{ fontSize }}>{t('client.workspaceSettings.chooseAComfortableSizeForReadingAndWriting')}</p>
    {error && <p className="font-size-error" role="alert">
      {t('client.workspaceSettings.couldNotSaveTheFontSizePleaseTryAgain')}</p>}
  </div>;
}
