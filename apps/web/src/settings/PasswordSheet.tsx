import { displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { apiJson } from '../api';
import { AdaptiveSheet } from '../components/AdaptiveSheet';

export function PasswordSheet({ onClose }: { onClose: () => void }) {
  useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmation) {
      setError(newPassword !== confirmation ? t("client.settings.theNewPasswordsDoNotMatch") : t("client.settings.enterYourCurrentPasswordAndANewPasswordOfAt"));
      return;
    }
    setSaving(true);
    try {
      await apiJson('/admin/api/profile/password', { method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }) });
      Toast.show({ icon: 'success', content: t("client.settings.passwordChanged") });
      onClose();
    } catch { setError(t("client.settings.couldNotChangeYourPasswordCheckYourCurrentPasswordAnd")); }
    finally { setSaving(false); }
  };
  return <AdaptiveSheet open title={t("client.settings.changePassword")} subtitle={t("client.settings.atLeast8Characters")} width={400}
    onClose={() => { if (!saving) onClose(); }}>
    <Form layout="vertical" footer={<Button block color="primary" loading={saving}
      onClick={() => void save()}>{t("client.settings.changePassword.4c62c9")}</Button>}>
      <Form.Item label={t("client.settings.currentPassword")}><Input aria-label={t("client.settings.currentPassword")} type="password" autoComplete="current-password"
        value={currentPassword} onChange={setCurrentPassword} /></Form.Item>
      <Form.Item label={t("client.settings.newPassword")}><Input aria-label={t("client.settings.newPassword")} type="password" autoComplete="new-password"
        value={newPassword} onChange={setNewPassword} /></Form.Item>
      <Form.Item label={t("client.settings.confirmNewPassword")}><Input aria-label={t("client.settings.confirmNewPassword")} type="password" autoComplete="new-password"
        value={confirmation} onChange={setConfirmation} onEnterPress={() => void save()} /></Form.Item>
      {error && <p className="form-error" role="alert">{displayError(error)}</p>}
    </Form>
  </AdaptiveSheet>;
}
