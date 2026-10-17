// Executes the REAL driver with a synthetic, in-process Playwright stand-in.
// No browser binary, DNS, HTTP, credential, provider, staging or SQL access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {APP_SHA,APP_TREE,LABELS} from './contracts.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const driver=fileURLToPath(new URL('./hosted-browser.UNAPPLIED.mjs',import.meta.url));
const fake=`
import fs from 'node:fs/promises';
const calls=[],started=[];let contexts=0,forwarding=0,peakForwarding=0;
function request(url){return {url:()=>url,method:()=>{
  if(process.env.KAN31_OFFLINE_CASE==='method-throws')throw Error('METHOD_FAILED');
  return process.env.KAN31_OFFLINE_CASE==='post-limit'?'POST':'GET';
},headerValue:async()=>process.env.KAN31_OFFLINE_CASE==='queued-failure'?'Bearer synthetic-offline':null};}
export const chromium={launch:async()=>({
  version:()=> '149.0.7827.55',
  newContext:async()=>{contexts++;let handler;
    return {cookies:async()=>[],route:async(_pattern,h)=>{handler=h;},
      close:async()=>{calls.push('context-close');},
      newPage:async()=>({
        waitForResponse:async()=>({status:()=>200,json:async()=>({ok:true,expiresAt:new Date(Date.now()+60000).toISOString()})}),
        goto:async()=> {
          const mode=process.env.KAN31_OFFLINE_CASE;
          const burst=mode.startsWith('asset-burst')?Number(mode.split('-').at(-1)):
            mode==='queued-failure'||mode==='queue-timeout'?24:mode==='total-limit'?401:mode==='post-limit'?41:0;
          const urls=burst?Array.from({length:burst},(_,i)=>'https://xenios-research-staging.onrender.com/'+
            (mode==='post-limit'?'api/research/early-access/request-intents/recover?i=':'asset-')+i+'.js'):
            mode==='off-origin'?['https://user:password@outside.example/private?token=secret#fragment','https://xenios-research-staging.onrender.com/later']:
            ['https://xenios-research-staging.onrender.com/one','https://xenios-research-staging.onrender.com/two'];
          const handle=async(url)=>{
            const r={request:()=>request(url),abort:async()=>{calls.push('abort');},continue:async()=>{calls.push('continue');},
              fetch:async()=>{
                calls.push('fetch');started.push(urls.indexOf(url));forwarding++;peakForwarding=Math.max(peakForwarding,forwarding);
                try {if(burst)await new Promise(r=>setTimeout(r,mode==='queue-timeout'?100:10));
                  return {status:()=>200,body:async()=>Buffer.from('{}')};
                } finally {forwarding--;}
              },
              fulfill:async()=>{calls.push('fulfill');}};
            await handler(r);
          };
          if(burst)await Promise.all(urls.map(handle));else for(const url of urls)await handle(url);
          throw Error('OFFLINE_NAVIGATION_STOP');
        }
      })
    };
  },
  close:async()=>{calls.push('browser-close');await fs.writeFile(process.env.KAN31_OFFLINE_TRACE,JSON.stringify({calls,contexts,started,forwarding,peakForwarding}));}
})};
`;
for(const scenario of ['off-origin','request-limit','method-throws','low-memory','asset-burst-24','asset-burst-40',
  'queued-failure','queue-timeout','total-limit','post-limit']) test('real driver offline failure evidence: '+scenario,async()=>{
  assert.equal(process.version,'v20.19.0','Run offline integration under pinned Node20.19.0');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kan31-offline-'));
  try {
    const tools=path.join(root,'tools');await fs.mkdir(tools);
    await fs.writeFile(path.join(tools,'fake.mjs'),fake);
    await fs.writeFile(path.join(tools,'fake-browser'),'NOT_AN_EXECUTABLE');
    // Synthetic dependency ONLY in the offline child, never a driver bypass.
    // No executable browser exists here; hosted resource admission is unchanged.
    const preload=path.join(root,'offline-os.mjs');
    await fs.writeFile(preload,"import os from 'node:os';os.freemem=()=>"+
      (scenario==='low-memory'?'1024':'4096')+"*1048576;globalThis.fetch=()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};");
    const now=Date.now(),origin='https://xenios-research-staging.onrender.com';
    const proof={appSha:APP_SHA,appTree:APP_TREE,serviceId:'srv-d9h4f4m7r5hc73ctjng0',origin,deployId:'offline-only',status:'live',
      providerOnlyBasisAccepted:true,authorizationReference:'OFFLINE_ONLY_NO_HOSTED_AUTHORITY',publicStagingWindowReference:'OFFLINE_ONLY',observedAt:new Date(now).toISOString()};
    const proofRaw=JSON.stringify(proof);
    const address={line1:'1 Synthetic Way',city:'Test City',region:'CA',postalCode:'90001',countryCode:'US'};
    const m={appSha:APP_SHA,appTree:APP_TREE,origin,supabaseProject:'tetynodzrtmdbuzgboro',renderService:proof.serviceId,
      deployId:proof.deployId,servedIdentityBasis:'provider-only',providerEvidenceMaxAgeMs:300000,providerProofSha256:sha(proofRaw),
      executionAuthorization:'OFFLINE_ONLY_NO_HOSTED_AUTHORITY',executableAcceptance:'OFFLINE_STANDIN',expiresAt:new Date(now+120000).toISOString(),
      fixtureRecipe:'first-requestable-research-2-clinical-3-v1',publicBootstrapRequired:true,
      publicModeWindow:{mode:'time-limited-staging-open-access',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+120000).toISOString(),
        maxUnlockPosts:2,maxAgreementPosts:2,requiredLegalPairs:[{kind:'early_access_terms',version:'v1'}]},
      databaseSuccessorReview:'OFFLINE_ONLY',preStaffSnapshotRequired:true,
      toolchain:{acceptanceReference:'OFFLINE_ONLY',playwrightEntry:'fake.mjs',browserPath:'fake-browser',browserVersion:'149.0.7827.55',
        playwrightEntrySha256:sha(fake),browserSha256:sha('NOT_AN_EXECUTABLE'),inventorySha256:'offline-synthetic-inventory'},
      limits:{maxRunMs:600000,maxRequests:scenario==='request-limit'?1:400,maxPosts:40,maxInflight:8,maxResponseBytes:4194304,maxTotalResponseBytes:134217728,requestTimeoutMs:scenario==='queue-timeout'?25:10000},
      cases:LABELS.map((label,i)=>({label,ownerRole:i===2?'b':'a',contact:{fullLegalName:'Synthetic Mixed Qualification',
        email:['normal@example.invalid','retry@example.invalid','reload@example.invalid'][i],mobilePhone:'+12025550123',
        ageConfirmed:true,shippingAddress:address,billingSameAsShipping:true,billingAddress:address}}))};
    const raw=JSON.stringify(m),manifest=path.join(root,'manifest.json'),proofPath=path.join(root,'proof.json');
    const out=path.join(root,'evidence'),trace=path.join(root,'trace.json');
    await fs.writeFile(manifest,raw);await fs.writeFile(proofPath,proofRaw);
    const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,driver,manifest,proofPath,out,tools],{encoding:'utf8',timeout:15000,
      env:{...process.env,XENIOS_FROZEN_MANIFEST_SHA256:sha(raw),XENIOS_VERIFIED_NPM_VERSION:'10.8.2',
        XENIOS_VERIFIED_TOOL_INVENTORY:m.toolchain.inventorySha256,KAN31_OFFLINE_CASE:scenario,KAN31_OFFLINE_TRACE:trace}});
    assert.equal(result.error,undefined);assert.equal(result.status,1);
    assert.equal(result.stderr,'','No uncaught rejection/raw stack');
    if(scenario==='low-memory') {
      assert.ok(result.stdout.includes('"status":"FAILED"'));
      await assert.rejects(fs.access(trace));
      await assert.rejects(fs.access(out));
      return;
    }
    const evidence=JSON.parse(await fs.readFile(path.join(out,'browser-evidence.json'),'utf8'));
    assert.equal(evidence.status,'FAILED');
    const expected=scenario.startsWith('asset-burst')?'OFFLINE_NAVIGATION_STOP':
      scenario==='off-origin'?'OFF_ORIGIN_TRAFFIC':scenario==='method-throws'?'METHOD_FAILED':
      scenario==='queued-failure'?'NO_MEMBER_BEARER':scenario==='queue-timeout'?'INFLIGHT_WAIT_TIMEOUT':
      scenario==='post-limit'?'POST_LIMIT':'REQUEST_LIMIT';
    assert.equal(evidence.firstFailure.code,expected);
    assert.equal(evidence.failure,evidence.firstFailure.code);
    assert.equal(evidence.cleanup.activeRequests,0);assert.equal(evidence.cleanup.handlers,0);
    assert.equal(evidence.cleanup.contextsClosed,true);assert.equal(evidence.cleanup.browserCloseResolved,true);
    assert.equal(evidence.cleanup.independentProcessClosureProved,false);
    assert.equal(evidence.cleanup.pendingRequests,0);
    assert.equal(evidence.forwarding.active,0);assert.equal(evidence.forwarding.pending,0);
    assert.ok(evidence.forwarding.peakActive<=8);
    const t=JSON.parse(await fs.readFile(trace,'utf8'));
    assert.equal(t.contexts,3);assert.equal(t.calls.filter(x=>x==='context-close').length,3);
    if(scenario==='off-origin') {
      assert.equal(evidence.firstFailure.origin,'https://outside.example');
      assert.equal(t.calls.includes('fetch'),false);
      assert.ok(!JSON.stringify(evidence).includes('token=secret'));
      assert.ok(!JSON.stringify(evidence).includes('password'));
    } else if(scenario.startsWith('asset-burst')) {
      const n=Number(scenario.split('-').at(-1));
      assert.equal(evidence.accounting.length,n);assert.equal(t.calls.filter(x=>x==='fetch').length,n);
      assert.deepEqual(t.started,Array.from({length:n},(_,i)=>i));
      assert.equal(t.peakForwarding,8);assert.ok(evidence.forwarding.peakPending>=n-8);
      assert.ok(evidence.accounting.every(r=>r.status===200&&r.outcome==='DELIVERED'));
    } else if(scenario==='queued-failure') assert.equal(t.calls.includes('fetch'),false);
    else if(scenario==='post-limit') assert.ok(t.calls.filter(x=>x==='fetch').length<=40);
    else if(scenario==='total-limit') assert.ok(t.calls.filter(x=>x==='fetch').length<=400);
    else if(scenario==='queue-timeout') assert.ok(t.calls.filter(x=>x==='fetch').length<=8);
    else assert.equal(t.calls.filter(x=>x==='fetch').length,scenario==='method-throws'?0:1);
    assert.ok(t.peakForwarding<=8);
    assert.ok(result.stdout.includes('"status":"FAILED"'));
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
