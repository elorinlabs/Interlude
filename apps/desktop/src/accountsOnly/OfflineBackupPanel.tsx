import {useRef,useState} from 'react';
import {Alert,Button,Input,Modal,Radio} from 'antd';
import {Download,HardDrive,Upload} from 'lucide-react';
import {isDesktopApp} from '../api/backend';
import type {Translate} from '../i18n';
import {choosePortableFile,portableBackup,portableBackupError,type BackupMode,type BackupReport} from './portableBackupApi';

interface Props{t:Translate;onSynced:()=>Promise<void>;onBusyChange:(busy:boolean)=>void}
export function OfflineBackupPanel({t,onSynced,onBusyChange}:Props){
  const [mode,setMode]=useState<BackupMode>('export');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [report,setReport]=useState<BackupReport|null>(null);
  const flight=useRef(false);
  const valid=[...password].length>=12&&new TextEncoder().encode(password).length<=1024&&(mode==='import'||password===confirm);
  async function run(path:string){
    try{
      const result=await portableBackup(mode,path,password);
      setReport(result);setPassword('');setConfirm('');
      if(mode==='import')await onSynced();
    }catch(failure){setError(portableBackupError(failure,t));}
    finally{flight.current=false;setBusy(false);onBusyChange(false);}
  }
  async function start(){
    if(flight.current||!valid)return;
    flight.current=true;setBusy(true);onBusyChange(true);setError('');setReport(null);
    try{
      const path=await choosePortableFile(mode);
      if(!path){flight.current=false;setBusy(false);onBusyChange(false);return;}
      if(mode==='import'){
        Modal.confirm({centered:true,width:400,title:t('accountsOnly.backup.restoreTitle'),
          content:t('accountsOnly.backup.restoreHint'),okText:t('accountsOnly.backup.restore'),cancelText:t('table.cancel'),
          onOk:()=>run(path),onCancel:()=>{flight.current=false;setBusy(false);onBusyChange(false);}});
      }else await run(path);
    }catch(failure){flight.current=false;setBusy(false);onBusyChange(false);setError(portableBackupError(failure,t));}
  }
  return <div className="offline-backup">
    <div className="folder-sync-intro"><HardDrive size={20}/><div><strong>{t('accountsOnly.backup.offline')}</strong>
      <p>{t('accountsOnly.backup.description')}</p></div></div>
    <Radio.Group value={mode} disabled={busy} onChange={event=>{setMode(event.target.value);setPassword('');setConfirm('');setError('');setReport(null);}}
      optionType="button" buttonStyle="solid" aria-label={t('accountsOnly.backup.mode')}
      options={[{value:'export',label:t('accountsOnly.backup.export')},{value:'import',label:t('accountsOnly.backup.restore')}]}/>
    <div className="folder-sync-flow">{['file','password','recover'].map((step,index)=><span key={step}><b>{index+1}</b>{t(`accountsOnly.backup.step.${step}` as Parameters<Translate>[0])}</span>)}</div>
    <Alert type="info" showIcon message={t('accountsOnly.backup.includes')}/>
    <label>{t('accountsOnly.backup.password')}<Input.Password aria-label={t('accountsOnly.backup.password')}
      autoComplete="new-password" maxLength={1024} value={password} disabled={busy||!isDesktopApp}
      placeholder={t('accountsOnly.backup.passwordHint')} onChange={event=>setPassword(event.target.value)}/></label>
    {mode==='export'&&<label>{t('accountsOnly.backup.confirmPassword')}<Input.Password aria-label={t('accountsOnly.backup.confirmPassword')}
      autoComplete="new-password" maxLength={1024} value={confirm} disabled={busy||!isDesktopApp} onChange={event=>setConfirm(event.target.value)}/></label>}
    <p className="folder-sync-help">{t('accountsOnly.backup.keepPassword')}</p>
    <Button type="primary" icon={mode==='export'?<Download size={16}/>:<Upload size={16}/>}
      loading={busy} disabled={!isDesktopApp||!valid} onClick={()=>void start()}>{t(mode==='export'?'accountsOnly.backup.chooseSave':'accountsOnly.backup.chooseRestore')}</Button>
    {!isDesktopApp&&<Alert type="info" message={t('accountsOnly.backup.desktopOnly')}/>}
    {error&&<Alert type="error" showIcon message={error}/>}
    {report&&<section className="backup-report" role="status"><strong>{t(mode==='export'?'accountsOnly.backup.exported':'accountsOnly.backup.restored',
      {accounts:report.accounts,logins:report.savedLogins})}</strong><p>{report.path}</p>
      {report.safetyBackup&&<p>{t('accountsOnly.backup.safetyBackup',{path:report.safetyBackup})}</p>}</section>}
  </div>;
}
