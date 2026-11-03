import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Select, Switch } from 'antd';
import { Check, Cloud, Copy, FolderOpen, KeyRound, RefreshCw } from 'lucide-react';
import type { Translate } from '../i18n';
import { copyText } from '../utils/clipboard';
import { chooseSyncFolder, chooseLegacyBackup, folderProviders, folderSync, folderSyncError, generateRecoveryKey,
  subscribeFolderSync, type FolderProvider, type FolderSyncState, type FolderAction } from './folderSyncApi';
import './folderSync.css';

interface Props { t:Translate;onClose:()=>void;onSynced:()=>Promise<void>;embedded?:boolean;onBusyChange?:(busy:boolean)=>void }

export function CloudSyncModal({t,onClose,onSynced,embedded=false,onBusyChange}:Props) {
  const [state,setState]=useState<FolderSyncState|null>(null);
  const [folder,setFolder]=useState('');
  const [provider,setProvider]=useState<FolderProvider>('nutstore');
  const [enabled,setEnabled]=useState(true);
  const [key,setKey]=useState('');
  const [generated,setGenerated]=useState(false);
  const [acknowledged,setAcknowledged]=useState(false);
  const [selected,setSelected]=useState<string>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const inFlight=useRef(false);
  const initialized=useRef(false);
  const load=useCallback(async()=>{
    if(inFlight.current)return;
    inFlight.current=true;
    try {
      const next=await folderSync({kind:'status'});setState(next);
      if(!initialized.current){initialized.current=true;setFolder(next.folder??'');
        if(next.folder){setProvider(next.provider);setEnabled(next.enabled);}}
    } catch(failure){setError(folderSyncError(failure,t));}
    finally{inFlight.current=false;}
  },[t]);
  useEffect(()=>{
    let active=true;let stop:(()=>void)|undefined;
    void load();
    void subscribeFolderSync(()=>{if(active)void load();}).then(fn=>{if(active)stop=fn;else fn();})
      .catch(failure=>{if(active)setError(folderSyncError(failure,t));});
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},30_000);
    return()=>{active=false;stop?.();window.clearInterval(timer);};
  },[load]);
  async function run(action:FolderAction) {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);onBusyChange?.(true);setError('');setMessage('');
    try {
      const next=await folderSync(action);setState(next);
      if(action.kind==='configure'){setFolder(next.folder??'');setKey('');setGenerated(false);setAcknowledged(false);}
      if(action.kind==='disconnect'){setFolder('');setKey('');setSelected(undefined);}
      if(action.kind==='restore'||action.kind==='importLegacy'){await onSynced();setMessage(t('accountsOnly.folderSync.restored',{count:next.restored??0}));}
      if(action.kind==='backup')setMessage(t(next.lastBackupAt?'accountsOnly.folderSync.backedUp':'accountsOnly.folderSync.nothing'));
    } catch(failure){setError(folderSyncError(failure,t));}
    finally{inFlight.current=false;setBusy(false);onBusyChange?.(false);}
  }
  const disabled=busy||!state?.available;
  const guide=provider==='nutstore'?'nutstore':provider==='onedrive'?'onedrive':'other';
  const ready=Boolean(folder.trim()&&(key.trim()?/^[a-f\d]{64}$/i.test(key.trim()):state?.keyConfigured)&&(!generated||acknowledged));
  const content=<div className="folder-sync">
      <div className="folder-sync-intro"><Cloud size={20}/><div><strong>{t('accountsOnly.folderSync.localOnly')}</strong>
        <p>{t('accountsOnly.folderSync.description')}</p></div></div>
      {state&&!state.available&&<Alert type="info" showIcon message={t('accountsOnly.folderSync.desktopOnly')}/>}
      <div className="folder-sync-flow" aria-label={t('accountsOnly.folderSync.flow')}>
        {['folder','key','backup'].map((step,index)=><span key={step}><b>{index+1}</b>{t(`accountsOnly.folderSync.step.${step}` as Parameters<Translate>[0])}</span>)}
      </div>
      <label>{t('accountsOnly.folderSync.provider')}<Select value={provider} disabled={disabled} onChange={setProvider}
        aria-label={t('accountsOnly.folderSync.provider')}
        options={folderProviders.map(value=>({value,label:t(`accountsOnly.folderSync.provider.${value}` as Parameters<Translate>[0])}))}/></label>
      <p className="folder-sync-help">{t(`accountsOnly.folderSync.guide.${guide}` as Parameters<Translate>[0])}</p>
      <label>{t('accountsOnly.folderSync.folder')}<div className="folder-sync-path"><Input readOnly value={folder}
        aria-label={t('accountsOnly.folderSync.folder')} placeholder={t('accountsOnly.folderSync.noFolder')}/>
        <Button icon={<FolderOpen size={15}/>} disabled={disabled} onClick={()=>void chooseSyncFolder().then(value=>{if(value){setFolder(value);setMessage('');}}).catch(failure=>setError(folderSyncError(failure,t)))}>{t('accountsOnly.localSync.choose')}</Button></div></label>
      <label>{t('accountsOnly.folderSync.key')}<Input.Password autoComplete="off" value={key} maxLength={64} disabled={disabled}
        aria-label={t('accountsOnly.folderSync.key')} placeholder={t(state?.keyConfigured?'accountsOnly.folderSync.keySaved':'accountsOnly.folderSync.keyPlaceholder')}
        onChange={event=>{setKey(event.target.value);setGenerated(false);setAcknowledged(false);setMessage('');}}/></label>
      <div className="folder-sync-actions"><Button size="small" icon={<KeyRound size={14}/>} disabled={disabled}
        onClick={()=>{setKey(generateRecoveryKey());setGenerated(true);setAcknowledged(false);setMessage('');}}>{t('accountsOnly.folderSync.generate')}</Button>
        {key&&<Button size="small" icon={<Copy size={14}/>} disabled={disabled} onClick={()=>void copyText(key).then(()=>setMessage(t('accountsOnly.folderSync.keyCopied'))).catch(failure=>setError(folderSyncError(failure,t)))}>{t('accountsOnly.folderSync.copyKey')}</Button>}</div>
      <p className="folder-sync-help">{t('accountsOnly.folderSync.keyHint')}</p>
      {generated&&<Checkbox checked={acknowledged} disabled={disabled} onChange={event=>setAcknowledged(event.target.checked)}>{t('accountsOnly.folderSync.keyAcknowledged')}</Checkbox>}
      <div className="folder-sync-auto"><label><Switch checked={enabled} disabled={disabled} onChange={setEnabled}/><span>{t('accountsOnly.folderSync.auto')}</span></label>
        <Button type="primary" disabled={disabled||!ready} loading={busy} onClick={()=>void run({kind:'configure',folder,provider,key:key||undefined,enabled})}>{t('accountsOnly.folderSync.save')}</Button></div>
      <p className="folder-sync-help">{t('accountsOnly.folderSync.autoHint')}</p>
      {state?.folder&&<section className="folder-sync-backups">
        <div className="folder-sync-actions"><Button icon={<RefreshCw size={14}/>} loading={busy} disabled={disabled} onClick={()=>void run({kind:'backup'})}>{t('accountsOnly.folderSync.backupNow')}</Button>
          <Button disabled={disabled} onClick={()=>void run({kind:'openFolder'})}>{t('accountsOnly.folderSync.open')}</Button>
          <Button type="text" disabled={disabled} onClick={()=>void run({kind:'disconnect'})}>{t('accountsOnly.folderSync.disconnect')}</Button></div>
        <small>{state.lastBackupAt?t('accountsOnly.folderSync.lastBackup',{time:new Date(state.lastBackupAt).toLocaleString()}):t('accountsOnly.folderSync.notBackedUp')}</small>
        <p className="folder-sync-help">{t('accountsOnly.folderSync.transferHint')}</p>
        <label>{t('accountsOnly.folderSync.restoreFrom')}<Select value={selected} disabled={disabled} onChange={setSelected}
          aria-label={t('accountsOnly.folderSync.restoreFrom')} placeholder={t('accountsOnly.folderSync.selectBackup')}
          options={state.snapshots.map(snapshot=>({value:snapshot.id,label:`${new Date(snapshot.savedAt).toLocaleString()} · ${t(snapshot.local?'accountsOnly.folderSync.thisDevice':'accountsOnly.folderSync.otherDevice')} · ${(snapshot.size/1024).toFixed(1)} KB`}))}/></label>
        <Button disabled={disabled||!selected} onClick={()=>Modal.confirm({centered:true,width:400,title:t('accountsOnly.folderSync.restoreTitle'),
          content:t('accountsOnly.folderSync.restoreHint'),okText:t('accountsOnly.folderSync.restore'),cancelText:t('table.cancel'),
          onOk:()=>run({kind:'restore',id:selected!})})}>{t('accountsOnly.folderSync.restore')}</Button>
        <Button type="text" disabled={disabled} onClick={()=>void chooseLegacyBackup().then(path=>{
          if(path)Modal.confirm({centered:true,width:400,title:t('accountsOnly.folderSync.restoreTitle'),
            content:t('accountsOnly.folderSync.restoreHint'),okText:t('accountsOnly.folderSync.restore'),cancelText:t('table.cancel'),
            onOk:()=>run({kind:'importLegacy',path})});
        }).catch(failure=>setError(folderSyncError(failure,t)))}>{t('accountsOnly.folderSync.legacy')}</Button>
      </section>}
      {(error||state?.error)&&<Alert type="error" showIcon message={error||folderSyncError(state?.error,t)}/>}
      {message&&<p className="folder-sync-message" role="status"><Check size={14}/>{message}</p>}
    </div>;
  return embedded?content:<Modal open centered width={540} title={t('accountsOnly.folderSync.title')} footer={null}
    onCancel={()=>{if(!busy)onClose();}} closable={!busy} maskClosable={!busy}>{content}</Modal>;
}
