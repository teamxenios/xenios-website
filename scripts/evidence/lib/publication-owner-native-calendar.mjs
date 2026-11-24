// Qualification only: one exact native calendar image, never an opaque-origin allowance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openSync,closeSync,readSync,fstatSync,readFileSync,realpathSync,constants} from 'node:fs';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {PINNED_BROWSER,RESOURCE_SHA256,PROFILE,assertPinnedOwnedBrowserIdentity} from '../hosted-scenes/verified-chrome158-profile.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const NATIVE_CALENDAR=Object.freeze({
 id:'chromium-native-calendar-picker',uri:"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNSIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSJXaW5kb3dUZXh0IiBkPSJNMjAgM2gtMVYxaC0ydjJIN1YxSDV2Mkg0Yy0xLjEgMC0yIC45LTIgMnYxNmMwIDEuMS45IDIgMiAyaDE2YzEuMSAwIDItLjkgMi0yVjVjMC0xLjEtLjktMi0yLTJ6bTAgMThINFY4aDE2djEzeiIvPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiLz48L3N2Zz4=",
 uriBytes:382,uriSha256:'04e449d20d0365d881a54ed24af7ed00fe79dd9f9e601248f4fd7793003924f2',
 decodedBytes:266,decodedSha256:'662294921ca6240beb0f2aecb7f7ac23dd085b782bbe52a369b20226d26afe33',
 selector:'input[type="date" i]::-webkit-calendar-picker-indicator',
});
const nativeProofs=new WeakMap();
function verifyPrimitive(){
 const d=NATIVE_CALENDAR;assert.equal(Buffer.byteLength(d.uri),d.uriBytes);assert.equal(sha(d.uri),d.uriSha256);
 const prefix='data:image/svg+xml;base64,';assert(d.uri.startsWith(prefix));const value=d.uri.slice(prefix.length),bytes=Buffer.from(value,'base64');
 assert.equal(bytes.toString('base64'),value,'NATIVE_BASE64_CANONICAL');assert.equal(bytes.length,d.decodedBytes);assert.equal(sha(bytes),d.decodedSha256);
 const text=bytes.toString('utf8'),withoutNamespace=text.replace('xmlns="http://www.w3.org/2000/svg"','');
 assert(!/<!|<\?|&|https?:|\/\/|data:|blob:|javascript:|\b(?:href|src|on[a-z]+)\s*=/i.test(withoutNamespace),'NATIVE_ACTIVE_OR_EXTERNAL_REFERENCE');
 assert.deepEqual([...text.matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b/g)].map(m=>m[1]),['svg','path','path','svg'],'NATIVE_PASSIVE_PATHS');
}
// Data-only inspector. It cannot mint a verified hosted-resource or row capability.
export function inspectNativeCalendarPak(pak){
 verifyPrimitive();assert(Buffer.isBuffer(pak)&&pak.length>=18&&pak.length<=32*1024*1024,'NATIVE_PAK_BOUND');
 assert.equal(pak.readUInt32LE(0),5,'NATIVE_PAK_VERSION');assert.equal(pak[4],1,'NATIVE_PAK_UTF8');
 assert.equal(pak.readUIntLE(5,3),0,'NATIVE_PAK_RESERVED');const count=pak.readUInt16LE(8),aliases=pak.readUInt16LE(10);
 assert(count>0&&count<=8192&&aliases<=8192,'NATIVE_PAK_TABLE_BOUND');const tableEnd=12+(count+1)*6+aliases*4;
 assert(tableEnd<=pak.length&&pak.readUInt32LE(14)===tableEnd,'NATIVE_PAK_TABLE_START');
 assert.equal(pak.readUInt32LE(14+count*6),pak.length,'NATIVE_PAK_TABLE_END');
 let previous=-1,total=0;const matches=[],started=Date.now();
 for(let i=0;i<aliases;i++)assert(pak.readUInt16LE(12+(count+1)*6+i*4+2)<count,'NATIVE_PAK_ALIAS_INDEX');
 for(let i=0;i<count;i++){
  assert(Date.now()-started<15000,'NATIVE_RESOURCE_SCAN_DEADLINE');const id=pak.readUInt16LE(12+i*6),a=pak.readUInt32LE(14+i*6),b=pak.readUInt32LE(20+i*6);
  assert(id>previous&&a>=tableEnd&&a<=b&&b<=pak.length,'NATIVE_RESOURCE_TABLE');previous=id;
  const encoded=pak.subarray(a,b);let bytes=encoded,compression='raw';
  if(encoded[0]===0x1f&&encoded[1]===0x8b){compression='gzip';bytes=gunzipSync(encoded,{maxOutputLength:8*1024*1024});}
  else if(encoded[0]===0x1e&&encoded[1]===0x9b){assert(encoded.length>=8,'NATIVE_BROTLI_HEADER');const size=encoded.readUIntLE(2,6);
   assert(size>0&&size<=8*1024*1024,'NATIVE_BROTLI_SIZE');compression='brotli-header8';bytes=brotliDecompressSync(encoded.subarray(8),{maxOutputLength:size});assert.equal(bytes.length,size,'NATIVE_BROTLI_LENGTH');}
  assert(bytes.length<=8*1024*1024,'NATIVE_RESOURCE_SIZE');total+=bytes.length;assert(total<=256*1024*1024,'NATIVE_TOTAL_DECODED_BOUND');
  const text=bytes.toString('utf8');let at=-1;
  while((at=text.indexOf(NATIVE_CALENDAR.uri,at+1))>=0){
   const brace=text.lastIndexOf('{',at),previousRule=text.lastIndexOf('}',brace),end=text.indexOf('}',at);
   assert(brace>=0&&end>at,'NATIVE_DATE_RULE');const selectors=text.slice(previousRule+1,brace).split(',').map(s=>s.replace(/\s+/g,''));
   const expected=['date','datetime-local','month','week'].map(type=>'input[type="'+type+'"i]::-webkit-calendar-picker-indicator');
   assert.deepEqual(selectors,expected,'NATIVE_DATE_CONTROL_SELECTORS');
   const rule=text.slice(brace+1,end).replace(/\s+/g,' ');
   assert(rule.includes('background-image: light-dark(url('+NATIVE_CALENDAR.uri+'), url('),'NATIVE_CALENDAR_DECLARATION');
   matches.push({resourceId:id,resourceOffset:a,encodedBytes:encoded.length,encodedSha256:sha(encoded),decodedBytes:bytes.length,decodedSha256:sha(bytes),
    compression,uriOffset:at,selector:NATIVE_CALENDAR.selector,uriBytes:NATIVE_CALENDAR.uriBytes,uriSha256:NATIVE_CALENDAR.uriSha256,
    svgBytes:NATIVE_CALENDAR.decodedBytes,svgSha256:NATIVE_CALENDAR.decodedSha256});
  }
 }
 assert.equal(matches.length,1,'ONE_NATIVE_CALENDAR_PRODUCER_REQUIRED');return Object.freeze({pakBytes:pak.length,pakSha256:sha(pak),resources:count,aliases,decodedTotal:total,...matches[0]});
}
const NATIVE_BROWSER_FILES=Object.freeze([
 Object.freeze({id:'launcher',path:PINNED_BROWSER.launcherPath,maxBytes:1024*1024,expectedSha256:PINNED_BROWSER.launcherSha256}),
 Object.freeze({id:'executable',path:PINNED_BROWSER.executable,maxBytes:512*1024*1024,expectedSha256:PINNED_BROWSER.executableSha256}),
 Object.freeze({id:'resource',path:'/run/xenios-protected-browser/resources.pak',maxBytes:32*1024*1024,expectedSha256:RESOURCE_SHA256}),
]);
// Pure metadata only. These facts cannot mint a private native-resource capability.
export function nativeBrowserFileChecks(value,max){
 return {regular:value?.regular===true,rootOwned:value?.uid===0,noGroupOrOtherWrite:Number.isSafeInteger(value?.mode)&&(value.mode&0o022)===0,
  positiveSize:Number.isSafeInteger(value?.size)&&value.size>0,withinBound:Number.isSafeInteger(value?.size)&&value.size<=max};
}
function fileStat(value){return{regular:value.isFile(),uid:value.uid,gid:value.gid,mode:value.mode,
 permissionsOctal:(value.mode&0o7777).toString(8),size:value.size,dev:value.dev,ino:value.ino,mtimeMs:value.mtimeMs};}
// All fixed prerequisites are observed before use; failure in one never hides the other two.
// No injected filesystem/process port and no executable or provider action is performed.
export function observePinnedNativeBrowserPrerequisites(){
 assert.equal(process.platform,'linux','NATIVE_CALENDAR_REQUIRES_PINNED_LINUX');
 const files=NATIVE_BROWSER_FILES.map(spec=>{
  const row={id:spec.id,path:spec.path,maxBytes:spec.maxBytes,expectedSha256:spec.expectedSha256,pathExact:null,stat:null,checks:null,bytes:null,sha256:null,hashMatches:null,producer:null,failure:null};
  try{
   row.pathExact=realpathSync(spec.path)===spec.path;assert(row.pathExact,'NATIVE_PREREQUISITE_PATH');
   const file=regular(spec.path,spec.maxBytes,spec.id==='resource',row);row.bytes=file.bytes;row.sha256=file.sha256;
   if(spec.expectedSha256){row.hashMatches=file.sha256===spec.expectedSha256;assert(row.hashMatches,'NATIVE_PREREQUISITE_HASH');}
   if(spec.id==='resource'){row.producer=inspectNativeCalendarPak(file.data);assert.deepEqual(row.producer,PROFILE.nativeCalendar.pureDataObservation,'EXACT_CHROME158_NATIVE_PRODUCER');}
  }catch(error){
   const code=typeof error.code==='string'&&/^(?:EACCES|EPERM|ENOENT|ELOOP|ENOTDIR|EIO|EISDIR)$/.test(error.code)?error.code:null;
   const fixed=/^[A-Z][A-Z0-9_]{1,100}$/.test(String(error.message))?String(error.message):'NATIVE_PREREQUISITE_CHECK_FAILED';
   row.failure=code??fixed;
  }
  return row;
 });
 return{kind:'PRIOR_TO_USE_PINNED_NATIVE_BROWSER_FILE_OBSERVATION',authority:'OBSERVATION_ONLY_NOT_NATIVE_RESOURCE_CAPABILITY',
  platform:process.platform,observerUid:process.getuid(),files};
}
export function assertPinnedNativeBrowserPrerequisites(value){
 assert(value?.kind==='PRIOR_TO_USE_PINNED_NATIVE_BROWSER_FILE_OBSERVATION'&&value.platform==='linux','NATIVE_BROWSER_PREREQUISITE_RECORD');
 assert(Array.isArray(value.files)&&value.files.length===NATIVE_BROWSER_FILES.length,'NATIVE_BROWSER_PREREQUISITE_FILES');
 for(const [i,spec]of NATIVE_BROWSER_FILES.entries()){
  const row=value.files[i];assert(row&&row.id===spec.id&&row.path===spec.path&&row.maxBytes===spec.maxBytes&&row.expectedSha256===spec.expectedSha256,'NATIVE_BROWSER_PREREQUISITE_SCOPE');
  assert(row.failure===null&&row.pathExact===true,'NATIVE_BROWSER_FILE_PREREQUISITES_FAILED');
  assert.deepEqual(row.checks,nativeBrowserFileChecks(row.stat,spec.maxBytes),'NATIVE_BROWSER_PREREQUISITE_CHECKS');
  assert(Object.values(row.checks).every(v=>v===true)&&row.bytes===row.stat.size,'NATIVE_BROWSER_FILE_PREREQUISITES_FAILED');
  assert(typeof row.sha256==='string'&&/^[a-f0-9]{64}$/.test(row.sha256),'NATIVE_BROWSER_PREREQUISITE_DIGEST');
  if(spec.expectedSha256)assert(row.hashMatches===true&&row.sha256===spec.expectedSha256,'NATIVE_BROWSER_PREREQUISITE_HASH');
  if(spec.id==='resource')assert(row.producer?.pakSha256===row.sha256&&row.producer.pakBytes===row.bytes
   &&row.producer.uriSha256===NATIVE_CALENDAR.uriSha256&&row.producer.svgSha256===NATIVE_CALENDAR.decodedSha256,'NATIVE_BROWSER_PREREQUISITE_PRODUCER');
 }
 return true;
}
function regular(path,max,retain,observation){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=fstatSync(fd);
  if(observation){observation.stat=fileStat(before);observation.checks=nativeBrowserFileChecks(observation.stat,max);}
  assert(before.isFile()&&before.uid===0&&(before.mode&0o022)===0&&before.size>0&&before.size<=max,'PINNED_BROWSER_ROOT_OWNED_REGULAR_FILE');
  const h=createHash('sha256'),chunk=Buffer.alloc(65536),parts=[];let size=0,n;
  while((n=readSync(fd,chunk,0,chunk.length,null))>0){size+=n;assert(size<=max);h.update(chunk.subarray(0,n));if(retain)parts.push(Buffer.from(chunk.subarray(0,n)));}
  const after=fstatSync(fd);for(const k of ['dev','ino','size','mtimeMs','mode','uid'])assert.equal(after[k],before[k],'NATIVE_RESOURCE_FILE_CHANGED');
  assert.equal(size,before.size);return{bytes:size,sha256:h.digest('hex'),...(retain?{data:Buffer.concat(parts)}:{})};
 }finally{closeSync(fd);}
}
function sample(browser){
 assert(browser?.process&&Number.isSafeInteger(browser.process.pid)&&browser.process.pid>0,'OWNED_BROWSER_PROCESS_REQUIRED');
 assert.equal(browser.process.exitCode,null,'OWNED_BROWSER_EXITED');assert.equal(browser.process.signalCode,null,'OWNED_BROWSER_SIGNALED');
 const pid=browser.process.pid,raw=readFileSync('/proc/'+pid+'/stat','utf8');assert(raw.length<16384);const f=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
 const launcherPath=realpathSync(browser.chromePath),executable=realpathSync('/proc/'+pid+'/exe');
 assert.equal(launcherPath,PINNED_BROWSER.launcherPath,'PINNED_LAUNCHER_PATH');assert.equal(executable,PINNED_BROWSER.executable,'PINNED_EXECUTABLE_PATH');
 return{pid,parentPid:Number(f[1]),startTicks:f[19],state:f[0],launcherPath,launcherSha256:regular(launcherPath,1024*1024,false).sha256,
  executable,executableSha256:regular(executable,512*1024*1024,false).sha256,browserVersion:browser.browserVersion};
}
// Real filesystem/process read only: no injected identity, package, version, or resource port.
export function verifyPinnedOwnerNativeCalendarResource(browser){
 assert.equal(process.platform,'linux','NATIVE_CALENDAR_REQUIRES_PINNED_LINUX');const before=sample(browser);
 assert.equal(before.parentPid,process.pid,'OWNED_BROWSER_PARENT');const owned={pid:before.pid,parentPid:process.pid,startTicks:before.startTicks};
 assertPinnedOwnedBrowserIdentity(owned,before,before);
 const resourcePath='/run/xenios-protected-browser/resources.pak';assert.equal(realpathSync(resourcePath),resourcePath,'NATIVE_RESOURCE_PATH');
 const file=regular(resourcePath,32*1024*1024,true),inspected=inspectNativeCalendarPak(file.data),after=sample(browser);
 assert.equal(file.sha256,RESOURCE_SHA256,'EXACT_CHROME158_RESOURCE_HASH');assert.deepEqual(inspected,PROFILE.nativeCalendar.pureDataObservation,'EXACT_CHROME158_NATIVE_PRODUCER');
 const identity=assertPinnedOwnedBrowserIdentity(owned,before,after);
 const proof=Object.freeze({kind:'ACTUAL_PINNED_HOSTED_BROWSER_NATIVE_CALENDAR_RESOURCE',browser:PINNED_BROWSER,owned:identity,
  resourcePath,resourceBytes:file.bytes,resourceSha256:file.sha256,producer:inspected});
 nativeProofs.set(proof,{rows:new WeakSet(),bindings:[]});return proof;
}
export function ownerNativeCalendarVerified(value){return !!value&&typeof value==='object'&&nativeProofs.has(value);}
export function nativeCalendarUriMatches(row){
 return !!row&&row.method==='GET'&&row.type==='Image'&&row.status===200&&(row.targetType===undefined||row.targetType==='page')
  &&row.url===NATIVE_CALENDAR.uri&&Buffer.byteLength(row.url)===NATIVE_CALENDAR.uriBytes&&sha(row.url)===NATIVE_CALENDAR.uriSha256;
}
// Stringified into the real page; read-only and no values/private content are returned.
export function measureOwnerNativeCalendarControl(){
 const e=document.querySelector('#price-effective'),s=e?getComputedStyle(e):null,r=e?.getBoundingClientRect();
 return{origin:location.origin,pathname:location.pathname,viewportWidth:innerWidth,control:e?{tag:e.tagName,id:e.id,type:e.getAttribute('type'),
  connected:e.isConnected,rendered:e.getClientRects().length>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.visibility!=='collapse',
  width:r.width,height:r.height}:null};
}
export function assertNativeCalendarControl(value,{origin,pathname,width}){
 assert(/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(origin)&&['/admin/research/products/11111111-1111-4111-8111-111111111111'].includes(pathname),'NATIVE_CONTROL_PAGE_SCOPE');
 assert([1440,375].includes(width),'NATIVE_CONTROL_VIEWPORT');assert.equal(value?.origin,origin);assert.equal(value?.pathname,pathname);assert.equal(value?.viewportWidth,width);
 const c=value.control;assert(c&&c.tag==='INPUT'&&c.id==='price-effective'&&c.type==='date'&&c.connected===true&&c.rendered===true
  &&Number.isFinite(c.width)&&c.width>0&&Number.isFinite(c.height)&&c.height>0,'ACTUAL_NATIVE_DATE_CONTROL_REQUIRED');return c;
}
export function bindOwnerNativeCalendarRows(proof,value,rows,expected){
 assert(ownerNativeCalendarVerified(proof),'ACTUAL_NATIVE_BROWSER_RESOURCE_REQUIRED');const c=assertNativeCalendarControl(value,expected),state=nativeProofs.get(proof);
 assert(Array.isArray(rows)&&rows.length<=4096&&state.bindings.length<2,'NATIVE_ROW_BINDING_BOUND');assert(!state.bindings.some(b=>b.viewportWidth===expected.width),'NATIVE_PHASE_ALREADY_BOUND');
 let count=0;for(const row of rows)if(nativeCalendarUriMatches(row)){state.rows.add(row);count++;}
 const binding=Object.freeze({kind:'ACTUAL_DATE_CONTROL_AND_PHASE_NATIVE_IMAGE_BINDING',origin:expected.origin,pathname:expected.pathname,
  viewportWidth:expected.width,control:{...c},phaseRows:rows.length,boundRows:count,uriSha256:NATIVE_CALENDAR.uriSha256});
 state.bindings.push(binding);return binding;
}
export function matchVerifiedOwnerNativeCalendarRow(row,proof){
 if(!ownerNativeCalendarVerified(proof)||!nativeProofs.get(proof).rows.has(row)||!nativeCalendarUriMatches(row))return null;
 return{kind:'EXACT_PINNED_BROWSER_CALENDAR_IMAGE',id:NATIVE_CALENDAR.id,uriBytes:NATIVE_CALENDAR.uriBytes,uriSha256:NATIVE_CALENDAR.uriSha256,
  decodedBytes:NATIVE_CALENDAR.decodedBytes,decodedSha256:NATIVE_CALENDAR.decodedSha256,declaringNativeSelector:NATIVE_CALENDAR.selector,
  resourcePath:proof.resourcePath,resourceSha256:proof.resourceSha256,resourceDecodedSha256:proof.producer.decodedSha256,networkEndpoint:false};
}
