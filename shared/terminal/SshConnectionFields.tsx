import { useId } from 'react';
import { Form, Input, InputNumber, Radio, type FormInstance } from 'antd';
import { KeyRound, LockKeyhole, Server, UserRound } from 'lucide-react';
import type { SshValues } from './useSshConnection';
import { SshPrivateKeyInput } from './SshPrivateKeyInput';
import { SshX11Field } from './SshX11Field';
import { validSshX11 } from './sshX11';
import { displayText as t } from '../localization/messages';

export function SshConnectionFields({ form, disabled }: { form: FormInstance<SshValues>; disabled: boolean }) {
  const auth = Form.useWatch('auth', form);
  const sectionId = useId();
  return <>
    <section className="ssh-form-section" aria-labelledby={`${sectionId}-server`}>
      <h4 id={`${sectionId}-server`}><Server size={15} aria-hidden />{t('client.ssh.serverSection')}</h4>
      <Form.Item name="name" label={t('client.ssh.name')}>
        <Input maxLength={80} placeholder={t('client.ssh.namePlaceholder')} />
      </Form.Item>
      <div className="ssh-address">
        <Form.Item name="host" label={t('client.ssh.host')}
          rules={[{ required: true, whitespace: true, message: t('client.ssh.required') }]}>
          <Input autoComplete="off" maxLength={253} placeholder={t('client.ssh.hostPlaceholder')} />
        </Form.Item>
        <Form.Item name="port" label={t('client.ssh.port')}
          rules={[{ required: true, message: t('client.ssh.required') }]}>
          <InputNumber min={1} max={65535} precision={0} />
        </Form.Item>
      </div>
    </section>
    <section className="ssh-form-section" aria-labelledby={`${sectionId}-auth`}>
      <h4 id={`${sectionId}-auth`}><LockKeyhole size={15} aria-hidden />{t('client.ssh.loginSection')}</h4>
      <Form.Item name="username" label={t('client.ssh.username')}
        rules={[{ required: true, whitespace: true, message: t('client.ssh.required') }]}>
        <Input autoComplete="off" maxLength={256} prefix={<UserRound size={15} aria-hidden />}
          placeholder={t('client.ssh.usernamePlaceholder')} />
      </Form.Item>
      <div role="radiogroup" aria-label={t('client.ssh.authentication')}>
        <Form.Item name="auth" label={t('client.ssh.authentication')}>
          <Radio.Group className="ssh-auth-options">
            <Radio.Button value="password"><LockKeyhole size={15} aria-hidden />
              {t('client.ssh.passwordAuth')}</Radio.Button>
            <Radio.Button value="key"><KeyRound size={15} aria-hidden />
              {t('client.ssh.keyAuth')}</Radio.Button>
          </Radio.Group>
        </Form.Item>
      </div>
      {auth === 'key' ? <>
        <Form.Item name="privateKey" label={t('client.ssh.privateKey')}>
          <SshPrivateKeyInput disabled={disabled} />
        </Form.Item>
        <Form.Item name="passphrase" label={t('client.ssh.passphrase')}>
          <Input.Password autoComplete="new-password" maxLength={4096} />
        </Form.Item>
      </> : <Form.Item name="password" label={t('client.ssh.password')}>
        <Input.Password autoComplete="new-password" maxLength={4096}
          placeholder={t('client.ssh.passwordPlaceholder')} />
      </Form.Item>}
    </section>
    <section className="ssh-form-section">
      <Form.Item name="x11" rules={[{ validator: async (_, value: unknown) => {
        if (value !== undefined && !validSshX11(value)) throw new Error(t('client.ssh.x11InvalidDisplay'));
      } }]}>
        <SshX11Field disabled={disabled} />
      </Form.Item>
    </section>
  </>;
}
