import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {NATIVE_CALENDAR,inspectNativeCalendarPak,nativeCalendarUriMatches,ownerNativeCalendarVerified,
 verifyPinnedOwnerNativeCalendarResource,measureOwnerNativeCalendarControl,assertNativeCalendarControl,
 bindOwnerNativeCalendarRows,matchVerifiedOwnerNativeCalendarRow} from './publication-owner-native-calendar.mjs';
import {withOwnerNativeCalendarSource,matchSelectedOwnerEmbeddedImage,summarizeOwnerNetworkOrigins} from './publication-owner-embedded-images.mjs';
import {assertOwnerWholeRun} from './publication-owner-observation.mjs';
import {PINNED_BROWSER,RESOURCE_SHA256} from '../hosted-scenes/verified-chrome158-profile.mjs';
import {nativeBrowserFileChecks,assertPinnedNativeBrowserPrerequisites} from './publication-owner-native-calendar.mjs';
const origin='http://127.0.0.1:52943',pathname='/admin/research/products/11111111-1111-4111-8111-111111111111';
const css=()=>['date','datetime-local','month','week'].map(t=>'input[type="'+t+'" i]::-webkit-calendar-picker-indicator').join(',\n')+
 ' {\n  background-image: light-dark(url('+NATIVE_CALENDAR.uri+'), url(data:image/svg+xml,not-selected));\n}';
function pak(text=css(),kind='raw'){
 const raw=Buffer.from(text);let encoded=raw;
 if(kind==='gzip')encoded=gzipSync(raw);
 if(kind==='brotli'){const h=Buffer.alloc(8);h[0]=0x1e;h[1]=0x9b;h.writeUIntLE(raw.length,2,6);encoded=Buffer.concat([h,brotliCompressSync(raw)]);}
 const h=Buffer.alloc(24);h.writeUInt32LE(5);h[4]=1;h.writeUInt16LE(1,8);h.writeUInt16LE(47340,12);h.writeUInt32LE(24,14);h.writeUInt32LE(24+encoded.length,20);
 return Buffer.concat([h,encoded]);
}
const row=(change={})=>({url:NATIVE_CALENDAR.uri,method:'GET',type:'Image',status:200,...change});
const expected=(width=375)=>({origin,pathname,width});
const measured=(width=375)=>({origin,pathname,viewportWidth:width,control:{tag:'INPUT',id:'price-effective',type:'date',connected:true,rendered:true,width:240,height:44}});
const final=()=>({counts:{writesRefused:0,unexpectedReads:0},protocol:{role:'staff',counts:{headReads:2,approvalReads:2,previews:0,approveAttempts:0,approveCommits:0,approveReplays:0,revokeAttempts:0,revokeCommits:0,unknownAcknowledgments:0,refusedWrites:0,unexpectedRequests:0}}});
test('selected image is exact canonical base64 and the fixed passive266-byte two-path SVG',()=>{
 assert.equal(Buffer.byteLength(NATIVE_CALENDAR.uri),382);const b=Buffer.from(NATIVE_CALENDAR.uri.split(',')[1],'base64');
 assert.equal(b.length,266);assert.equal(createHash('sha256').update(b).digest('hex'),NATIVE_CALENDAR.decodedSha256);
 assert.deepEqual([...b.toString().matchAll(/<\/?([A-Za-z][A-Za-z0-9]*)\b/g)].map(m=>m[1]),['svg','path','path','svg']);
});
for(const kind of ['raw','gzip','brotli'])test('data-only exact native selector and asset parser: '+kind,()=>{
 const p=inspectNativeCalendarPak(pak(css(),kind));assert.equal(p.resourceId,47340);assert.equal(p.uriSha256,NATIVE_CALENDAR.uriSha256);
 assert.equal(p.svgSha256,NATIVE_CALENDAR.decodedSha256);assert.equal(ownerNativeCalendarVerified(p),false);
});
for(const [name,change]of [
 ['missing selector',s=>s.replaceAll('calendar-picker-indicator','not-calendar')],
 ['non-date selector',s=>s.replace('type="date"','type="text"')],
 ['not a native declaration',s=>s.replace('background-image','content')],
 ['altered URI',s=>s.replace('WindowText','other').replace(NATIVE_CALENDAR.uri,NATIVE_CALENDAR.uri+' ')],
 ['duplicate producer',s=>s+'\n'+s],
 ['absent producer',()=>'*{color:red}'],
])test('native producer must remain exact: '+name,()=>assert.throws(()=>inspectNativeCalendarPak(pak(change(css())))));
for(const [name,mutate]of [
 ['version',p=>p.writeUInt32LE(4)],['encoding',p=>p[4]=2],['reserved',p=>p[5]=1],
 ['empty count',p=>p.writeUInt16LE(0,8)],['table start',p=>p.writeUInt32LE(0,14)],
 ['table end',p=>p.writeUInt32LE(p.length+1,20)],
])test('malformed native package refuses: '+name,()=>{const p=pak();mutate(p);assert.throws(()=>inspectNativeCalendarPak(p));});
test('compressed length and decompression are bounded',()=>{
 const p=pak(css(),'brotli');p.writeUIntLE(8*1024*1024+1,26,6);assert.throws(()=>inspectNativeCalendarPak(p),/NATIVE_BROTLI_SIZE/);
 const bad=pak(css(),'gzip');bad[bad.length-1]^=1;assert.throws(()=>inspectNativeCalendarPak(bad));
});
test('untrusted inspected data and copied metadata never become a hosted-browser proof',()=>{
 const data=inspectNativeCalendarPak(pak());assert.equal(ownerNativeCalendarVerified({...data}),false);
 assert.throws(()=>withOwnerNativeCalendarSource({},data),/ACTUAL_EMBEDDED_AND_NATIVE_SOURCE/);
 assert.throws(()=>bindOwnerNativeCalendarRows(data,measured(),[row()],expected()),/ACTUAL_NATIVE_BROWSER_RESOURCE/);
 assert.equal(matchVerifiedOwnerNativeCalendarRow(row(),data),null);
 assert.throws(()=>verifyPinnedOwnerNativeCalendarResource(null));
});
test('pure URI check requires exact complete page GET Image200',()=>{
 assert(nativeCalendarUriMatches(row()));
 for(const change of [{url:NATIVE_CALENDAR.uri+' '},{url:NATIVE_CALENDAR.uri.replace('base64','BASE64')},{method:'HEAD'},{method:'POST'},
  {type:'Fetch'},{type:'Script'},{status:null},{status:404},{targetType:'worker-or-child'}])assert.equal(nativeCalendarUriMatches(row(change)),false);
});
for(const width of [1440,375])test('actual-control data validator accepts only declared page and viewport '+width,()=>{
 assert.equal(assertNativeCalendarControl(measured(width),expected(width)).id,'price-effective');
});
for(const [name,mutate]of [
 ['off-origin',m=>m.origin='https://outside.invalid'],['wrong page',m=>m.pathname='/other'],['wrong viewport',m=>m.viewportWidth=582],
 ['absent',m=>m.control=null],['wrong tag',m=>m.control.tag='DIV'],['wrong id',m=>m.control.id='other'],['not date',m=>m.control.type='text'],
 ['detached',m=>m.control.connected=false],['not rendered',m=>m.control.rendered=false],['zero width',m=>m.control.width=0],['bad height',m=>m.control.height=NaN],
])test('native calendar requires genuine matching-control facts: '+name,()=>{const m=measured();mutate(m);assert.throws(()=>assertNativeCalendarControl(m,expected()));});
test('read-only page observer returns no value or private input content',()=>{
 const keys=['document','getComputedStyle','location','innerWidth'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{globalThis.document={querySelector:s=>{assert.equal(s,'#price-effective');return{tagName:'INPUT',id:'price-effective',isConnected:true,
  getAttribute:n=>n==='type'?'date':null,getClientRects:()=>[{}],getBoundingClientRect:()=>({width:240,height:44}),value:'DO_NOT_RETAIN'}}};
  globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});globalThis.location={origin,pathname};globalThis.innerWidth=375;
  const m=measureOwnerNativeCalendarControl();assertNativeCalendarControl(m,expected());assert(!JSON.stringify(m).includes('DO_NOT_RETAIN'));assert(!Object.hasOwn(m.control,'value'));
 }finally{for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
test('exact URI alone and forged resource do not bypass final origin checks',()=>{
 assert.equal(matchSelectedOwnerEmbeddedImage(row()),null);assert.equal(matchVerifiedOwnerNativeCalendarRow(row(),{}),null);
 assert.throws(()=>assertOwnerWholeRun({network:[row()],networkBoundaryViolations:[]},final(),'staff',origin),/OFF_ORIGIN_REQUEST/);
 const report=summarizeOwnerNetworkOrigins([row()],origin,{nativeCalendar:{}});assert.equal(report.nativeImages,0);assert.equal(report.refusedRows,1);
});
test('all original later guards and scene bodies stay required while binding native rows after the same captures',()=>{
 const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
 assert(driver.includes('verifyPinnedOwnerNativeCalendarResource(browser)'));
 assert(driver.indexOf('verifyPinnedOwnerNativeCalendarResource(browser)')<driver.indexOf("await navigate('signed-out')"));
 assert(driver.includes('page.network.slice(from)')&&driver.includes('measureOwnerNativeCalendarControl.toString()'));
 assert(driver.includes("await capture('ordinary-staff',width,false,publication);await bindNativeCalendarPhase(phaseNetworkFrom,width);continue;"));
 assert(driver.includes("await capture('recovered-and-revoked',width,false,"));
 assert(driver.indexOf('assertOwnerWholeRun(page,final,role,origin,embeddedSource)')>driver.indexOf("cleanup('ownedBrowserReleased'"));
});

const metadata=()=>({regular:true,uid:0,gid:0,mode:0o100755,size:100,dev:1,ino:2,mtimeMs:3});
test('prior-use file metadata retains all independent original refusal predicates',()=>{
 assert.deepEqual(nativeBrowserFileChecks(metadata(),1024),{regular:true,rootOwned:true,noGroupOrOtherWrite:true,positiveSize:true,withinBound:true});
});
for(const [name,change,key]of [
 ['nonregular',{regular:false},'regular'],['wrong owner',{uid:1001},'rootOwned'],['group write',{mode:0o100775},'noGroupOrOtherWrite'],
 ['other write',{mode:0o100757},'noGroupOrOtherWrite'],['empty file',{size:0},'positiveSize'],['overbound',{size:1025},'withinBound'],
 ['unknown size',{size:null},'positiveSize'],['unknown mode',{mode:null},'noGroupOrOtherWrite'],
])test('prior-use metadata makes exact failing predicate visible: '+name,()=>{
 const value={...metadata(),...change},checks=nativeBrowserFileChecks(value,1024);assert.equal(checks[key],false);
 assert(Object.values(checks).some(v=>v===false));
});
test('incomplete or wrong-scope observations refuse and do not mint native authority',()=>{
 for(const value of [null,{}, {kind:'PRIOR_TO_USE_PINNED_NATIVE_BROWSER_FILE_OBSERVATION',platform:'linux',files:[]}])
  assert.throws(()=>assertPinnedNativeBrowserPrerequisites(value));
 assert.equal(ownerNativeCalendarVerified({kind:'PRIOR_TO_USE_PINNED_NATIVE_BROWSER_FILE_OBSERVATION'}),false);
});
test('all fixed file observations are recorded before launch and independent verified use remains required',()=>{
 const source=readFileSync(new URL('./publication-owner-native-calendar.mjs',import.meta.url),'utf8');
 const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
 assert(source.includes('NATIVE_BROWSER_FILES.map(spec=>'));
 assert(source.includes('before.isFile()&&before.uid===0&&(before.mode&0o022)===0&&before.size>0&&before.size<=max'));
 assert(source.includes('finally{closeSync(fd);}'));
 const record=driver.indexOf('result.nativeCalendarPrerequisites=observePinnedNativeBrowserPrerequisites()');
 const gate=driver.indexOf('assertPinnedNativeBrowserPrerequisites(result.nativeCalendarPrerequisites)');
 const launch=driver.indexOf('browser=await launchChromium'),actual=driver.indexOf('verifyPinnedOwnerNativeCalendarResource(browser)');
 assert(record>=0&&gate>record&&launch>gate&&actual>launch);
 assert(driver.indexOf('conn=new ObservedConnection')>actual);
});

function prerequisiteRecord(){
 const hashes=[PINNED_BROWSER.launcherSha256,PINNED_BROWSER.executableSha256,RESOURCE_SHA256];
 const paths=[PINNED_BROWSER.launcherPath,PINNED_BROWSER.executable,'/run/xenios-protected-browser/resources.pak'],max=[1024*1024,512*1024*1024,32*1024*1024];
 return{kind:'PRIOR_TO_USE_PINNED_NATIVE_BROWSER_FILE_OBSERVATION',platform:'linux',files:paths.map((path,i)=>{
  const stat=metadata(),sha256=hashes[i]??'f'.repeat(64);
  return{id:['launcher','executable','resource'][i],path,maxBytes:max[i],expectedSha256:hashes[i],pathExact:true,stat,checks:nativeBrowserFileChecks(stat,max[i]),
   bytes:100,sha256,hashMatches:hashes[i]?true:null,failure:null,producer:i===2?{pakSha256:sha256,pakBytes:100,uriSha256:NATIVE_CALENDAR.uriSha256,svgSha256:NATIVE_CALENDAR.decodedSha256}:null};
 })};
}
test('complete synthetic prerequisite record validates only data, never a hosted capability',()=>{
 const value=prerequisiteRecord();assertPinnedNativeBrowserPrerequisites(value);assert.equal(ownerNativeCalendarVerified(value),false);
 assert.throws(()=>bindOwnerNativeCalendarRows(value,measured(),[row()],expected()),/ACTUAL_NATIVE_BROWSER_RESOURCE/);
});
for(const [name,mutate]of [
 ['failed launcher',v=>v.files[0].failure='PINNED_BROWSER_ROOT_OWNED_REGULAR_FILE'],
 ['missing executable',v=>v.files.splice(1,1)],['unexpected path',v=>v.files[1].path='/tmp/chrome'],
 ['unresolved path',v=>v.files[2].pathExact=false],['root ownership',v=>v.files[0].stat.uid=1001],
 ['writable file',v=>v.files[1].stat.mode=0o100777],['size bound',v=>v.files[2].stat.size=33*1024*1024],
 ['launcher digest',v=>v.files[0].sha256='0'.repeat(64)],['executable digest',v=>v.files[1].sha256='0'.repeat(64)],
 ['resource producer',v=>v.files[2].producer.uriSha256='0'.repeat(64)],['unknown producer',v=>v.files[2].producer=null],
])test('pre-use gate still refuses: '+name,()=>{const value=prerequisiteRecord();mutate(value);assert.throws(()=>assertPinnedNativeBrowserPrerequisites(value));});
