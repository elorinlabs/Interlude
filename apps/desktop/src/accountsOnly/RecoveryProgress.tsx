import { Button } from 'antd';
import { Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { Translate } from '../i18n';

const phases = ['opening', 'credentials', 'callback', 'verifying'] as const;
export function RecoveryProgress({email,count,stage,elapsed,verifying,t,onStop}:{
  email:string;count:number;stage:string;elapsed:number;verifying:boolean;t:Translate;onStop:()=>void;
}) {
  const current=verifying?3:stage==='callback'?2:['email','password','totp'].includes(stage)?1:0;
  const attention=stage==='needsAttention';
  return <section className="recovery-progress glass-operation" aria-label={t('accountsOnly.health.reauthorize')}>
    <div className="operation-heading"><ShieldCheck size={18}/><div>
      <strong>{t('accountsOnly.health.reauthorize')}</strong><p>{email}</p>
    </div><span className="operation-queue">{t('accountsOnly.flow.queue',{count})}</span>
      <Button type="text" onClick={onStop}>{t('table.cancel')}</Button></div>
    <ol className="operation-steps">{phases.map((phase,index)=><li key={phase}
      className={attention?'':index<current?'step-complete':index===current?'step-current':''}
      aria-current={!attention&&index===current?'step':undefined}>
      <span className="step-marker">{!attention&&index<current?<Check size={12}/>:!attention&&index===current?<LoaderCircle size={12} className="operation-spinner"/>:index+1}</span>
      <span>{t(`accountsOnly.flow.${phase}`)}</span>
    </li>)}</ol>
    <div className={`operation-detail${attention?' operation-attention':''}`}>
      <span aria-live="polite">{t(`accountsOnly.recovery.stage.${verifying?'verifying':stage}` as Parameters<Translate>[0])}</span>
      <small>{t(elapsed>=30?'accountsOnly.recovery.stepWaiting':'accountsOnly.recovery.stepElapsed',{seconds:elapsed})}</small>
    </div>
  </section>;
}
