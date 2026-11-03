import { displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { MAX_REFRESH_MINUTES, MIN_REFRESH_MINUTES, saveRefreshMinutes } from './refreshInterval';

export function RefreshIntervalSheet({ minutes, onClose, onSaved }: {
  minutes: number; onClose: () => void; onSaved: (value: number) => void;
}) {
  useLanguage();
  const [input, setInput] = useState(String(minutes));
  const [error, setError] = useState('');
  const save = () => {
    const next = Number(input);
    if (!Number.isInteger(next) || next < MIN_REFRESH_MINUTES || next > MAX_REFRESH_MINUTES) {
      setError(t("client.settings.enterAWholeNumberFrom1To1440Minutes"));
      return;
    }
    saveRefreshMinutes(next);
    onSaved(next);
    onClose();
    Toast.show({ icon: 'success', content: t("client.settings.usageWillRefreshEveryMinutes", { value1: next }) });
  };
  return <AdaptiveSheet open title={t("client.settings.autoRefreshUsage")} onClose={onClose} width={400}>
    <p className="settings-hint">{t("client.settings.refreshAllAccountUsageAutomaticallyYouCanAlsoRefreshManually")}</p>
    <Form layout="vertical" footer={<Button block color="primary" onClick={save}>{t("client.projectBrowser.save")}</Button>}>
      <Form.Item label={t("client.settings.refreshIntervalMinutes")} help={t("client.settings.choose11440MinutesTheDefaultIs30Minutes")}>
        <Input aria-label={t("client.settings.refreshIntervalMinutes")} value={input} inputMode="numeric" onEnterPress={save}
          onChange={value => { setInput(value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
      </Form.Item>
      {error && <p className="form-error" role="alert">{displayError(error)}</p>}
    </Form>
  </AdaptiveSheet>;
}
