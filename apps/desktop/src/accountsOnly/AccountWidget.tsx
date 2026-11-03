import {useCallback,useEffect,useRef,useState} from 'react';
import {ExternalLink,X} from 'lucide-react';
import {useLanguage} from '../hooks/useLanguage';
import {AccountQuota} from './AccountQuota';
import {closeWidget,getWidget,showManager,subscribeAutomation,type WidgetSnapshot} from './automationApi';
import {ModelQuotas} from './ModelQuotas';
import {useAccountTheme} from './useAccountTheme';

export default function AccountWidget(){
  useAccountTheme();
  const {t}=useLanguage();const [state,setState]=useState<WidgetSnapshot|null>(null);const [error,setError]=useState(false);
  const loading=useRef(false);
  const load=useCallback(async()=>{if(loading.current)return;loading.current=true;try{setState(await getWidget());setError(false);}catch{setError(true);}finally{loading.current=false;}},[]);
  useEffect(()=>{
    document.documentElement.classList.add('widget-document');
    let active=true;let stop:(()=>void)|undefined;
    void load();void subscribeAutomation(()=>{if(active)void load();}).then(fn=>{if(active)stop=fn;else fn();});
    return()=>{active=false;stop?.();document.documentElement.classList.remove('widget-document');};
  },[load]);
  const account=state?.account;
  const antigravity=state?.provider==='antigravity';
  const agAccount=state?.antigravity;
  const agStale=Boolean(agAccount?.checkedAt&&Date.now()/1000-agAccount.checkedAt>180);
  const chosen=state?.models??[];
  const quotas=agAccount?.quotas.filter(q=>!chosen.length||chosen.includes(q.model))??[];
  return <section className="usage-widget">
    <header data-tauri-drag-region><img src="/interlude-logo.svg" alt="" draggable={false}/><strong data-tauri-drag-region>Interlude</strong>
      <button onClick={()=>void showManager().catch(()=>setError(true))} aria-label={t('accountsOnly.widget.open')}><ExternalLink size={13}/></button>
      <button onClick={()=>void closeWidget().catch(()=>setError(true))} aria-label={t('accountsOnly.widget.close')}><X size={14}/></button>
    </header>
    <p className="widget-account" title={antigravity?agAccount?.email:account?.email}>
      {antigravity?'Antigravity · ':''}{(antigravity?agAccount?.email:account?.email)||t('accountsOnly.widget.noAccount')}</p>
    {antigravity?<div className="ag-widget-scroll"><ModelQuotas quotas={quotas} compact t={t}/></div>:
      <div className="account-quotas"><AccountQuota window={account?.usage.primary} fallback="table.fiveHours" t={t}/><AccountQuota window={account?.usage.secondary} fallback="table.oneWeek" t={t}/></div>}
    <footer>{antigravity?(error||agStale?t('accountsOnly.widget.stale'):agAccount?.checkedAt?t('accountsOnly.antigravity.checked',{time:new Date(agAccount.checkedAt*1000).toLocaleTimeString()}):t('accountsOnly.antigravity.noQuota')):
      error||state?.refreshStatus==='refreshFailed'?t('accountsOnly.widget.stale'):t('accountsOnly.widget.refreshHint')}</footer>
  </section>;
}
