import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktopApp } from '../api/backend';
import type { UsageSummary } from '../types';

export interface AutomationConfig { widgetEnabled: boolean; widgetProvider?:string|null; widgetModels?:string[]; preheatIds: string[]; relay: {threadId:string;accountIds:string[]} | null }
export interface PreheatPlan { nextAt:number;lastSentAt:number|null;inFlight:boolean;retryAt:number;status:string;lastError?:string|null }
export interface AutomationSnapshot {
  config:AutomationConfig;plans:Record<string,PreheatPlan>;relayStatus:string;lastRefreshAt:number;refreshStatus:string;
}
export interface LocalGoal {threadId:string;goalId:string;objective:string;status:string;tokenBudget:number|null;tokensUsed:number;title:string}
export interface WidgetSnapshot {account:{id:string;email:string;usage:UsageSummary}|null;refreshStatus:string;
  provider?:string;models?:string[];antigravity?:import('./antigravityApi').AntigravityAccount|null}
const previewKey='interlude:automation-preview';
const empty:AutomationSnapshot={config:{widgetEnabled:false,preheatIds:[],relay:null},plans:{},relayStatus:'off',lastRefreshAt:0,refreshStatus:'updated'};
export async function getAutomation():Promise<AutomationSnapshot> {
  if(isDesktopApp)return invoke('get_local_automation');
  try{return JSON.parse(localStorage.getItem(previewKey)||'null')||structuredClone(empty);}catch{return structuredClone(empty);}
}
export async function saveAutomation(config:AutomationConfig):Promise<AutomationSnapshot> {
  if(isDesktopApp)return invoke('save_local_automation',{config});
  const state=await getAutomation();state.config=config;
  localStorage.setItem(previewKey,JSON.stringify(state));window.dispatchEvent(new Event('interlude-preview-state'));
  return state;
}
export async function listGoals():Promise<LocalGoal[]> {return isDesktopApp?invoke('list_local_goals'):[];}
export async function getWidget():Promise<WidgetSnapshot> {return isDesktopApp?invoke('get_account_widget'):{account:null,refreshStatus:'updated'};}
export async function showManager(){if(isDesktopApp)await invoke('show_account_manager');}
export async function closeWidget(){const state=await getAutomation();await saveAutomation({...state.config,widgetEnabled:false});}
export async function subscribeAutomation(callback:()=>void):Promise<()=>void> {
  if(isDesktopApp){
    const unlisten=await Promise.all([listen('interlude-state-updated',callback),listen('accounts-changed',callback)]);
    return()=>unlisten.forEach(stop=>stop());
  }
  window.addEventListener('interlude-preview-state',callback);
  return()=>window.removeEventListener('interlude-preview-state',callback);
}
