import {useEffect,useState} from 'react';
import {Button,Input,Modal} from 'antd';
import {invoke} from '@tauri-apps/api/core';
import type {Account} from '../types';
import type {Translate} from '../i18n';
import {AuthenticatorImport} from './AuthenticatorImportPanel';
export function SavedLoginModal({account,t,onClose}:{account:Account;t:Translate;onClose:()=>void}){
  const [password,setPassword]=useState('');const [totp,setTotp]=useState('');
  const [enabled,setEnabled]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{let active=true;void invoke<{enabled:boolean}>('saved_login_settings',{action:{kind:'status',id:account.id}})
    .then(value=>{if(active)setEnabled(value.enabled);}).catch(()=>{if(active)setError(t('accountsOnly.recovery.failed'));});
    return()=>{active=false;};},[account.id,t]);
  const save=async(remove=false)=>{
    setBusy(true);setError('');
    try{
      await invoke('saved_login_settings',{action:remove?{kind:'delete',id:account.id}:{kind:'save',id:account.id,password,totp}});
      setPassword('');setTotp('');onClose();
    }catch{setError(t('accountsOnly.recovery.settingsError'));}
    finally{setBusy(false);}
  };
  return <Modal open centered width={420} title={t('accountsOnly.recovery.settings')} onCancel={onClose} footer={null} destroyOnClose>
    <p className="account-login-description">{account.email}</p>
    <p>{t('accountsOnly.recovery.localOnly')}</p>
    {enabled&&<p>{t('accountsOnly.recovery.configured')}</p>}
    <label>{t('accountsOnly.recovery.password')}<Input.Password autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <AuthenticatorImport value={totp} onChange={setTotp} email={account.email} t={t}/>
    {error&&<p role="alert">{error}</p>}
    <div style={{display:'flex',gap:8,marginTop:16}}>
      <Button type="primary" loading={busy} disabled={!password||!totp} onClick={()=>void save()}>{t('accountsOnly.recovery.save')}</Button>
      {enabled&&<Button danger disabled={busy} onClick={()=>void save(true)}>{t('accountsOnly.recovery.remove')}</Button>}
    </div>
  </Modal>;
}
