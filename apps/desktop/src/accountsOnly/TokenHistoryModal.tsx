import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Select, Segmented, Spin, Table, Tooltip } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { isDesktopApp } from '../api/backend';
import type { Account } from '../types';
import type { Translate } from '../i18n';

type Entry = { timestamp:number; accountId:string|null; model:string; input:number; output:number; cached:number; reasoning:number; total:number };
type History = { entries:Entry[]; unreadableFiles:number };
const fields = ['total','input','output','cached','reasoning'] as const;
const day = (ts:number) => { const d=new Date(ts*1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const number = (value:number) => value.toLocaleString(undefined,{maximumFractionDigits:0});
export function TokenHistoryModal({accounts,t,onClose}:{accounts:Account[];t:Translate;onClose:()=>void}) {
  const [history,setHistory]=useState<History>({entries:[],unreadableFiles:0});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [account,setAccount]=useState('*');
  const [mode,setMode]=useState('daily');
  const refresh=async()=>{
    setLoading(true);setError('');
    try { setHistory(isDesktopApp?await invoke<History>('get_native_token_history'):{entries:[],unreadableFiles:0}); }
    catch(e){setError(String(e));} finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  const entries=useMemo(()=>history.entries.filter(e=>account==='*'||(account==='?'?!e.accountId:e.accountId===account)),[history,account]);
  const totals=fields.map(key=>entries.reduce((sum,e)=>sum+e[key],0));
  const dayDetails=new Map<string,Entry>();
  entries.forEach(e=>{const key=day(e.timestamp);const row=dayDetails.get(key)??{...e,input:0,output:0,cached:0,reasoning:0,total:0};fields.forEach(field=>row[field]+=e[field]);dayDetails.set(key,row);});
  const daily=new Map<string,number>();
  entries.forEach(e=>daily.set(day(e.timestamp),(daily.get(day(e.timestamp))??0)+e.total));
  const max=[...daily.values()].reduce((a,b)=>Math.max(a,b),1);
  const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today);start.setDate(start.getDate()-364-start.getDay());
  const calendar=Array.from({length:371},(_,i)=>{const date=new Date(start);date.setDate(start.getDate()+i);return date;});
  const groups=new Map<string,Entry>();
  const cumulative={input:0,output:0,cached:0,reasoning:0,total:0};
  for(const e of entries){
    const date=new Date(e.timestamp*1000);
    if(mode==='weekly')date.setDate(date.getDate()-(date.getDay()+6)%7);
    const key=day(date.getTime()/1000);
    const row=groups.get(key)??{...e,input:0,output:0,cached:0,reasoning:0,total:0};
    fields.forEach(field=>row[field]+=e[field]);groups.set(key,row);
  }
  const rows=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,row])=>{
    fields.forEach(field=>cumulative[field]+=row[field]);
    return {...row,...(mode==='cumulative'?cumulative:{}),date};
  }).reverse();
  const modelTotals=new Map<string,number>();entries.forEach(e=>modelTotals.set(e.model,(modelTotals.get(e.model)??0)+e.total));
  return <Modal open centered width={900} title={t('accountsOnly.tokens.title')} onCancel={onClose} footer={null}>
    <div className="token-history-controls">
      <Select value={account} onChange={setAccount} options={[{value:'*',label:t('accountsOnly.tokens.all')},{value:'?',label:t('accountsOnly.tokens.unknown')},...accounts.filter(a=>a.accountId).map(a=>({value:a.accountId!,label:a.email}))]}/>
      <Button loading={loading} onClick={()=>void refresh()}>{t('accountsOnly.tokens.refresh')}</Button>
    </div>
    <p className="token-history-coverage">{t('accountsOnly.tokens.coverage')}</p>
    {error&&<Alert type="error" message={error}/>}
    {history.unreadableFiles>0&&<Alert type="warning" message={`${t('accountsOnly.tokens.partial')} (${history.unreadableFiles})`}/>}
    <Spin spinning={loading}><div className="token-history-totals">{fields.map((key,i)=><div key={key}><small>{t(`accountsOnly.tokens.${key}`)}</small><strong>{entries.length?number(totals[i]):'—'}</strong></div>)}</div>
      <div className="token-history-calendar" aria-label={t('accountsOnly.tokens.daily')}>
        {calendar.map(date=>{const key=day(date.getTime()/1000);const value=daily.get(key)??0;return <Tooltip key={key} title={<div>{key}{fields.map(field=><div key={field}>{t(`accountsOnly.tokens.${field}`)} · {number(dayDetails.get(key)?.[field]??0)}</div>)}</div>}><button type="button" aria-label={`${key} · ${number(value)} Token`} disabled={date>today} style={{background:value?`rgba(49,95,116,${0.2+0.8*value/max})`:undefined}}/></Tooltip>;})}
      </div>
      <div className="token-history-models">{[...modelTotals].sort((a,b)=>b[1]-a[1]).map(([model,total])=><span key={model}>{model} <b>{number(total)}</b></span>)}</div>
      <Segmented value={mode} onChange={value=>setMode(String(value))} options={['daily','weekly','cumulative'].map(value=>({value,label:t(`accountsOnly.tokens.${value}` as Parameters<Translate>[0])}))}/>
      <Table size="small" rowKey="date" dataSource={rows} pagination={{pageSize:7,showSizeChanger:false}} scroll={{x:650}} locale={{emptyText:t('accountsOnly.tokens.empty')}} columns={[{title:t('accountsOnly.tokens.date'),dataIndex:'date'},...fields.map(key=>({title:t(`accountsOnly.tokens.${key}`),dataIndex:key,render:number,align:'left' as const}))]}/>
    </Spin>
  </Modal>;
}
