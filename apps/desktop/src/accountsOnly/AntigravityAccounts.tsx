import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Input,Modal,Select,Switch} from 'antd';
import {ArrowUpRight,Check,Play,Plus,RefreshCw,Search,Trash2} from 'lucide-react';
import type {Translate} from '../i18n';
import {antigravityAction,antigravityError,type AntigravityAction,type AntigravitySnapshot} from './antigravityApi';
import {ModelQuotas} from './ModelQuotas';
import type {AutomationSnapshot,AutomationConfig} from './automationApi';
import {listen} from '@tauri-apps/api/event';
import {isDesktopApp} from '../api/backend';

interface Props {t:Translate;notify:(message:string)=>void;automation:AutomationSnapshot|null;
  saving:boolean;save:(config:AutomationConfig)=>Promise<unknown>}
export function AntigravityAccounts({t,notify,automation,saving,save}:Props){
  const [state,setState]=useState<AntigravitySnapshot|null>(null);
  const [busy,setBusy]=useState<string|null>(null);const flight=useRef(false);
  const [query,setQuery]=useState('');const [add,setAdd]=useState(false);
  const run=useCallback(async(action:AntigravityAction)=>{
    if(flight.current)return;
    flight.current=true;setBusy(action.kind);
    try{setState(await antigravityAction(action));}
    catch(error){notify(antigravityError(error,t));}
    finally{flight.current=false;setBusy(null);}
  },[notify,t]);
  useEffect(()=>{void run({kind:'list'});},[run]);
  useEffect(()=>{
    if(!add)return;
    const refresh=()=>void run({kind:'list'});
    window.addEventListener('focus',refresh);
    const timer=window.setInterval(refresh,5000);
    return()=>{window.removeEventListener('focus',refresh);window.clearInterval(timer);};
  },[add,run]);
  useEffect(()=>{
    if(!isDesktopApp)return;
    let active=true;let stop:(()=>void)|undefined;
    void listen('interlude-antigravity-updated',()=>{if(active)void run({kind:'list'});})
      .then(fn=>{if(active)stop=fn;else fn();});
    return()=>{active=false;stop?.();};
  },[run]);
  const accounts=state?.accounts.filter(a=>a.email.toLowerCase().includes(query.trim().toLowerCase()))??[];
  const active=state?.accounts.find(a=>a.id===state.activeId);
  const config=automation?.config;
  const widgetEnabled=Boolean(config?.widgetEnabled&&config.widgetProvider==='antigravity');
  const remove=(id:string)=>Modal.confirm({title:t('table.deleteConfirmTitle'),
    content:t('accountsOnly.antigravity.removeHint'),okText:t('table.delete'),cancelText:t('table.cancel'),
    okButtonProps:{danger:true},width:400,centered:true,onOk:()=>run({kind:'delete',id})});
  return <main className="accounts-content ag-content">
    <div className="accounts-intro"><div><h1>Antigravity</h1><p>{t('accountsOnly.antigravity.description')}</p></div>
      <div className="ag-intro-actions"><Button icon={<Play size={14}/>} disabled={busy!==null} loading={busy==='launch'}
        onClick={()=>void run({kind:'launch'})}>{t('accountsOnly.antigravity.launch')}</Button>
        <Button type="primary" size="large" icon={<Plus size={17}/>} disabled={busy!==null} onClick={()=>setAdd(true)}>{t('accountsOnly.add')}</Button></div>
    </div>
    <div className="accounts-preferences ag-preferences">
      <label><Switch size="small" checked={widgetEnabled} loading={saving} disabled={!config}
        aria-label={t('accountsOnly.widget.toggle')} onChange={enabled=>{if(config)void save({...config,widgetEnabled:enabled,widgetProvider:'antigravity'});}}/>
        <span>{t('accountsOnly.widget.toggle')}</span></label>
      <Select className="ag-widget-models" mode="multiple" maxTagCount={1} maxTagTextLength={16}
        aria-label={t('accountsOnly.antigravity.widgetModels')} placeholder={t('accountsOnly.antigravity.widgetModels')}
        value={config?.widgetModels??[]} disabled={!config||saving} allowClear
        options={[...new Set(active?.quotas.map(q=>q.model)??[])].map(model=>({value:model,label:model}))}
        onChange={models=>{if(config)void save({...config,widgetModels:models});}}/>
      <span className="ag-hint">{t('accountsOnly.antigravity.widgetHint')}</span>
    </div>
    <section className="accounts-glass-panel" aria-label="Antigravity">
      <div className="accounts-toolbar"><div className="accounts-count">{t('accountsOnly.count',{count:state?.accounts.length??0})}</div>
        <div className="accounts-tools"><Input prefix={<Search size={15}/>} value={query} allowClear aria-label={t('accountsOnly.antigravity.search')}
          placeholder={t('accountsOnly.antigravity.search')} onChange={event=>setQuery(event.target.value)}/>
          <Button type="text" icon={<RefreshCw size={15}/>} loading={busy==='refresh'||busy==='list'}
            disabled={busy!==null||!state?.activeId} onClick={()=>void run({kind:'refresh'})}>{t('accountsOnly.antigravity.refresh')}</Button></div></div>
      <p className="ag-hint">{t('accountsOnly.antigravity.cacheHint')}</p>
      {!state?.installed&&<p className="ag-hint">{t('accountsOnly.antigravity.error.unavailable')}</p>}
      {!accounts.length&&<div className="accounts-empty"><p>{t(query?'accountsOnly.noResults':'accountsOnly.antigravity.empty')}</p></div>}
      <div className="ag-account-list">{accounts.map(account=>{
        const current=account.id===state?.activeId;
        return <article className={`ag-account${current?' ag-account-active':''}`} key={account.id}>
          <div className="ag-account-header"><div className="ag-account-identity"><strong title={account.email}>{account.email}</strong>
            <div className="ag-account-meta">{account.plan&&<span className="account-plan">{account.plan}</span>}
              {current&&<span className="account-current"><Check size={12}/>{t('accountsOnly.antigravity.current')}</span>}</div></div>
            <div className="ag-account-actions"><Button size="small" disabled={busy!==null||current} icon={<ArrowUpRight size={13}/>}
              loading={busy==='switch'} onClick={()=>void run({kind:'switch',id:account.id})}>{t('accountsOnly.switch')}</Button>
              <Button type="text" danger size="small" disabled={busy!==null} icon={<Trash2 size={13}/>}
                aria-label={t('table.delete')} onClick={()=>remove(account.id)}/></div></div>
          <details className="ag-quota-details" open={current||undefined}><summary>{t('accountsOnly.antigravity.models',{count:account.quotas.length})}
            <span>{account.checkedAt?t('accountsOnly.antigravity.checked',{time:new Date(account.checkedAt*1000).toLocaleString()}):t('accountsOnly.antigravity.noQuota')}</span></summary>
            <div className="ag-quota-scroll"><ModelQuotas quotas={account.quotas} t={t}/></div></details>
        </article>;
      })}</div>
    </section>
    {add&&<Modal open centered title={t('accountsOnly.add')} footer={null} width={440} onCancel={()=>setAdd(false)}>
      <p className="account-login-description">{t('accountsOnly.antigravity.addHint')}</p>
      <button className="login-choice" onClick={()=>{setAdd(false);void run({kind:'capture'});}} disabled={busy!==null||!state?.currentEmail}>
        <Plus size={19}/><span><b>{t('accountsOnly.antigravity.capture')}</b><small>{state?.currentEmail??t('accountsOnly.antigravity.noCurrent')}</small></span></button>
      <button className="login-choice" disabled={busy!==null||!state?.installed} onClick={()=>{void run({kind:'login'});}}>
        <ArrowUpRight size={19}/><span><b>{t('accountsOnly.antigravity.login')}</b><small>{t('accountsOnly.antigravity.loginHint')}</small></span></button>
    </Modal>}
    {busy==='login'&&<p className="ag-login-status" role="status">{t('accountsOnly.antigravity.waitingLogin')}</p>}
  </main>;
}
