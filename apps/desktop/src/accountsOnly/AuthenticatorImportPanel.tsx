import {useEffect,useRef,useState} from 'react';
import {Button,Input} from 'antd';
import {ClipboardPaste,FileUp,Check} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {isDesktopApp} from '../api/backend';
import {decodeQrImageLocally} from '../components/totp/qr';
import {parseAuthenticatorImport,type OtpImportEntry,OtpImportError} from './authenticatorImport';
import type {Translate} from '../i18n';
import './authenticatorImport.css';

export function AuthenticatorImport({value,onChange,email,t}:{value:string;onChange:(value:string)=>void;email:string;t:Translate}){
  const fileInput=useRef<HTMLInputElement>(null);const busyRef=useRef(false);const mounted=useRef(true);
  const [entries,setEntries]=useState<OtpImportEntry[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const entriesRef=useRef(entries);entriesRef.current=entries;
  const batches=useRef(new Map<number,{size:number;seen:Set<number>}>());
  const confirmation=useRef(new Set<string>());
  const failure=(error:unknown)=>setMessage(t(error instanceof OtpImportError&&error.message==='encrypted'?'accountsOnly.importOtp.encrypted':'accountsOnly.importOtp.failed'));
  const accept=(input:string)=>{
    const parsed=parseAuthenticatorImport(input);
    if(!parsed.entries.length)throw new OtpImportError(parsed.issues[0]??'invalid');
    const merged=[...entriesRef.current];for(const item of parsed.entries)if(!merged.some(old=>old.uri===item.uri))merged.push(item);
    if(parsed.requiresConfirmation)parsed.entries.forEach(item=>confirmation.current.add(item.uri));
    if(merged.length>2000)throw new OtpImportError('tooLarge');
    entriesRef.current=merged;setEntries(merged);
    const matched=merged.filter(item=>!confirmation.current.has(item.uri)&&(item.account.toLowerCase()===email.toLowerCase()||item.account.toLowerCase().endsWith(`:${email.toLowerCase()}`)));
    if(parsed.requiresConfirmation)onChange('');
    else if(matched.length===1)onChange(matched[0].uri);else if(merged.length===1&&!confirmation.current.has(merged[0].uri))onChange(merged[0].uri);else if(!merged.some(item=>item.uri===value))onChange('');
    let partial=false;
    for(const part of [...(parsed.batches??[]),...(parsed.batch?[parsed.batch]:[])].filter(part=>part.size>1)){
      const {id,size,index}=part;let batch=batches.current.get(id);
      if(batch&&batch.size!==size)throw new OtpImportError('invalid');
      if(!batch){batch={size,seen:new Set()};batches.current.set(id,batch);}batch.seen.add(index);
    }
    partial=[...batches.current.values()].some(batch=>batch.seen.size<batch.size);
    setMessage(t(parsed.requiresConfirmation?'accountsOnly.importOtp.compatibleVersion':partial?'accountsOnly.importOtp.partial':parsed.issues.length?'accountsOnly.importOtp.skipped':'accountsOnly.importOtp.detected',{count:merged.length}));
  };
  const files=async(list:File[])=>{
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setMessage('');
    try{if(list.length>20)throw new OtpImportError('tooLarge');
      for(const file of list){
        if(file.size>10*1024*1024)throw new OtpImportError('tooLarge');
        const image=file.type.startsWith('image/')||/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(file.name);
        const input=image?await decodeQrImageLocally(file):await file.text();
        if(!mounted.current)return;accept(input);
      }
    }catch(error){if(mounted.current)failure(error);}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  };
  const filesRef=useRef(files);filesRef.current=files;
  useEffect(()=>{
    mounted.current=true;let unlisten:(()=>void)|undefined;let alive=true;
    if(isDesktopApp)void getCurrentWebview().onDragDropEvent(async event=>{
      if(event.payload.type!=='drop'||busyRef.current)return;
      try{if(event.payload.paths.length>20)throw new OtpImportError('tooLarge');
        const list:File[]=[];let total=0;for(const path of event.payload.paths){
          const data=await invoke<{name:string;mime:string;data:number[]}>('read_authenticator_import',{path});
          total+=data.data.length;if(total>20*1024*1024)throw new OtpImportError('tooLarge');
          list.push(new File([new Uint8Array(data.data)],data.name,{type:data.mime}));
        }if(alive)void filesRef.current(list);
      }catch(error){if(alive)failure(error);}
    }).then(fn=>{if(alive)unlisten=fn;else fn();});
    return()=>{alive=false;mounted.current=false;unlisten?.();};
  },[]);
  const paste=async()=>{
    try{if(navigator.clipboard.read){
      const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(type=>type.startsWith('image/'));
        if(type){await files([new File([await item.getType(type)],'clipboard.png',{type})]);return;}}
    }accept(await navigator.clipboard.readText());}catch(error){failure(error);}
  };
  return <section className="authenticator-import" aria-label={t('accountsOnly.importOtp.title')}
    onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void files([...event.dataTransfer.files]);}}
    onPaste={event=>{const images=[...event.clipboardData.files];if(images.length){event.preventDefault();void files(images);}}}>
    <div className="authenticator-import-heading"><strong>{t('accountsOnly.importOtp.title')}</strong><span>{t('accountsOnly.importOtp.local')}</span></div>
    <p>{t('accountsOnly.importOtp.hint')}</p>
    <div className="authenticator-import-actions">
      <Button icon={<ClipboardPaste size={14}/>} loading={busy} onClick={()=>void paste()}>{t('accountsOnly.importOtp.paste')}</Button>
      <Button icon={<FileUp size={14}/>} disabled={busy} onClick={()=>fileInput.current?.click()}>{t('accountsOnly.importOtp.file')}</Button>
      <input ref={fileInput} type="file" multiple accept="image/*,.json,.csv,.txt,.uri,.2fas,.aegis" hidden
        onChange={event=>{void files([...(event.target.files??[])]);event.target.value='';}}/>
    </div>
    <Input.Password value={value} autoComplete="off" aria-label={t('accountsOnly.recovery.totp')}
      placeholder={t('accountsOnly.importOtp.placeholder')} onChange={event=>onChange(event.target.value)}
      onPaste={event=>{const input=event.clipboardData.getData('text');if(input){event.preventDefault();try{accept(input);}catch(error){failure(error);}}}}/>
    {message&&<p role="status">{message}</p>}
    {entries.length>0&&<div className="authenticator-import-choices" role="listbox" aria-label={t('accountsOnly.importOtp.choose')}>
      {entries.map((item,index)=><button key={index} type="button" role="option" aria-selected={value===item.uri} onClick={()=>{confirmation.current.delete(item.uri);onChange(item.uri);}}>
        <span><strong>{item.issuer||t('accountsOnly.importOtp.unnamed')}</strong><small>{item.account||t('accountsOnly.importOtp.unnamed')}</small>
          <small>{t('accountsOnly.importOtp.parameters',{algorithm:new URL(item.uri).searchParams.get('algorithm')??'SHA1',digits:new URL(item.uri).searchParams.get('digits')??'6',period:new URL(item.uri).searchParams.get('period')??'30'})}</small></span>
        {value===item.uri&&<Check size={16}/>}</button>)}
    </div>}
  </section>;
}
