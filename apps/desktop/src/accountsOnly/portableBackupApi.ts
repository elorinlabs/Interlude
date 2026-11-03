import {invoke} from '@tauri-apps/api/core';
import {open,save} from '@tauri-apps/plugin-dialog';
import {isDesktopApp} from '../api/backend';
import type {Translate} from '../i18n';

export interface BackupReport {path:string;accounts:number;savedLogins:number;safetyBackup:string|null}
export type BackupMode='export'|'import';
export async function choosePortableFile(mode:BackupMode):Promise<string|null>{
  if(!isDesktopApp)return null;
  const filters=[{name:'Interlude',extensions:['interlude-backup']}];
  const file=mode==='export'?await save({defaultPath:`Interlude-${new Date().toLocaleDateString('sv-SE')}.interlude-backup`,filters})
    :await open({multiple:false,filters});
  return typeof file==='string'?file:null;
}
export async function portableBackup(kind:BackupMode,path:string,password:string):Promise<BackupReport>{
  if(!isDesktopApp)throw new Error('backupDesktop');
  return invoke('portable_account_backup',{action:{kind,path,password}});
}
export function portableBackupError(error:unknown,t:Translate):string{
  const code=String(error).replace(/^Error: /,'');
  const errors:Record<string,string>={backupPassword:'passwordError',backupDecrypt:'decryptError',
    backupFormat:'formatError',folderSyncFormat:'formatError',backupFile:'fileError',folderSyncIo:'fileError',
    backupEmpty:'emptyError',backupVault:'vaultError',backupRollback:'rollbackError',
    folderSyncBusy:'busyError',backupDesktop:'desktopOnly'};
  return t(`accountsOnly.backup.${errors[code]??'fileError'}` as Parameters<Translate>[0]);
}
