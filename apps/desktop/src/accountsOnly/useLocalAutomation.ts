import { useCallback,useEffect,useRef,useState } from 'react';
import {getAutomation,saveAutomation,subscribeAutomation,type AutomationConfig,type AutomationSnapshot} from './automationApi';
import type {Translate} from '../i18n';
export function useLocalAutomation(notify:(message:string)=>void,t:Translate){
  const [state,setState]=useState<AutomationSnapshot|null>(null);
  const [saving,setSaving]=useState(false);
  const busy=useRef(false);
  useEffect(()=>{
    let active=true;let stop:(()=>void)|undefined;
    let loading=false;
    const refresh=async()=>{if(loading)return;loading=true;try{const next=await getAutomation();if(active)setState(next);}catch{if(active)notify(t('accountsOnly.automation.loadFailed'));}finally{loading=false;}};
    void refresh();void subscribeAutomation(()=>void refresh()).then(unlisten=>{if(active)stop=unlisten;else unlisten();});
    return()=>{active=false;stop?.();};
  },[notify,t]);
  const save=useCallback(async(config:AutomationConfig)=>{
    if(busy.current)return false;busy.current=true;setSaving(true);
    try{setState(await saveAutomation(config));return true;}
    catch{notify(t('accountsOnly.automation.saveFailed'));return false;}
    finally{busy.current=false;setSaving(false);}
  },[notify,t]);
  return{state,saving,save};
}
