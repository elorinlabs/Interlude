import { Modal, Radio } from 'antd';
import { useState } from 'react';
import { ChevronRight, ExternalLink, FileInput } from 'lucide-react';
import type { Translate } from '../i18n';

interface AddAccountModalProps {
  t: Translate;
  onClose: () => void;
  onLogin: (privateMode: boolean) => void;
  onImport: () => void;
  accountEmail?: string | null;
}

export function AddAccountModal({ t, onClose, onLogin, onImport, accountEmail }: AddAccountModalProps) {
  const [privateMode, setPrivateMode] = useState(true);
  return <Modal open centered width={460} title={t(accountEmail
    ? 'accountsOnly.health.reauthorize' : 'accountsOnly.add')} footer={null} onCancel={onClose}>
    <p className="account-login-description">{accountEmail
      ? t('accountsOnly.health.reauthorizeHint', { email: accountEmail }) : t('accountsOnly.loginDescription')}</p>
    <Radio.Group value={privateMode} onChange={(event) => setPrivateMode(event.target.value as boolean)}>
      <Radio value={true}>{t('login.browserPrivateButton')}</Radio>
      <Radio value={false}>{t('login.browserNormalButton')}</Radio>
    </Radio.Group>
    <button className="login-choice" onClick={() => onLogin(privateMode)}>
      <span className="choice-icon"><ExternalLink size={20} /></span>
      <span><b>{t('login.browser.title')}</b><small>{t('accountsOnly.browserDescription')}</small></span>
      <ChevronRight size={16} />
    </button>
    <button className="login-choice" onClick={onImport}>
      <span className="choice-icon"><FileInput size={20} /></span>
      <span><b>{t('accountsOnly.import')}</b><small>{t('accountsOnly.importDescription')}</small></span>
      <ChevronRight size={16} />
    </button>
  </Modal>;
}
