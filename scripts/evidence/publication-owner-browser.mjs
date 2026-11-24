// Private, future qualification only. Importing starts no server/browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chrome.mjs';
import { CdpConnection, PageSession, sleep } from './lib/cdp.mjs';
import { inventoryDirectory, inventorySha256 } from './lib/immutable-dist.mjs';
import { PRODUCT, EXACT, DETAIL, PAGE, fixtureOrigin, syntheticSession } from './lib/product-studio-fixture.mjs';
import { navigateWholeRun } from './lib/product-studio-observation.mjs';
import { assertHostedDist } from './lib/hosted-preview-dist.mjs';
import { createRequestLifecycle, DENIAL_PROBE } from './lib/product-studio-lifecycle.mjs';
import { measureStudioViewport } from './lib/product-studio-viewport.mjs';
import { measureOwnerViewport, assertOwnerViewport, measureNamedOwnerLabel, assertNamedOwnerLabel } from './lib/publication-owner-viewport.mjs';
import { settledUnknown, assertOwnerWholeRun } from './lib/publication-owner-observation.mjs';
import { observeOriginalPageAbsence } from './lib/publication-owner-page-close.mjs';
import { verifyOwnerEmbeddedImageSource, withOwnerNativeCalendarSource, summarizeOwnerNetworkOrigins } from './lib/publication-owner-embedded-images.mjs';
import {observePinnedNativeBrowserPrerequisites,assertPinnedNativeBrowserPrerequisites,verifyPinnedOwnerNativeCalendarResource,measureOwnerNativeCalendarControl,bindOwnerNativeCalendarRows} from './lib/publication-owner-native-calendar.mjs';
import {inspectProtectedBrowserCopy,assertProtectedBrowserCopy} from './hosted-scenes/verified-chrome158-browser.mjs';
import { OWNER_SOURCE as SOURCE, OWNER_TREE as TREE, OWNER_MEDIA, OWNER_APPROVAL,
  OWNER_SOURCE_SHA256, OWNER_MEDIA_SHA256, EXPIRED_APPROVALS } from './lib/publication-owner-fixture.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const publication = `[...document.querySelectorAll('h2')].find(h=>h.textContent==='Exact variant publication')?.closest('section')`;
const owner = `[...document.querySelectorAll('h3')].find(h=>h.textContent==='Owner content and media approval')?.closest('section')`;
async function within(promise, ms) {
  let timer; try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_TIMEOUT')),ms);})]); }
  finally { clearTimeout(timer); }
}
export async function runPublicationOwnerBrowser({ origin, dist, out, role }) {
  assert(['owner','staff'].includes(role),'EXACT_ROLE_REQUIRED');
  const keep = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','USERPROFILE','HOME','LANG','TZ',
    'HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','PATHEXT','PLAYWRIGHT_BROWSERS_PATH','XR_EVIDENCE_CHROME']);
  for(const key of Object.keys(process.env)) if(!keep.has(key.toUpperCase())) delete process.env[key];
  origin=fixtureOrigin(origin); dist=realpathSync(dist); out=resolve(out); out=join(realpathSync(dirname(out)),basename(out));
  const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
  const inside=(f,r)=>f.toLowerCase()===r.toLowerCase()||f.toLowerCase().startsWith(r.toLowerCase()+sep);
  assert(!existsSync(out)&&!inside(out,repo)&&!inside(out,dist),'FRESH_EXTERNAL_OUTPUT_REQUIRED');
  const provenance=assertHostedDist(dist,SOURCE,TREE);
  const inventoryHash=()=>inventorySha256(inventoryDirectory(dist,new Set(['evidence-provenance.json'])));
  assert.equal(inventoryHash(),provenance.distInventorySha256);
  let embeddedSource=verifyOwnerEmbeddedImageSource(readFileSync(join(dist,'public/index.html')),
    readFileSync(join(dist,'public/assets/index-C84PvaFT.css')));
  const get=async path=>{
    const r=await fetch(origin+path,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(5000)});
    assert.equal(r.status,200); assert.equal(r.url,origin+path);
    const chunks=[];let bytes=0;for await(const c of r.body){bytes+=c.length;assert(bytes<2_000_000);chunks.push(Buffer.from(c));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const first=await get('/__product_studio_fixture');
  assert.equal(first.source,SOURCE);assert.equal(first.tree,TREE);assert(first.immutableDist);assert.deepEqual(first.provenance,provenance);
  assert.equal(first.protocol?.kind,'OWNER_APPROVAL_UI_PROTOCOL_FIXTURE_NOT_AUTHORITY');assert.equal(first.protocol.role,role);
  const runtimeSourceBindings=['scripts/evidence/lib/chrome.mjs','scripts/evidence/lib/cdp.mjs','scripts/evidence/lib/immutable-dist.mjs'].map(path=>{
    const expected=execFileSync('git',['-C',repo,'show',`${SOURCE}:${path}`]);
    const actual=readFileSync(join(repo,path));assert(actual.equals(expected),'ACTUAL_BROWSER_RUNTIME_SOURCE_MISMATCH');
    return{path,source:SOURCE,bytes:actual.length,sha256:hash(actual)};
  });
  const paths=['scripts/evidence/hosted-scenes/verified-chrome158-browser.mjs','scripts/evidence/hosted-scenes/verified-chrome158-profile.mjs','scripts/evidence/hosted-scenes/chrome158-package-profile.json','scripts/evidence/hosted-scenes/protected-browser.mjs','scripts/evidence/hosted-scenes/protected-browser-policy.mjs','scripts/preview-publication-owner.ts','scripts/evidence/publication-owner-browser.mjs','scripts/evidence/import-hosted-product-studio.mjs',
    'scripts/evidence/lib/publication-owner-fixture.mjs','scripts/evidence/lib/publication-owner-observation.mjs','scripts/evidence/lib/publication-owner-viewport.mjs',
    'scripts/evidence/lib/publication-owner-page-close.mjs','scripts/evidence/lib/publication-owner-page-close.test.mjs',
    'scripts/evidence/lib/publication-owner-embedded-images.mjs','scripts/evidence/lib/publication-owner-embedded-images.test.mjs',
    'scripts/evidence/lib/publication-owner-native-calendar.mjs','scripts/evidence/lib/publication-owner-native-calendar.test.mjs','scripts/evidence/lib/tb500-browser-identity.mjs',
    'scripts/evidence/lib/product-studio-fixture.mjs','scripts/evidence/lib/product-studio-observation.mjs','scripts/evidence/lib/product-studio-viewport.mjs',
    'scripts/evidence/lib/product-studio-lifecycle.mjs','scripts/evidence/lib/hosted-preview-dist.mjs','scripts/evidence/lib/hosted-preview-import.mjs',
    'scripts/evidence/lib/hosted-preview-css.mjs','scripts/evidence/lib/hosted-preview-pwa.mjs'];
  const inputs=paths.map(path=>{const b=readFileSync(join(repo,path));return{path,bytes:b.length,sha256:hash(b)};});
  mkdirSync(out);
  const result={kind:'PUBLICATION_OWNER_STAFF_UI_PROTOCOL_BROWSER',source:SOURCE,tree:TREE,role,provenance,inputs,
    runtimeSourceBindings:[...first.runtimeSourceBindings,...runtimeSourceBindings],gitPwaSupplements:first.gitPwaSupplements,
    scope:'Actual compiled UI and Supabase-verifying admin guard. Separate finite synthetic approval transport; NOT real owner, rights, storage, native approval, publication or release proof.',
    activation:'BOUNDED_DOM_CONTROL_EVENTS_NOT_KEYBOARD_CONFORMANCE',status:'NOT_RUN',failure:null,observations:[],captures:[],cleanup:{},
    startedAt:new Date().toISOString(),outerNamespaceReaperAndServerCleanupRequired:true};
  let browser,launchOwner,conn,page,primaryFailure=false,ownedPageTargetId=null;
  const lifecycle=createRequestLifecycle(origin),deadline=Date.now()+120000;
  class ObservedConnection extends CdpConnection {
    onMessage(message){try{lifecycle.cdp(message);}catch{result.diagnosticObservationFailed=true;}return super.onMessage(message);}
    send(method,params={},sessionId,options={}){
      const pending=super.send(method,params,sessionId,{...options,timeoutMs:Math.max(1,Math.min(options.timeoutMs??10000,deadline-Date.now()))});
      if(method!=='Target.closeTarget'||params.targetId!==ownedPageTargetId)return pending;
      const event={originalTargetId:ownedPageTargetId,requestedAtMs:Date.now(),replySuccess:null,error:null};
      result.pageCloseProtocol??=[];
      if(result.pageCloseProtocol.length===4){result.diagnosticObservationFailed=true;return pending;}
      result.pageCloseProtocol.push(event);
      return pending.then(reply=>{event.repliedAtMs=Date.now();event.replySuccess=reply?.success===true;return reply;},error=>{
        event.repliedAtMs=Date.now();event.error='TARGET_CLOSE_PROTOCOL_REJECTED';throw error;
      });
    }
  }
  const wait=async(fn,label)=>{for(let n=0;n<80;n++){
    assert(Date.now()<deadline,'BROWSER_DEADLINE');
    if(await within(fn(),Math.max(1,Math.min(5000,deadline-Date.now()))))return;
    await sleep(100);
  }throw Error('CONDITION_'+label);};
  const domWait=(expression,label)=>wait(()=>page.evaluate(expression),label);
  const navigate=async phase=>{lifecycle.phase(phase);await navigateWholeRun(page,origin+PAGE);};
  const button=(scope,label)=>`[...(${scope})?.querySelectorAll('button')??[]].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
  const click=async(scope,label)=>page.evaluate(`(()=>{const b=${button(scope,label)};if(!b||b.disabled)throw Error('ENABLED_BUTTON_REQUIRED');b.click();return true;})()`);
  const field=async(scope,label,value)=>page.evaluate(`(()=>{const p=${scope};const l=[...p.querySelectorAll('label')].find(l=>l.textContent===${JSON.stringify(label)});const e=l&&document.getElementById(l.htmlFor);if(!e||e.disabled)throw Error('FIELD_REQUIRED');const type=e.tagName==='SELECT'?HTMLSelectElement:e.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  const capture=async(name,width,articleExpected,anchor,namedLabel=null)=>{
    await page.settle();await page.evaluate(`(${anchor}).scrollIntoView({block:'center'})`);
    await page.settle();
    const measured=await page.evaluate(`(${measureOwnerViewport.toString()})(${publication},${measureStudioViewport.toString()})`);
    result.observations.push({name,viewportWidth:width,measurement:measured}); // Preserve failing geometry too.
    assertOwnerViewport(measured,{viewportWidth:width,articleExpected});
    if(namedLabel){
      const labelMeasurement=await page.evaluate(`(${measureNamedOwnerLabel.toString()})(${owner},${JSON.stringify(namedLabel)})`);
      result.observations.push({name:name+'-named-label',viewportWidth:width,measurement:labelMeasurement});
      assertNamedOwnerLabel(labelMeasurement,namedLabel);
    }
    assert.equal(await page.evaluate(`document.querySelector('#preview-exact-variant')?.value`),EXACT);
    const image=await page.screenshot({fullPage:false});assert(image.bytes.length>24&&image.bytes.length<8_000_000);
    assert.equal(image.bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(image.bytes.readUInt32BE(16),width);assert.equal(image.bytes.readUInt32BE(20),900);
    const file=`${role}-${name}-${width}.png`;writeFileSync(join(out,file),image.bytes,{flag:'wx'});
    result.captures.push({file,bytes:image.bytes.length,sha256:hash(image.bytes),width,height:900,personallyReviewed:false,namedLabel,
      coverage:image.coverage??null,notFullPage:true});
  };
  const bindNativeCalendarPhase=async(from,width)=>{
    const value=await page.evaluate(`(${measureOwnerNativeCalendarControl.toString()})()`);
    const binding=bindOwnerNativeCalendarRows(embeddedSource.nativeCalendar,value,page.network.slice(from),{origin,pathname:PAGE,width});
    (result.nativeCalendarBindings??=[]).push(binding);
  };
  try{
    result.protectedBrowserCopy=inspectProtectedBrowserCopy(dirname(out));
    assertProtectedBrowserCopy(result.protectedBrowserCopy);
    result.nativeCalendarPrerequisites=observePinnedNativeBrowserPrerequisites();
    assertPinnedNativeBrowserPrerequisites(result.nativeCalendarPrerequisites);
    browser=await launchChromium({onSpawned:value=>{launchOwner=value;}});
    const nativeCalendar=verifyPinnedOwnerNativeCalendarResource(browser);
    embeddedSource=withOwnerNativeCalendarSource(embeddedSource,nativeCalendar);result.nativeCalendarResource=nativeCalendar;
    conn=new ObservedConnection(browser.wsUrl);
    await within(conn.open(),10000);page=await PageSession.create(conn);
    ownedPageTargetId=page.targetId;result.ownedPageTargetId=ownedPageTargetId;
    await page.enforceNetworkBoundary(origin);
    await navigate('signed-out');await domWait(`Boolean(document.querySelector('[data-testid="form-adminx-signin"]'))`,'SIGNED_OUT');
    assert.equal(await page.evaluate(`Boolean(${publication})`),false);assert.equal((await get('/__product_studio_fixture')).counts.productReads,0);
    lifecycle.phase('invalid-bearer');const denial=await page.evaluate(`(${DENIAL_PROBE})(${JSON.stringify(DETAIL)})`);
    assert.equal(denial.status,401);assert.equal(denial.bodyDrained,true);await page.settle();
    assert.equal((await get('/__product_studio_fixture')).counts.productReads,0);
    result.guard={signedOutPanelAbsent:true,invalidBearerStatus:401,productReadsBeforeSyntheticSession:0};
    await page.evaluate(`localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(syntheticSession()))})`);
    for(const [index,width] of [1440,375].entries()){
      const phaseNetworkFrom=page.network.length;
      const phaseBefore=(await get('/__product_studio_fixture')).protocol.counts;
      await page.setViewport({width,height:900,deviceScaleFactor:1,mobile:width<768});await navigate('authenticated-'+width);
      await domWait(`Boolean(document.querySelector('#preview-exact-variant'))`,'PRODUCT_DETAIL');
      assert.equal(await page.evaluate(`document.querySelector('#preview-exact-variant').value`),'');
      await page.evaluate(`(()=>{const e=document.querySelector('#preview-exact-variant');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(EXACT)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await domWait(`(${publication})?.innerText.includes('Current generation: 7')`,'PUBLICATION_HEAD');
      await wait(async()=>{const c=(await get('/__product_studio_fixture')).protocol.counts;return c.headReads>phaseBefore.headReads&&c.approvalReads>phaseBefore.approvalReads;},'CURRENT_PHASE_READS');
      await page.settle();
      if(role==='staff'){
        assert.equal(await page.evaluate(`Boolean(${owner})`),false);
        await field(publication,'Reason for withdrawal or rollback','SYNTHETIC availability check only');
        assert.equal(await page.evaluate(`Boolean(${button(publication,'Withdraw current revision')}&&!(${button(publication,'Withdraw current revision')}).disabled)`),true);
        await capture('ordinary-staff',width,false,publication);await bindNativeCalendarPhase(phaseNetworkFrom,width);continue;
      }
      await domWait(`Boolean(${owner})`,'OWNER_PANEL');
      await field(owner,'Current approved media for owner review',OWNER_MEDIA);
      await domWait(`Boolean(${button(owner,'Preview exact bytes for approval')}&&!(${button(owner,'Preview exact bytes for approval')}).disabled)`,'MEDIA_SELECTED');
      await click(owner,'Preview exact bytes for approval');
      await domWait(`(${owner})?.innerText.includes(${JSON.stringify(OWNER_SOURCE_SHA256)})&&(${owner})?.innerText.includes(${JSON.stringify(OWNER_MEDIA_SHA256)})`,'EXACT_DIGESTS');
      for(const [label,value] of [['Existing content-review reference','SYNTHETIC-ONLY-CONTENT-REVIEW'],['Existing rights-evidence reference','SYNTHETIC-NOT-REAL-RIGHTS'],
        ['Reviewed width (pixels)','1'],['Reviewed height (pixels)','1'],['Reviewed representation','catalog_reference'],['Does this show a proposed packaging design?','no']])await field(owner,label,value);
      await domWait(`Boolean(${button(owner,'Record approval for this exact preview')}&&!(${button(owner,'Record approval for this exact preview')}).disabled)`,'METADATA_READY');
      await capture('exact-preview',width,true,button(owner,'Record approval for this exact preview'),'Record approval for this exact preview');
      const before=(await get('/__product_studio_fixture')).protocol.counts,networkFrom=page.network.length;
      await click(owner,'Record approval for this exact preview');
      await wait(async()=>{
        const state=await page.evaluate(`({pending:Boolean((${owner})?.querySelector('[role="alert"]')),retryEnabled:Boolean(${button(owner,'Retry exact approval command')}&&!(${button(owner,'Retry exact approval command')}).disabled)})`);
        return settledUnknown(page.network,networkFrom,origin,state);
      },'SETTLED_UNCONFIRMED_APPROVAL');await page.settle();
      assert.equal((await get('/__product_studio_fixture')).protocol.counts.approveCommits,before.approveCommits+1);
      const readsBefore=(await get('/__product_studio_fixture')).protocol.counts.approvalReads;
      await click(owner,'Read approval access and history');
      await wait(async()=> (await get('/__product_studio_fixture')).protocol.counts.approvalReads>readsBefore,'EXPLICIT_HISTORY_READ');
      await domWait(`Boolean(${button(owner,'Read approval access and history')}&&!(${button(owner,'Read approval access and history')}).disabled)`,'HISTORY_READ_SETTLED');
      await page.settle();assert.equal(await page.evaluate(`Boolean((${owner})?.querySelector('[role="alert"]'))`),true);
      await capture('unknown-after-read',width,false,button(owner,'Read approval access and history'),'Read approval access and history');
      const replayFrom=page.network.length;await click(owner,'Retry exact approval command');
      await wait(async()=> (await get('/__product_studio_fixture')).protocol.counts.approveReplays===before.approveReplays+1
        &&page.network.slice(replayFrom).some(r=>r.url===origin+OWNER_APPROVAL&&r.method==='POST'&&r.status===200),'SAME_KEY_REPLAY');
      await domWait(`!(${owner})?.querySelector('[role="alert"]')`,'PENDING_CLEARED');await page.settle();
      const after=(await get('/__product_studio_fixture')).protocol;
      const pair=after.records.filter(r=>r.operation==='approve').slice(-2);
      assert.deepEqual(pair.map(r=>r.status),[503,200]);assert.equal(pair[0].keySha256,pair[1].keySha256);assert.equal(pair[0].bodySha256,pair[1].bodySha256);
      assert.equal(after.counts.approveCommits,before.approveCommits+1);
      await field(owner,'Recorded approval to revoke',EXPIRED_APPROVALS[index]);await field(owner,'Revocation reason','SYNTHETIC revoke expired record');
      await domWait(`Boolean(${button(owner,'Revoke recorded approval')}&&!(${button(owner,'Revoke recorded approval')}).disabled)`,'REVOKE_READY');
      await click(owner,'Revoke recorded approval');
      await wait(async()=> (await get('/__product_studio_fixture')).protocol.history.find(r=>r.approvalId===EXPIRED_APPROVALS[index])?.recordedDecision==='revoked','EXPIRED_REVOKED');
      await domWait(`!(${owner})?.querySelector('[role="alert"]')&&(${owner})?.innerText.includes('Recorded revoked: ${EXPIRED_APPROVALS[index]}')`,'REVOKE_RECEIPT');
      await capture('recovered-and-revoked',width,false,`${owner}?.querySelector('h4')`);
      await bindNativeCalendarPhase(phaseNetworkFrom,width);
    }
    result.browserVersion=browser.browserVersion;
  }catch(error){primaryFailure=true;result.failure=String(error.message).slice(0,240);result.failureLifecycle=lifecycle.snapshot(page);}
  finally{
    const cleanupErrors=[];
    const cleanup=async(name,action)=>{try{await within(action(),3000);result.cleanup[name]=true;}catch(error){result.cleanup[name]=false;cleanupErrors.push(name+':'+String(error.message).slice(0,100));}};
    if(page)await cleanup('sessionRemoved',()=>page.evaluate(`localStorage.removeItem('sb-127-auth-token')`));
    if(page)await cleanup('pageCloseConfirmed',async()=>{
      assert.equal(page.targetId,ownedPageTargetId,'OWNED_PAGE_IDENTITY_CHANGED');
      await page.close(); // The inherited helper may swallow a failed CDP call.
      try{
        result.pageCloseObservation=await observeOriginalPageAbsence({originalTargetId:ownedPageTargetId,
          queryTargets:timeoutMs=>conn.send('Target.getTargets',{filter:[{}]},undefined,{timeoutMs})});
      }catch(error){result.pageCloseObservation=error.observation??null;throw error;}
    });
    if(conn)await cleanup('connectionClosed',async()=>{await conn.close();assert.equal(conn.ws?.readyState,3,'CDP_SOCKET_NOT_CLOSED');});
    if(launchOwner)await cleanup('ownedBrowserReleased',async()=>{await launchOwner.close();
      for(let n=0;n<20&&launchOwner.process.exitCode===null&&launchOwner.process.signalCode===null;n++)await sleep(100);
      result.cleanup.browserExitObserved=launchOwner.process.exitCode!==null||launchOwner.process.signalCode!==null;
      result.cleanup.profileAbsent=!existsSync(launchOwner.userDataDir);
      assert(result.cleanup.browserExitObserved&&result.cleanup.profileAbsent,'OWNED_BROWSER_RELEASE_UNCONFIRMED');});
    const final=await get('/__product_studio_fixture').catch(()=>null),native=await get('/__native_preview').catch(()=>null);
    result.finalFixture=final;result.nativeBlockedExternalRequests=native?.blockedExternalRequests??null;
    result.finalBrowserLifecycle=lifecycle.snapshot(page);result.cleanupErrors=cleanupErrors;
    result.wholeRunBrowserCounts={requests:page?.network?.length??null,violations:page?.networkBoundaryViolations?.length??null};
    try{
      assert(!primaryFailure,'PRIMARY_FAILURE_PRESERVED');assert.equal(cleanupErrors.length,0,'CLEANUP_UNCONFIRMED');
      assert(launchOwner&&result.cleanup.ownedBrowserReleased,'BROWSER_NOT_ACQUIRED_AND_RELEASED');
      result.wholeRunRequestClassification=summarizeOwnerNetworkOrigins(page.network,origin,embeddedSource);
      assert.equal(result.wholeRunRequestClassification.droppedDiagnostics,0,'ORIGIN_DIAGNOSTICS_TRUNCATED');
      assertOwnerWholeRun(page,final,role,origin,embeddedSource);assert.equal(result.captures.length,role==='owner'?6:2);
      assert(final.immutableDist&&inventoryHash()===provenance.distInventorySha256,'FINAL_DIST_PARITY');assert.equal(native?.blockedExternalRequests,0);
      assert(!result.diagnosticObservationFailed,'DIAGNOSTIC_OBSERVATION_FAILED');
      assert(inputs.every(f=>hash(readFileSync(join(repo,f.path)))===f.sha256),'FIXTURE_SOURCE_CHANGED');
      result.status='PASS_SYNTHETIC_UI_ONLY_NOT_AUTHORITY';
    }catch(error){result.status='FAILURE_PRESERVED_NO_RETRY';result.failure??=String(error.message).slice(0,240);}
    result.finishedAt=new Date().toISOString();result.bounds={browserRuntimeMs:120000,loopbackGetMs:5000,maxCaptures:role==='owner'?6:2,retries:0};
    writeFileSync(join(out,'publication-owner-browser-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const[a,origin,b,dist,c,out,d,role]=process.argv.slice(2);
  assert(a==='--base-url'&&b==='--dist-dir'&&c==='--out-dir'&&d==='--role'&&process.argv.length===10,'EXACT_ARGUMENTS_REQUIRED');
  const result=await runPublicationOwnerBrowser({origin,dist,out,role});
  console.log(JSON.stringify({status:result.status,captures:result.captures.length,failure:result.failure}));
  if(result.status!=='PASS_SYNTHETIC_UI_ONLY_NOT_AUTHORITY')process.exitCode=1;
}
