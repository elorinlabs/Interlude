import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {invoke} from '@tauri-apps/api/core';
import {useCallback,useEffect,useRef,useState} from 'react';
import {beginLogin,cancelAccountLogin,checkAccountHealth,isDesktopApp,subscribeToBackendEvents} from '../api/backend';
import type {Translate} from '../i18n';

/** Serialize credential recovery and verify the returned account before advancing. */
export function useAccountRecovery(notify:(message:string)=>void,t:Translate) {
  const [queue,setQueue]=useState<string[]>([]);
  const [verifying,setVerifying]=useState(false);
  const [stage,setStage]=useState('opening');
  const [elapsed,setElapsed]=useState(0);
  const stageAt=useRef(Date.now());
  const attempted=useRef(new Set<string>());
  const active=useRef<string|null>(null);
  const inFlight=useRef(false);
  const generation=useRef(0);
  const current=queue[0]??null;
  active.current=current;
  const stop=useCallback(()=>{
    generation.current++;
    active.current=null;inFlight.current=false;setQueue([]);setVerifying(false);
    void cancelAccountLogin().catch(()=>notify(t('accountsOnly.recovery.failed')));
  },[notify,t]);
  const beginBatch=useCallback(()=>{attempted.current.clear();},[]);
  const enqueue=useCallback((id:string)=>{
    if(!isDesktopApp||attempted.current.has(id))return;
    attempted.current.add(id);
    setQueue(items=>items.includes(id)?items:[...items,id]);
  },[]);
  const pendingSaved=useRef(new Set<string>());
  const automaticAttempts=useRef(new Map<string,number>());
  const enqueueSaved=useCallback(async(id:string)=>{
    if(!isDesktopApp||active.current===id||pendingSaved.current.has(id))return;
    const last=automaticAttempts.current.get(id);
    if(last!==undefined&&Date.now()-last<10*60_000)return;
    pendingSaved.current.add(id);
    const requestedGeneration=generation.current;
    try {
      const status=await invoke<{enabled:boolean}>('saved_login_settings',{action:{kind:'status',id}});
      if(status.enabled&&generation.current===requestedGeneration) {
        automaticAttempts.current.set(id,Date.now());
        attempted.current.delete(id);
        enqueue(id);
      }
    } catch { notify(t('accountsOnly.recovery.failed')); }
    finally { pendingSaved.current.delete(id); }
  },[enqueue,notify,t]);
  useEffect(()=>{
    if(!current)return;
    let alive=true;
    let completed=false;
    setStage('opening');setElapsed(0);stageAt.current=Date.now();
    let unlistenProgress:UnlistenFn|undefined;
    void listen<{accountId:string;stage:string}>('account-recovery-progress',event=>{
      if(!alive||event.payload.accountId!==current||completed)return;
      if(!['email','password','totp','callback','needsAttention'].includes(event.payload.stage))return;
      setStage(event.payload.stage);stageAt.current=Date.now();setElapsed(0);
    }).then(stopListening=>{if(alive)unlistenProgress=stopListening;else stopListening();})
      .catch(()=>{if(alive)notify(t('accountsOnly.recovery.progressUnavailable'));});
    const clock=window.setInterval(()=>{if(alive)setElapsed(Math.floor((Date.now()-stageAt.current)/1000));},1000);
    const unsubscribe=subscribeToBackendEvents(()=>{},status=>{
      if(!alive||completed||active.current!==current)return;
      completed=true;
      if(!status.ok){notify(t('accountsOnly.recovery.failed'));stop();return;}
      if(status.accountId!==current){notify(t('accountsOnly.recovery.mismatch'));stop();return;}
      setVerifying(true);stageAt.current=Date.now();setElapsed(0);
      void checkAccountHealth(current).then(result=>{
        if(!alive||active.current!==current)return;
        if(result.status==='available') {
          notify(t('accountsOnly.recovery.verified'));
          setQueue(items=>items.filter(id=>id!==current));
        } else {notify(t('accountsOnly.recovery.unverified'));stop();}
      }).catch(()=>{if(alive){notify(t('accountsOnly.recovery.unverified'));stop();}})
        .finally(()=>{if(alive)setVerifying(false);});
    });
    // Defer launch until subscriptions are registered; cleanup prevents duplicate
    // launches from React's development effect replay.
    const launch=window.setTimeout(()=>{
      if(!alive||inFlight.current)return;
      inFlight.current=true;
      void beginLogin(false,true,current).catch(()=>{
        if(alive){notify(t('accountsOnly.recovery.failed'));stop();}
      });
    },0);
    const timeout=window.setTimeout(()=>{
      if(alive){notify(t('accountsOnly.recovery.failed'));stop();}
    },10*60*1000);
    return()=>{alive=false;inFlight.current=false;window.clearTimeout(launch);window.clearTimeout(timeout);window.clearInterval(clock);unlistenProgress?.();unsubscribe();};
  },[current,notify,t,stop]);
  return {current,verifying,stage,elapsed,count:queue.length,enqueue,enqueueSaved,beginBatch,stop};
}
