import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { isDesktopApp } from '../api/backend';
import type { Translate } from '../i18n';

export const folderProviders = ['nutstore','baidu','aliyun','quark','weiyun','123pan','onedrive','other'] as const;
export type FolderProvider = typeof folderProviders[number];
export interface FolderSnapshot { id:string; savedAt:number; size:number; local:boolean }
export interface FolderSyncState {
  available:boolean;folder:string|null;provider:FolderProvider;enabled:boolean;keyConfigured:boolean;
  lastBackupAt:number|null;error:string|null;snapshots:FolderSnapshot[];restored:number|null;
}
export type FolderAction = {kind:'status'|'disconnect'|'backup'|'openFolder'}
  | {kind:'configure';folder:string;provider:FolderProvider;key?:string;enabled:boolean}
  | {kind:'restore';id:string} | {kind:'importLegacy';path:string};

export async function folderSync(action:FolderAction):Promise<FolderSyncState> {
  if (!isDesktopApp) return {available:false,folder:null,provider:'other',enabled:false,keyConfigured:false,
    lastBackupAt:null,error:null,snapshots:[],restored:null};
  return {...await invoke<Omit<FolderSyncState,'available'>>('local_folder_sync',{action}),available:true};
}
export async function chooseSyncFolder():Promise<string|null> {
  if (!isDesktopApp) return null;
  const value=await open({directory:true,multiple:false});
  return typeof value==='string'?value:null;
}
export async function chooseLegacyBackup():Promise<string|null> {
  if (!isDesktopApp) return null;
  const value=await open({multiple:false,filters:[{name:'Interlude',extensions:['cs']}]});
  return typeof value==='string'?value:null;
}
export function generateRecoveryKey():string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function folderSyncError(error:unknown,t:Translate):string {
  const key=String(error).replace(/^Error: /,'');
  const suffix:Record<string,string>={folderSyncIo:'io',folderSyncFolder:'folder',folderSyncFormat:'format',
    folderSyncKey:'key',folderSyncKeyStore:'keyStore',folderSyncBusy:'busy',folderSyncMissing:'missing',
    backupVault:'vault',backupRollback:'rollback'};
  return t(`accountsOnly.folderSync.error.${suffix[key]??'io'}` as Parameters<Translate>[0]);
}
export async function subscribeFolderSync(callback:()=>void):Promise<()=>void> {
  return isDesktopApp?listen('interlude-folder-sync-updated',callback):()=>{};
}
