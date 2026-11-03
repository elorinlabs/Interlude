import { invoke } from '@tauri-apps/api/core';
import { isDesktopApp } from '../api/backend';
import type { Translate, TranslationKey } from '../i18n';

export interface ModelQuota {model:string;remainingPercent:number|null;resetAt:string|null}
export interface AntigravityAccount {id:string;subject:string;email:string;plan:string;quotas:ModelQuota[];checkedAt:number|null}
export interface AntigravitySnapshot {installed:boolean;activeId:string|null;currentEmail:string|null;accounts:AntigravityAccount[]}
export type AntigravityAction = {kind:'list'|'capture'|'login'|'refresh'|'launch'}|{kind:'switch'|'delete';id:string};
export async function antigravityAction(action:AntigravityAction):Promise<AntigravitySnapshot> {
  if(isDesktopApp)return invoke('antigravity_accounts',{action});
  if(action.kind==='list')return {installed:false,activeId:null,currentEmail:null,accounts:[]};
  throw new Error('unavailable');
}
const errors:Record<string,TranslationKey>={
  unavailable:'accountsOnly.antigravity.error.unavailable',busy:'accountsOnly.antigravity.error.busy',
  credentials:'accountsOnly.antigravity.error.credentials',storage:'accountsOnly.antigravity.error.storage',
  connection:'accountsOnly.antigravity.error.connection',login:'accountsOnly.antigravity.error.login',
  switch:'accountsOnly.antigravity.error.switch',
};
export function antigravityError(error:unknown,t:Translate){
  const code=error instanceof Error?error.message:String(error);
  return t(errors[code]??'accountsOnly.antigravity.error.connection');
}
