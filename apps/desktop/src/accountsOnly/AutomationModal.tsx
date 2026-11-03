import {useEffect,useState} from 'react';
import {Button,Modal,Select,Switch} from 'antd';
import {RefreshCw} from 'lucide-react';
import type {Account} from '../types';
import type {Translate} from '../i18n';
import {listGoals,type AutomationConfig,type AutomationSnapshot,type LocalGoal} from './automationApi';

export function AutomationModal({accounts,state,saving,t,onClose,onSave}:{
  accounts:Account[];state:AutomationSnapshot;saving:boolean;t:Translate;onClose:()=>void;
  onSave:(config:AutomationConfig)=>Promise<boolean>;
}){
  const [preheatIds,setPreheatIds]=useState(state.config.preheatIds);
  const [relayEnabled,setRelayEnabled]=useState(Boolean(state.config.relay));
  const [threadId,setThreadId]=useState(state.config.relay?.threadId);
  const [relayIds,setRelayIds]=useState(state.config.relay?.accountIds||accounts.map(account=>account.id));
  const [goals,setGoals]=useState<LocalGoal[]>([]);const [loading,setLoading]=useState(false);const [loadFailed,setLoadFailed]=useState(false);
  const refresh=async()=>{setLoading(true);try{setGoals(await listGoals());setLoadFailed(false);}catch{setLoadFailed(true);}finally{setLoading(false);}};
  useEffect(()=>{let active=true;setLoading(true);void listGoals().then(value=>{if(active)setGoals(value);}).catch(()=>{if(active)setLoadFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const options=accounts.map(account=>({label:account.email,value:account.id}));
  const save=async()=>{
    const config:AutomationConfig={...state.config,preheatIds,relay:relayEnabled&&threadId?{threadId,accountIds:relayIds}:null};
    if(await onSave(config))onClose();
  };
  return <Modal open centered width={580} title={t('accountsOnly.automation.title')} onCancel={onClose}
    onOk={()=>void save()} confirmLoading={saving} okText={t('accountsOnly.automation.save')}
    cancelText={t('table.cancel')} okButtonProps={{disabled:relayEnabled&&(!threadId||!relayIds.length)}}>
    <div className="automation-sections">
      <section><div className="automation-heading"><h3>{t('accountsOnly.preheat.title')}</h3>
        <Switch checked={preheatIds.length>0} disabled={!accounts.length||saving}
          aria-label={t('accountsOnly.preheat.title')} onChange={enabled=>setPreheatIds(enabled?accounts.map(account=>account.id):[])}/></div>
        <p>{t('accountsOnly.preheat.description')}</p>
        {preheatIds.length>0&&<Select mode="multiple" value={preheatIds} options={options} onChange={setPreheatIds}
          aria-label={t('accountsOnly.preheat.accounts')} placeholder={t('accountsOnly.preheat.accounts')} maxTagCount="responsive"/>}
        <small>{t('accountsOnly.preheat.safety')}</small>
        <div className="automation-plan-list">{Object.entries(state.plans).filter(([id])=>preheatIds.includes(id)).map(([id,plan])=><div className="automation-plan" key={id}>
          <span>{accounts.find(account=>account.id===id)?.email||id}</span>
          <span>{t(`accountsOnly.automation.status.${plan.status}` as Parameters<Translate>[0])}
            {plan.lastError&&<small className="automation-error-detail" title={plan.lastError}>{plan.lastError}</small>}
            {plan.nextAt>0&&!plan.inFlight&&` · ${new Date(Math.max(plan.nextAt,plan.retryAt)*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`}</span>
        </div>)}</div>
      </section>
      <section><div className="automation-heading"><h3>{t('accountsOnly.relay.title')}</h3>
        <Switch checked={relayEnabled} disabled={saving} aria-label={t('accountsOnly.relay.title')} onChange={setRelayEnabled}/></div>
        <p>{t('accountsOnly.relay.description')}</p>
        <div className="relay-goal-picker"><Select value={threadId} onChange={setThreadId} loading={loading}
          options={goals.filter(goal=>goal.status!=='complete'&&goal.status!=='budget_limited').map(goal=>({value:goal.threadId,label:(goal.title||goal.objective).replace(/\s+/g,' ').slice(0,80)}))}
          aria-label={t('accountsOnly.relay.goal')} placeholder={t('accountsOnly.relay.goal')} disabled={!relayEnabled}/>
          <Button icon={<RefreshCw size={14}/>} aria-label={t('actions.refresh')} loading={loading} onClick={()=>void refresh()}/></div>
        {loadFailed&&<small className="automation-warning">{t('accountsOnly.relay.loadFailed')}</small>}
        {!loading&&!loadFailed&&!goals.length&&<small>{t('accountsOnly.relay.noGoals')}</small>}
        {relayEnabled&&<Select mode="multiple" value={relayIds} options={options} onChange={setRelayIds}
          aria-label={t('accountsOnly.relay.accounts')} placeholder={t('accountsOnly.relay.accounts')} maxTagCount="responsive"/>}
        <small>{t('accountsOnly.relay.safety')}</small>
        {state.config.relay&&<div className="relay-status" role="status">{t(`accountsOnly.automation.status.${state.relayStatus||'watching'}` as Parameters<Translate>[0])}</div>}
      </section>
    </div>
  </Modal>;
}
