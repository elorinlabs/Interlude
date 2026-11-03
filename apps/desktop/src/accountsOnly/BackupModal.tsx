import {useState} from 'react';
import {Modal,Tabs} from 'antd';
import type {Translate} from '../i18n';
import {CloudSyncModal} from './CloudSyncModal';
import {OfflineBackupPanel} from './OfflineBackupPanel';
import './folderSync.css';

export function BackupModal({t,onClose,onSynced}:{t:Translate;onClose:()=>void;onSynced:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);
  return <Modal open centered width={560} title={t('accountsOnly.backup.title')} footer={null}
    closable={!busy} maskClosable={!busy} onCancel={()=>{if(!busy)onClose();}}>
    <Tabs defaultActiveKey="offline" items={[
      {key:'offline',label:t('accountsOnly.backup.offline'),disabled:busy,children:<OfflineBackupPanel t={t} onSynced={onSynced} onBusyChange={setBusy}/>},
      {key:'folder',label:t('accountsOnly.folderSync.title'),disabled:busy,children:<CloudSyncModal embedded t={t} onSynced={onSynced} onClose={onClose} onBusyChange={setBusy}/>},
    ]}/>
  </Modal>;
}
