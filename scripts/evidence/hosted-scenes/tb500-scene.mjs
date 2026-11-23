import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, realpathSync, readlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir, freemem, release as kernelRelease } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertPinnedOwnedBrowserIdentity } from './tb500-browser-identity.mjs';
const args=process.argv.slice(2);
assert(args.length===6 && args[0]==='--repo' && args[2]==='--input' && args[4]==='--out','EXACT_REPO_INPUT_OUT_ARGUMENTS');
const repo=realpathSync(args[1]), inputs=realpathSync(args[3]);
const root=join(realpathSync(dirname(resolve(args[5]))),basename(resolve(args[5])));
assert(!existsSync(root),'FRESH_EXTERNAL_EVIDENCE_OUTPUT_REQUIRED');
assert(root!==repo && root!==inputs && !root.startsWith(repo+'/') && !root.startsWith(inputs+'/'),'OUTPUT_MUST_BE_EXTERNAL');
const env=process.env;
const admission={actions:env.XR_QA_ACTIONS,started:Number(env.XR_QA_STARTED_MS),runId:env.XR_QA_RUN_ID,attempt:env.XR_QA_RUN_ATTEMPT,jobKey:env.XR_QA_JOB_KEY,parentNet:env.XR_QA_PARENT_NET_NS,parentPid:env.XR_QA_PARENT_PID_NS,chrome:env.XR_EVIDENCE_CHROME};
assert(process.platform==='linux' && admission.actions==='true' && Number.isFinite(admission.started) && Date.now()>=admission.started && Date.now()-admission.started<60000,'ACTIONS_CAPABILITY_MISSING');
assert(/^\d+$/.test(admission.runId??'') && /^\d+$/.test(admission.attempt??'') && /^[a-zA-Z0-9_-]+$/.test(admission.jobKey??''),'ACTIONS_IDENTITY_INVALID');
mkdirSync(root);
const source='83f95809d66520e7ab89588a3d99fbdf28bfc9aa';
const hash=b=>createHash('sha256').update(b).digest('hex');
const keep=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','PATHEXT','PLAYWRIGHT_BROWSERS_PATH','HOME','TMPDIR','LANG','TZ','XR_EVIDENCE_CHROME']);
const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
const report={kind:'ROOT_SELECTED_SINGLE_LINUX_ACTIONS_TB500_SUPPLEMENT',source,tree:'687cd9d57fc0a86a616db0731bd0a8441a4edfd5',originalHostedRun:45264187606,
 originalHostedRunner:'12592f6c2d7c9aba8a47291de3396925bd580666',originalBlankPng:'ecf5c1e6175954a6bacac8d319af05ac40dc5fe57ed0451e64cb56460399b63c',
 state:'NOT_RUN',startedAt:new Date().toISOString(),host:{platform:process.platform,node:process.version,kernel:kernelRelease()},actualQualificationRun:{id:admission.runId,attempt:admission.attempt,jobKey:admission.jobKey},scope:'One new Linux Actions synthetic Legacy catalog scene; not a rerun or replacement of original hosted image; no real Auth/assent/contact/request/provider/deploy.',
 viewport:{width:1440,height:900,font:16,deviceScaleFactor:1},scroll:{x:0,y:740,source:'Original hosted catalogPaint measurement'},requests:[],cleanup:{},failure:null};
let server,browser,conn,page,timer;let deadline=Date.now()+100000;
const within=async(p,ms=15000)=>{let t;try{return await Promise.race([p,new Promise((_,reject)=>t=setTimeout(()=>reject(Error('BOUNDED_OPERATION_TIMEOUT')),Math.max(1,Math.min(ms,deadline-Date.now()))))]);}finally{clearTimeout(t)}};
const captureOwnedBrowserIdentity=()=>{
 assert(browser && browser.process.exitCode===null && browser.process.signalCode===null,'OWNED_BROWSER_ALREADY_EXITED');
 const pid=browser.process.pid, proc=`/proc/${pid}`;
 const stat=()=>{const raw=readFileSync(proc+'/stat','utf8'),end=raw.lastIndexOf(')');assert(end>0,'OWNED_BROWSER_STAT_MALFORMED');const fields=raw.slice(end+2).trim().split(/\s+/);return{pid:Number(raw.slice(0,raw.indexOf('(')).trim()),state:fields[0],parentPid:Number(fields[1]),startTicks:fields[19]};};
 const first=stat(), launcherPath=realpathSync(browser.chromePath), executable=realpathSync(proc+'/exe');
 const sample={...first,launcherPath,launcherSha256:hash(readFileSync(launcherPath)),executable,
  executableSha256:hash(readFileSync(executable)),browserVersion:browser.browserVersion};
 const last=stat();assert.equal(last.pid,first.pid,'OWNED_BROWSER_PID_CHANGED_DURING_SAMPLE');assert.equal(last.startTicks,first.startTicks,'OWNED_BROWSER_START_CHANGED_DURING_SAMPLE');assert.equal(realpathSync(proc+'/exe'),executable,'OWNED_EXECUTABLE_CHANGED_DURING_SAMPLE');
 return sample;
};
try {
 assert(!existsSync(join(root,'supplement.png')) && !existsSync(join(root,'result.json')),'FRESH_ONE_SCENE_OUTPUT_REQUIRED');
 const paths=['scripts/evidence/owned-runner-preview.ts','scripts/evidence/owned-runner-browser-qa.mjs','scripts/evidence/lib/cdp.mjs','scripts/evidence/lib/chrome.mjs','scripts/evidence/lib/immutable-dist.mjs','scripts/evidence/lib/provenance.mjs'];
 report.runtime=paths.map(path=>{const b=readFileSync(join(repo,path));const expected=execFileSync('git',['--no-optional-locks','-C',repo,'show',`${source}:${path}`]);assert(b.equals(expected),'RUNTIME_SOURCE_CHANGED');return {path,bytes:b.length,sha256:hash(b)}});
 report.driver={bytes:readFileSync(new URL(import.meta.url)).length,sha256:hash(readFileSync(new URL(import.meta.url)))};
 const inventoryBytes=readFileSync(new URL('./tb500-static-inventory.json',import.meta.url));assert.equal(hash(inventoryBytes),'66d9ee73dd4affa1306650c755c7e2138093f5a6393a2e83866f184342d9aa37','EXPECTED_INVENTORY_BYTES');const inventory=JSON.parse(inventoryBytes);assert.equal(inventory.length,354);
 for(const r of inventory){const b=readFileSync(join(inputs,r.path));assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256)}
 const mod=path=>import(pathToFileURL(join(repo,path)).href);
 const [{startOwnedPreview},{launchChromium},{CdpConnection,PageSession}]=await Promise.all([mod('scripts/evidence/owned-runner-preview.ts'),mod('scripts/evidence/lib/chrome.mjs'),mod('scripts/evidence/lib/cdp.mjs')]);
 const control=await mod('scripts/evidence/owned-runner-browser-qa.mjs');
 const status=readFileSync('/proc/self/status','utf8');
 report.isolation=control.validateIsolation({uid:process.getuid(),netNamespace:readlinkSync('/proc/self/ns/net'),parentNetNamespace:admission.parentNet,
  interfaces:JSON.parse(execFileSync('/usr/sbin/ip',['-j','link','show'],{encoding:'utf8'})).map(i=>i.ifname).sort(),
  routes:[[],['-6']].flatMap(family=>JSON.parse(execFileSync('/usr/sbin/ip',[...family,'-j','route','show','table','main'],{encoding:'utf8'}))),
  effectiveCaps:/^CapEff:\s*(\w+)/m.exec(status)?.[1]??'unknown',noNewPrivs:/^NoNewPrivs:\s*(\d+)/m.exec(status)?.[1]??'unknown'});
 assert(/^pid:\[\d+\]$/.test(admission.parentPid??'') && readlinkSync('/proc/self/ns/pid')!==admission.parentPid,'PID_NAMESPACE_MISSING');report.isolation.pidNamespace=readlinkSync('/proc/self/ns/pid');
 for(const key of Object.keys(process.env))if(!keep.has(key.toUpperCase()))delete process.env[key];
 const git=(...args)=>execFileSync('git',['--no-optional-locks','-C',repo,...args],{encoding:'utf8'}).trim();
 assert.equal(git('rev-parse',source+'^{tree}'),'687cd9d57fc0a86a616db0731bd0a8441a4edfd5');
 report.actualQualificationExecution={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),parents:git('show','-s','--format=%P','HEAD').split(/\s+/).filter(Boolean),originalApplicationSubject:source};
 const provenance=await mod('scripts/evidence/lib/provenance.mjs');report.pinnedRuntime=provenance.assertPinnedExecutingRuntime();
 const marker=readFileSync(join(inputs,'PREVIEW-SOURCE.json'));assert.equal(hash(marker),'226688343d48495699b7a15d820c67d7aeed214b95d717f1ddc628927937b264','ORIGINAL_HOSTED_MARKER_REQUIRED');report.originalHostedMarker=JSON.parse(marker);
 report.resource={availableMiB:Math.floor(freemem()/1048576),minimumMiB:1400};assert(report.resource.availableMiB>=1400,'RESOURCE_GATE');
 server=await within(startOwnedPreview({root:inputs,inventory,ledger:report.requests,scenario:'premium-synthetic-catalog-display',displayContract:'legacy-eight-v1'}));
 report.origin=server.origin;report.fixture=server.displayReceipt;
 browser=await within(launchChromium({chromePath:realpathSync(admission.chrome),timeoutMs:20000,onSpawned:owner=>{browser=owner; assert.equal(realpathSync(dirname(owner.userDataDir)),realpathSync(tmpdir()));assert(/^xr-evidence-chrome-/.test(basename(owner.userDataDir)));}}),22000);
 report.browser={pid:browser.process.pid,version:browser.browserVersion,binary:browser.chromePath,binarySha256:hash(readFileSync(browser.chromePath)),profile:browser.userDataDir,diagnostics:browser.diagnostics()};
 const stamp=browser.diagnostics().startupObservations.find(r=>r.available && r.pid===browser.process.pid && /^\d+$/.test(r.startTicks??''));
 assert(stamp && stamp.parentPid===process.pid,'OWNED_BROWSER_SPAWN_STAMP_MISSING');
 report.ownedBrowserStamp={pid:browser.process.pid,parentPid:process.pid,startTicks:stamp.startTicks};
 const identityVerifier=readFileSync(new URL('./tb500-browser-identity.mjs',import.meta.url));report.identityVerifier={bytes:identityVerifier.length,sha256:hash(identityVerifier)};
 report.browserIdentityBefore=captureOwnedBrowserIdentity();
 report.browserIdentityInitialCheck=assertPinnedOwnedBrowserIdentity(report.ownedBrowserStamp,report.browserIdentityBefore,report.browserIdentityBefore);
 conn=new CdpConnection(browser.wsUrl);await within(conn.open());page=await within(PageSession.create(conn));
 await within(conn.send('Browser.setDownloadBehavior',{behavior:'deny'}));
 await within(page.enforceNetworkBoundary(server.origin));
 await within(page.setViewport({width:1440,height:900,deviceScaleFactor:1}));
 await within(page.send('Page.setFontSizes',{fontSizes:{standard:16,fixed:13}}));
 await within(page.navigate(server.origin+'/earlyaccess',{quietMs:150,maxSettleMs:5000,loadTimeoutMs:8000,resetRecords:false}));
 for(let i=0;i<80;i++){if(await within(page.evaluate(`document.querySelectorAll('.xenios-order-cards > article').length===8`)))break;if(i===79)throw Error('EIGHT_ORIGINAL_ROWS_NOT_READY');await new Promise(r=>setTimeout(r,100));}
 report.beforeDecode=await within(page.evaluate(`(async()=>{window.scrollTo(0,740);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const img=document.querySelector('img[src="/research/product-media/tb-500-10mg-website-render-v1-1024.webp"]');if(!img)throw Error('EXACT_IMAGE_MISSING');return{complete:img.complete,naturalWidth:img.naturalWidth,currentSrc:img.currentSrc,scrollX,scrollY};})()`));
 report.readiness='Original viewport/font/scroll restored; exact existing image.decode() and document.fonts.ready awaited, followed by two requestAnimationFrame callbacks; no CSS/DOM style changes, hiding, replacements, animation finishing or manual image reload.';
 report.observation=await within(page.evaluate(`(async()=>{
 const img=document.querySelector('img[src="/research/product-media/tb-500-10mg-website-render-v1-1024.webp"]');if(!img)throw Error('EXACT_IMAGE_MISSING');
 await img.decode();await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const r=img.getBoundingClientRect(),style=getComputedStyle(img);
 const label=e=>e?{tag:e.tagName,id:e.id,className:typeof e.className==='string'?e.className:'',src:e.getAttribute('src')}:null;
 const points=[[.25,.25],[.5,.5],[.75,.75],[.75,.25],[.25,.75]].map(([fx,fy])=>{const x=r.left+r.width*fx,y=r.top+r.height*fy,e=document.elementFromPoint(x,y);return{x,y,topmost:label(e),imageIsTopmost:e===img,imageContainsTopmost:img.contains(e)}});
 const ancestors=[];for(let e=img;e&&ancestors.length<12;e=e.parentElement){const s=getComputedStyle(e);ancestors.push({...label(e),display:s.display,visibility:s.visibility,opacity:s.opacity,position:s.position,zIndex:s.zIndex,contentVisibility:s.contentVisibility,animationName:s.animationName,animationPlayState:s.animationPlayState,transform:s.transform});}
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,canvas.width,canvas.height).data;let nonWhite=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&Math.min(d[i],d[i+1],d[i+2])<250)nonWhite++;
 return{path:new URL(img.currentSrc).pathname,alt:img.alt,currentSrc:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,decoding:img.decoding,loading:img.loading,
 rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
 computed:{display:style.display,visibility:style.visibility,opacity:style.opacity,objectFit:style.objectFit},ancestors,points,decodedPixels:{total:canvas.width*canvas.height,nonWhite,criterion:'alpha>0 and any RGB channel<250'},
 activeAnimations:document.getAnimations().map(a=>({playState:a.playState,currentTime:a.currentTime,target:label(a.effect?.target)})),rootFont:getComputedStyle(document.documentElement).fontSize,scrollX,scrollY,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
 })()`));
 assert.equal(report.observation.path,'/research/product-media/tb-500-10mg-website-render-v1-1024.webp');assert.equal(report.observation.naturalWidth,1024);assert.equal(report.observation.naturalHeight,1024);assert.equal(report.observation.rootFont,'16px');assert.equal(report.observation.scrollY,740);
 const response=report.requests.filter(r=>r.target===report.observation.path&&r.kind==='inventoried_asset');assert(response.length>0,'ACTUAL_IMAGE_RESPONSE_NOT_RECORDED');assert(response.every(r=>r.status===200&&r.responseSha256==='5947874079270bd33fbffe19a973cc7a22e6997d08f6cdafa4aea96335d300cc'),'RESPONSE_IDENTITY');report.imageResponses=response;
 report.browserIdentityAfter=captureOwnedBrowserIdentity();report.browserProc=report.browserIdentityAfter;
 report.browserIdentityObservationCheck=assertPinnedOwnedBrowserIdentity(report.ownedBrowserStamp,report.browserIdentityBefore,report.browserIdentityAfter);
 const image=await within(page.screenshot({fullPage:false}));assert.equal(image.coverage.capturedWidthPx,1440);assert.equal(image.coverage.capturedHeightPx,900);writeFileSync(join(root,'supplement.png'),image.bytes,{flag:'wx'});report.screenshot={file:'supplement.png',bytes:image.bytes.length,sha256:hash(image.bytes),coverage:image.coverage,personallyReviewed:false};
 report.network={requests:page.network,violations:page.networkBoundaryViolations};assert.equal(page.networkBoundaryViolations.length,0);assert(page.network.every(r=>['GET','HEAD'].includes(r.method)));
 assert.equal(server.counters.credentialAttempts,0);assert.equal(server.counters.refused,0);assert.equal(server.counters.unexpected,0);report.counters=server.counters;
 for(const r of inventory)assert.equal(hash(readFileSync(join(inputs,r.path))),r.sha256,'STATIC_INPUT_CHANGED');
 report.browserIdentityFinal=captureOwnedBrowserIdentity();report.browserIdentityFinalCheck=assertPinnedOwnedBrowserIdentity(report.ownedBrowserStamp,report.browserIdentityBefore,report.browserIdentityFinal);
 assert.equal(hash(readFileSync(new URL('./tb500-browser-identity.mjs',import.meta.url))),report.identityVerifier.sha256,'BROWSER_IDENTITY_VERIFIER_CHANGED');
 report.state='OBSERVED_ONE_SUPPLEMENT_NOT_YET_VISUALLY_ACCEPTED';
} catch(error){report.state='FAILURE_PRESERVED_NO_RETRY';report.failure=String(error.message).slice(0,500);process.exitCode=1;}
finally {
 deadline=Date.now()+16000;
 if(page)try{await within(page.close(),4000);report.cleanup.page=true}catch{report.cleanup.page=false}
 if(conn)try{await within(conn.close(),4000);report.cleanup.connection=true}catch{report.cleanup.connection=false}
 if(browser)try{await within(browser.close(),4000);report.cleanup.browserCloseRequested=true;await within(new Promise(resolve=>{if(browser.process.exitCode!==null||browser.process.signalCode!==null)return resolve();browser.process.once('exit',resolve)}),4000);report.cleanup.browserExitObserved=true;report.cleanup.profileAbsent=!existsSync(browser.userDataDir)}catch{report.cleanup.browserExitObserved=false}
 if(server)try{await within(server.close(),4000);report.cleanup.previewClosed=true}catch{report.cleanup.previewClosed=false}
 // BEGIN ACTUAL OWNED CLEANUP DECISION
 const requiredCleanup={
  page:!page || report.cleanup.page===true,
  connection:!conn || report.cleanup.connection===true,
  browserCloseRequested:!browser || report.cleanup.browserCloseRequested===true,
  browserExitObserved:!browser || report.cleanup.browserExitObserved===true,
  profileAbsent:!browser || report.cleanup.profileAbsent===true,
  previewClosed:!server || report.cleanup.previewClosed===true,
 };
 report.cleanup.unconfirmedResources=Object.entries(requiredCleanup).filter(([,ok])=>!ok).map(([name])=>name);
 report.cleanup.allOwnedReleased=report.cleanup.unconfirmedResources.length===0;
 if(!report.cleanup.allOwnedReleased){
  const cleanupCause='OWNED_CLEANUP_UNCONFIRMED:'+report.cleanup.unconfirmedResources.join(',');
  report.cleanup.failure=cleanupCause;
  report.state='FAILURE_PRESERVED_NO_RETRY';
  report.failure??=cleanupCause;
  process.exitCode=1;
 }
 // END ACTUAL OWNED CLEANUP DECISION
 report.finishedAt=new Date().toISOString();writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({state:report.state,failure:report.failure,screenshot:report.screenshot,cleanup:report.cleanup}));
}
