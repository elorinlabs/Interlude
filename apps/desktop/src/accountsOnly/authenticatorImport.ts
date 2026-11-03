export interface OtpImportEntry {issuer:string;account:string;uri:string}
export interface OtpImportResult {entries:OtpImportEntry[];issues:string[];requiresConfirmation?:boolean;batch?:{id:number;size:number;index:number};batches?:{id:number;size:number;index:number}[]}
export class OtpImportError extends Error {}
type RecordValue=Record<string,unknown>;
const MAX_SIZE=2_000_000;
const object=(v:unknown):RecordValue|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:undefined;
const text=(v:unknown)=>typeof v==='string'?v:'';
function entry(secret:string,issuer='',account='',algorithm:unknown='SHA1',digits:unknown=6,period:unknown=30):OtpImportEntry{
  const seed=secret.toUpperCase().replace(/[\s=-]/g,'');
  if(!/^[A-Z2-7]+$/.test(seed)||seed.length<16||seed.length>256)throw new OtpImportError('invalid');
  const algo=String(algorithm??'SHA1').toUpperCase().replace(/-/g,'');
  if(!['SHA1','SHA256','SHA512'].includes(algo)||![6,8].includes(Number(digits))||
    !Number.isInteger(Number(period))||Number(period)<15||Number(period)>120)throw new OtpImportError('parameters');
  const uri=new URL(`otpauth://totp/${encodeURIComponent(issuer?`${issuer}:${account}`:account)}`);
  uri.search=new URLSearchParams({secret:seed,issuer,algorithm:algo,digits:String(digits),period:String(period)}).toString();
  return {issuer,account,uri:uri.toString()};
}
function standard(value:string):OtpImportEntry{
  const url=new URL(value);
  if(url.protocol!=='otpauth:'||url.hostname.toLowerCase()!=='totp')throw new OtpImportError('unsupportedType');
  const label=decodeURIComponent(url.pathname.slice(1));const split=label.indexOf(':');
  return entry(url.searchParams.get('secret')??'',url.searchParams.get('issuer')??(split>=0?label.slice(0,split):''),
    split>=0?label.slice(split+1):label,url.searchParams.get('algorithm')??'SHA1',url.searchParams.get('digits')??6,url.searchParams.get('period')??30);
}
function base32(bytes:Uint8Array):string{
  let bits=0,value=0,out='';const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
type Field={tag:number;number?:number;bytes?:Uint8Array};
function fields(bytes:Uint8Array):Field[]{
  let offset=0;const output:Field[]=[];
  const integer=()=>{let value=0n;for(let shift=0;shift<70;shift+=7){if(offset>=bytes.length)throw new OtpImportError('invalid');
    const b=bytes[offset++];if(shift===63&&(b&127)>1)throw new OtpImportError('invalid');value|=BigInt(b&127)<<BigInt(shift);
    if(!(b&128))return Number(value<=BigInt(Number.MAX_SAFE_INTEGER)?value:BigInt.asIntN(32,value));}
    throw new OtpImportError('invalid');};
  while(offset<bytes.length){if(output.length>10000)throw new OtpImportError('tooLarge');
    const key=integer(),tag=Math.floor(key/8),wire=key%8;if(!tag)throw new OtpImportError('invalid');
    if(wire===0)output.push({tag,number:integer()});
    else if(wire===2){const size=integer();if(size>bytes.length-offset)throw new OtpImportError('invalid');output.push({tag,bytes:bytes.slice(offset,offset+size)});offset+=size;}
    else if(wire===1||wire===5){offset+=wire===1?8:4;if(offset>bytes.length)throw new OtpImportError('invalid');}
    else throw new OtpImportError('invalid');
  }return output;
}
function migration(value:string):OtpImportResult{
  const url=new URL(value);if(url.hostname!=='offline')throw new OtpImportError('unsupported');
  const data=(url.searchParams.get('data')??'').replace(/ /g,'+').replace(/-/g,'+').replace(/_/g,'/');
  if(!data||data.length>MAX_SIZE)throw new OtpImportError('invalid');
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{throw new OtpImportError('invalid');}
  const payload=fields(bytes);const entries:OtpImportEntry[]=[];const issues:string[]=[];
  const number=(values:Field[],tag:number,defaultValue:number)=>values.find(f=>f.tag===tag)?.number??defaultValue;
  // Decode the explicitly supported OTP fields instead of hard-rejecting a
  // compatible envelope version. Unrecognized versions require user selection.
  const version=number(payload,2,0);
  if(!Number.isInteger(version)||version<0||version>0x7fffffff)throw new OtpImportError('invalid');
  for(const field of payload.filter(f=>f.tag===1&&f.bytes)){
    try{
      const otp=fields(field.bytes!);const type=number(otp,6,0);
      if(type!==2)throw new OtpImportError('unsupportedType');
      const algo=number(otp,4,0),digits=number(otp,5,0);
      if(![1,2,3].includes(algo)||![1,2].includes(digits))throw new OtpImportError('parameters');
      const secret=otp.find(f=>f.tag===1)?.bytes;if(!secret)throw new OtpImportError('invalid');
      const string=(tag:number)=>new TextDecoder('utf-8',{fatal:true}).decode(otp.find(f=>f.tag===tag)?.bytes??new Uint8Array());
      entries.push(entry(base32(secret),string(3),string(2),['','SHA1','SHA256','SHA512'][algo],digits===1?6:8,30));
    }catch(error){issues.push(error instanceof OtpImportError?error.message:'invalid');}
  }
  const size=number(payload,3,1),index=number(payload,4,0),id=number(payload,5,0);
  if(size<1||size>100||index<0||index>=size)throw new OtpImportError('invalid');
  return {entries,issues,requiresConfirmation:version>2,batch:{size,index,id}};
}
function csv(value:string):RecordValue[]{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<value.length;i++){const c=value[i];if(c==='"'){
    if(quoted&&value[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
  }else if(!quoted&&(c===','||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){rows.push(row);row=[];}}
  else if(c!=='\r')cell+=c;}
  if(quoted)throw new OtpImportError('invalid');row.push(cell.trim());rows.push(row);
  const headers=rows.shift()?.map(h=>h.toLowerCase())??[];
  if(!headers.some(h=>['secret','totp','otp','uri','otpauth'].includes(h)))throw new OtpImportError('unsupported');
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function fromRecord(record:RecordValue):OtpImportEntry{
  const info=object(record.info)??object(record.otp)??record;
  const login=object(record.login);
  const uri=text(record.uri)||text(record.otpauth)||text(record.totp)||text(login?.totp);
  if(uri.startsWith('otpauth:'))return standard(uri);
  const type=text(record.type)||text(record.kind)||text(info.tokenType);
  if(type&&type.toLowerCase()!=='totp')throw new OtpImportError('unsupportedType');
  const secret=text(info.secret)||text(record.Secret)||uri;
  if(!secret)throw new OtpImportError('invalid');
  return entry(secret,text(record.issuer)||text(record.Issuer),text(record.accountName)||text(record.account)||text(login?.username)||text(record.name)||text(record.label)||text(record.Username),
    info.algorithm??info.algo??record.Algorithm??'SHA1',info.digits??record.Digits??6,info.period??record.Period??30);
}
function records(value:unknown):unknown[]{
  if(Array.isArray(value))return value;
  const root=object(value);if(!root)throw new OtpImportError('invalid');
  if(root.encrypted===true||typeof root.db==='string'||root.app==='2FAS'&&root.servicesEncrypted)throw new OtpImportError('encrypted');
  if(root.servicesEncrypted)throw new OtpImportError('encrypted');
  for(const key of ['entries','services','accounts','items','Authenticators'])if(Array.isArray(root[key]))return root[key] as unknown[];
  if(object(root.db))return records(root.db);
  return [root];
}
export function parseAuthenticatorImport(input:string):OtpImportResult{
  const value=input.trim().replace(/^\uFEFF/,'');if(!value||value.length>MAX_SIZE)throw new OtpImportError('tooLarge');
  const lines=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.length>1&&lines.every(line=>line.startsWith('otpauth:')||line.startsWith('otpauth-migration:'))){
    const result:OtpImportResult={entries:[],issues:[],batches:[]};
    for(const line of lines){try{const parsed=parseAuthenticatorImport(line);result.entries.push(...parsed.entries);result.issues.push(...parsed.issues);result.requiresConfirmation ||= parsed.requiresConfirmation;if(parsed.batch)result.batches!.push(parsed.batch);}
      catch(error){result.issues.push(error instanceof OtpImportError?error.message:'invalid');}}
    return result;
  }
  if(value.startsWith('otpauth-migration:'))return migration(value);
  if(value.startsWith('{')||value.startsWith('[')||value.includes(',')&&!value.startsWith('otpauth:')){
    let items:unknown[];try{items=value.startsWith('{')||value.startsWith('[')?records(JSON.parse(value)):csv(value);}catch(error){throw error instanceof OtpImportError?error:new OtpImportError('invalid');}
    const result:OtpImportResult={entries:[],issues:[]};
    if(items.length>2000)throw new OtpImportError('tooLarge');
    for(const item of items){try{const record=object(item);if(!record)throw new OtpImportError('invalid');
      result.entries.push(fromRecord(record));}catch(error){result.issues.push(error instanceof OtpImportError?error.message:'invalid');}}
    return result;
  }
  const entries:OtpImportEntry[]=[];const issues:string[]=[];
  for(const line of value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
    try{entries.push(line.startsWith('otpauth:')?standard(line):entry(line));}
    catch(error){issues.push(error instanceof OtpImportError?error.message:'invalid');}
  }
  return {entries,issues};
}
