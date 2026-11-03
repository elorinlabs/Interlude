import type { Translate } from '../i18n';
import type { ModelQuota } from './antigravityApi';

export function ModelQuotas({quotas,t,compact=false}:{quotas:ModelQuota[];t:Translate;compact?:boolean}){
  if(!quotas.length)return <p className="ag-quota-empty">{t('accountsOnly.antigravity.noQuota')}</p>;
  return <div className={`ag-model-quotas${compact?' ag-model-quotas-compact':''}`}>
    {quotas.map((quota,index)=>{
      const percent=quota.remainingPercent;
      const valid=percent!==null&&Number.isFinite(percent)&&percent>=0&&percent<=100;
      const reset=quota.resetAt?new Date(quota.resetAt):null;
      const resetText=reset&&Number.isFinite(reset.getTime())?reset.toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):null;
      return <div className={`ag-model-quota ${valid&&percent<=10?'quota-critical':valid&&percent<=25?'quota-low':''}`} key={`${quota.model}-${index}`}>
        <div className="ag-model-line"><span title={quota.model}>{quota.model}</span>
          <strong>{valid?`${Math.round(percent)}%`:'—'}</strong></div>
        <div className="quota-track" role="meter" aria-label={quota.model} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={valid?percent:undefined} aria-valuetext={valid?t('accountsOnly.antigravity.remaining',{percent:Math.round(percent)}):t('accountsOnly.antigravity.noQuota')}>
          <span style={{width:`${valid?percent:0}%`}}/>
        </div>
        {!compact&&<small>{resetText?t('accountsOnly.antigravity.reset',{time:resetText}):t('accountsOnly.antigravity.remainingHint')}</small>}
      </div>;
    })}
  </div>;
}
