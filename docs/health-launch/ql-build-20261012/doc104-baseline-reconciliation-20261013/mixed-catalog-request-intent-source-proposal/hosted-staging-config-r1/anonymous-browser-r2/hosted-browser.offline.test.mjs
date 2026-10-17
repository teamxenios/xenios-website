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
import {matchesCatalogSearch,selectCatalogVariant,populate} from './hosted-browser.UNAPPLIED.mjs';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createForwardingQueue} from './route-boundary.mjs';
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

const origin='https://xenios-research-staging.onrender.com';
const item={productId:'dcc384b5-a03f-4561-a2bc-3832d7ff2753',variantId:'050d029a-1b54-41bd-bfcb-282687852189',
  productName:'5-Amino-1MQ',specification:'5-AMINO-1MQ 50 mg'};
function selectionFixture({responseDelay=0,renderDelay=0,cards=[item],responseItem=item}={}) {
  let renderedAt=Infinity,waiter;const actions=[],diagnostics=[],ignored=[];
  const nowCards=()=>Date.now()>=renderedAt?cards:[];
  const marker=(kind,value)=>({kind,value,and(other){return marker('spec',other.value);}});
  const set=pred=>({
    filter({has}){return set(x=>pred(x)&&(has.kind==='heading'?x.productName===has.value:x.specification===has.value));},
    count:async()=>nowCards().filter(pred).length,
    evaluateAll:async fn=>fn(nowCards().filter(pred).map(x=>({querySelector:tag=>({textContent:tag==='h2'?x.productName:x.specification})}))),
    getByRole:()=>({click:async()=>{assert.equal(nowCards().filter(pred).length,1);actions.push('add');}}),
    getByLabel:()=>({fill:async quantity=>{actions.push('quantity:'+quantity);}}),
  });
  const response=(url,body)=>({url:()=>url,request:()=>({method:()=> 'GET'}),status:()=>200,json:async()=>body});
  const page={
    locator:selector=>selector==='p'?marker('p'):set(()=>true),
    getByRole:(_,{name})=>marker('heading',name),getByText:text=>marker('text',text),
    waitForResponse:async(predicate,{timeout})=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('RESPONSE_TIMEOUT')),timeout);
      waiter=(url,body)=>{if(predicate(response(url,body))){clearTimeout(timer);resolve(response(url,body));}else ignored.push(url);};
    }),
    getByLabel:()=>({fill:async search=>{
      const body={items:[responseItem],page:1,pageSize:24,total:1,families:[]};
      waiter(origin+'/api/research/early-access/request-intents/catalog?page=1&pageSize=24',body);
      setTimeout(()=>{
        renderedAt=Date.now()+renderDelay;
        waiter(origin+'/api/research/early-access/request-intents/catalog?'+new URLSearchParams({search,page:'1',pageSize:'24'}),body);
      },responseDelay);
    }}),
  };
  const expect=locator=>({toHaveCount:async(count,{timeout})=>{
    assert.ok(timeout>0&&timeout<=5000);const end=Date.now()+timeout;
    while(await locator.count()!==count) {if(Date.now()>=end)throw Error('COUNT_TIMEOUT');await new Promise(r=>setTimeout(r,5));}
  }});
  return {page,actions,diagnostics,ignored,options:{origin,expect,timeoutMs:200,onDiagnostic:d=>diagnostics.push(d)}};
}
test('Doc236 control 1: delayed exact search response ignores initial/unrelated catalog response',async()=>{
  const f=selectionFixture({responseDelay:40});
  await selectCatalogVariant(f.page,item,2,f.options);
  assert.deepEqual(f.actions,['add','quantity:2']);assert.equal(f.ignored.length,1);
  const r=(url,method='GET')=>({url:()=>url,request:()=>({method:()=>method})});
  const url=origin+'/api/research/early-access/request-intents/catalog?search=5-Amino-1MQ&page=1&pageSize=24';
  assert.equal(matchesCatalogSearch(r(url),origin,item.productName),true);
  assert.equal(matchesCatalogSearch(r(url,'POST'),origin,item.productName),false);
  assert.equal(matchesCatalogSearch(r(url.replace('pageSize=24','pageSize=100')),origin,item.productName),false);
});
test('Doc236 control 2: response-before-React-render retries rather than snapshotting zero',async()=>{
  const f=selectionFixture({renderDelay:50});
  await selectCatalogVariant(f.page,item,2,f.options);
  assert.deepEqual(f.actions,['add','quantity:2']);assert.equal(f.diagnostics.length,0);
});
test('Doc236 control 3: same-name longer-specification decoy is not the exact card',async()=>{
  const f=selectionFixture({cards:[item,{...item,specification:item.specification+' extended pack'}]});
  await selectCatalogVariant(f.page,item,2,f.options);
  assert.deepEqual(f.actions,['add','quantity:2']);
});
test('Doc236 control 4: absent and duplicate exact cards refuse with bounded public diagnostics',async()=>{
  for(const cards of [[],[item,item]]) {
    const f=selectionFixture({cards});f.options.timeoutMs=40;
    await assert.rejects(selectCatalogVariant(f.page,item,2,f.options),/EXACT_UI_VARIANT/);
    assert.deepEqual(f.actions,[]);assert.equal(f.diagnostics[0].uiVariantObservedCount,cards.length);
    assert.ok(f.diagnostics[0].cards.length<=5);
    assert.ok(f.diagnostics[0].cards.every(x=>Object.keys(x).sort().join()==='heading,specification'));
  }
});
test('Doc236 control 5: correct display text cannot substitute for exact response product/variant identity',async()=>{
  for(const responseItem of [{...item,productId:'wrong-product'},{...item,variantId:'wrong-variant'}]) {
    const f=selectionFixture({responseItem});
    await assert.rejects(selectCatalogVariant(f.page,item,2,f.options),/EXACT_UI_VARIANT/);
    assert.deepEqual(f.actions,[]);assert.equal(f.diagnostics.length,1);
  }
});

// The unchanged offline CI has already built exact 8efa and verified the full
// accepted tool inventory before invoking this file. Ordinary Node-only runs
// retain an explicit skip; they are never reported as a real UI rehearsal.
const application=process.env.GITHUB_WORKSPACE?path.join(process.env.GITHUB_WORKSPACE,'application'):null;
const acceptedTools=process.env.RUNNER_TEMP?path.join(process.env.RUNNER_TEMP,'qualification','tools'):null;
const hasRealInputs=application&&acceptedTools&&await fs.access(path.join(application,'dist/public/index.html')).then(()=>true,()=>false)
  &&await fs.access(path.join(acceptedTools,'node_modules/playwright/test.mjs')).then(()=>true,()=>false);
test('Doc236 exact 8efa real-browser synthetic form rehearsal stops before submit',{
  skip:hasRealInputs?false:'Requires existing offline runner with exact 8efa build and accepted tools; not browser-qualified locally',timeout:60000,
},async()=>{
  assert.equal(process.version,'v20.19.0');
  const free=os.freemem()/1048576;assert.ok(free>=2048,'Unchanged 2048 MiB browser admission');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:application,encoding:'utf8'}).trim(),APP_SHA);
  assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:application,encoding:'utf8'}).trim(),APP_TREE);
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd:application,encoding:'utf8'}).trim(),'');
  const root=path.dirname(acceptedTools),inventoryRaw=await fs.readFile(path.join(root,'tool-inventory.json'));
  assert.equal(sha(inventoryRaw),'7d7a507d0f2280e5efbca9c40f76b733b8c5a5bf8ba32c7b799e28bc1e52be54');
  const entry=path.join(acceptedTools,'node_modules/playwright/index.mjs');
  const assertions=path.join(acceptedTools,'node_modules/playwright/test.mjs');
  const exe=path.join(acceptedTools,'browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
  assert.equal(sha(await fs.readFile(entry)),'a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f');
  assert.equal(sha(await fs.readFile(assertions)),'1deb265617d0e87b6d05bf8b3d5bf73cd4b788665c249c609a01b94ceff2eea1');
  assert.equal(sha(await fs.readFile(exe)),'670ba079b75107746ba41abad131180a31a7c7219aa1bd4061fb471f4535d541');
  const {chromium}=await import(pathToFileURL(entry).href),{expect}=await import(pathToFileURL(assertions).href);
  const pair={kind:'early_access_terms',version:'v1'};
  const acknowledgments=['accuracy','contact_consent','request_notice','research_use_only'].map(id=>({id,
    scope:id==='research_use_only'?'research_use_only':'always',kind:'assisted_order_form_v1:'+id,version:'synthetic-v1',copy:'Synthetic acknowledgment: '+id}));
  const config={enabled:true,requiredAgreements:[pair],formAcknowledgments:acknowledgments};
  const research={...item,family:'research_capsules',researchUseOnly:true,clinicalReviewRequired:false,
    selectableForReview:true,workflowMode:'request_pricing',minimumQuantity:1,maximumQuantity:100,quantityIncrement:1,unitPriceCents:null};
  const clinical={...research,productId:'b4e50535-ec4b-4827-8339-2d0a202e945e',variantId:'15b13f74-e109-494b-8998-1202f33dc1aa',
    productName:'5-Amino-1Mq',specification:'5-AMINO-1MQ 5MG/ML (5ML)',family:'clinical_formulations_503a',
    researchUseOnly:false,clinicalReviewRequired:true,workflowMode:'provider_request'};
  const decoy={...research,variantId:'00000000-0000-4000-8000-000000000001',specification:item.specification+' extended pack (synthetic decoy)'};
  const items=[research,decoy,clinical],dist=path.join(application,'dist/public');
  const report={kind:'REAL_8EFA_UI_SYNTHETIC_API_SUBMIT_BOUNDARY_ONLY',appSha:APP_SHA,appTree:APP_TREE,
    driverSha256:sha(await fs.readFile(driver)),catalogSha256:sha(JSON.stringify(items)),availableMiB:free,
    realServer:false,stagingContacted:false,persistenceProved:false,requestIntentPosts:0,offOrigin:0,searches:[],
    browserClosed:false,serverClosed:false,independentProcessClosureProved:false};
  let server,browser;const active=new Set(),queue=createForwardingQueue({capacity:8,maxPending:400,timeoutMs:10000,deadlineAt:Date.now()+55000});
  let requests=0,posts=0,totalBytes=0;const diagnostics=[];
  try {
    server=http.createServer(async(req,res)=>{
      try {
        const u=new URL(req.url,'http://127.0.0.1');
        if(u.pathname.startsWith('/api/')) {
          let body={ok:true};
          if(u.pathname.endsWith('/early-access/session'))body={authenticated:true,openAccess:true};
          else if(u.pathname.endsWith('/early-access/agreements'))body={ok:true,accepted:true,required:[pair],agreement:pair};
          else if(u.pathname.endsWith('/policies'))body={policies:{'research-use':{title:'Synthetic offline policy',agreement:pair,sections:[]}}};
          else if(u.pathname.endsWith('/request-intents/config'))body=config;
          else if(u.pathname.endsWith('/request-intents/catalog')) {
            const search=u.searchParams.get('search')||'',page=Number(u.searchParams.get('page')||1),pageSize=Number(u.searchParams.get('pageSize')||24);
            const found=items.filter(x=>x.productName.toLowerCase().includes(search.toLowerCase()));
            if(search) {report.searches.push(search);await new Promise(r=>setTimeout(r,80));}
            body={items:found.slice((page-1)*pageSize,page*pageSize),total:found.length,page,pageSize,families:['research_capsules','clinical_formulations_503a']};
          } else if(req.method!=='GET')throw Error('OFFLINE_MUTATION_FORBIDDEN');
          res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));return;
        }
        let file=path.resolve(dist,'.'+decodeURIComponent(u.pathname));
        if(u.pathname==='/research/early-access/order-request')file=path.join(dist,'index.html');
        assert.ok(file.startsWith(dist+path.sep));
        const bytes=await fs.readFile(file),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
        res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});res.end(bytes);
      } catch {res.writeHead(404);res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const transport='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true,executablePath:exe,proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1'}});
    assert.equal(browser.version(),'149.0.7827.55');
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const job=(async()=>{
        const req=route.request(),u=new URL(req.url());let release;
        try {
          if(u.origin!==origin) {report.offOrigin++;throw Error('OFFLINE_EGRESS_REFUSED');}
          assert.ok(++requests<=400);
          if(req.method()!=='GET') {
            posts++;assert.ok(posts<=40);
            if(u.pathname==='/api/research/early-access/request-intents')report.requestIntentPosts++;
            throw Error('NO_FORM_POST_AUTHORIZED');
          }
          release=await queue.acquire({requestDeadlineAt:Date.now()+10000});
          const r=await route.fetch({url:transport+u.pathname+u.search,timeout:10000,maxRetries:0});
          const bytes=await r.body();totalBytes+=bytes.length;
          assert.ok(bytes.length<=4194304&&totalBytes<=134217728);
          await route.fulfill({response:r,body:bytes});
        } catch {await route.abort().catch(()=>{});} finally {release?.();}
      })();active.add(job);job.finally(()=>active.delete(job));return job;
    });
    const page=await context.newPage();await page.goto(origin+'/research/early-access/order-request');
    await page.getByRole('heading',{name:'Request products for review',exact:true}).waitFor({timeout:10000});
    const address={line1:'1 Synthetic Way',city:'Test City',region:'CA',postalCode:'90001',countryCode:'US'};
    const plan={lines:[{productId:research.productId,variantId:research.variantId,quantity:2},{productId:clinical.productId,variantId:clinical.variantId,quantity:3}],
      contact:{fullLegalName:'Synthetic Mixed Qualification',email:'normal@example.invalid',mobilePhone:'+12025550123',ageConfirmed:true,shippingAddress:address,billingSameAsShipping:true},
      agreements:[pair,...acknowledgments]};
    await populate(page,plan,items,{origin,expect,timeoutMs:5000,onDiagnostic:d=>diagnostics.push(d)});
    await expect(page.getByRole('button',{name:'Submit for review',exact:true})).toBeEnabled({timeout:5000});
    await expect(page.getByRole('heading',{name:'Review your request',exact:true})).toBeVisible();
    assert.equal(report.requestIntentPosts,0);assert.equal(posts,0);assert.equal(report.offOrigin,0);assert.deepEqual(diagnostics,[]);
    report.status='PASS_SUBMIT_BOUNDARY_NO_REQUEST_POST';report.quantities=[2,3];report.acknowledgments=5;
    report.contactValidationRequired=true;report.submitEnabled=true;report.requests=requests;
  } finally {
    queue.cancel('OFFLINE_REHEARSAL_FINISHED');
    if(browser){await browser.close();report.browserClosed=true;}
    await Promise.allSettled([...active]);report.forwarding=queue.stats();
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));report.serverClosed=!server.listening;}
    report.pendingHandlers=active.size;
    console.log('DOC236_REHEARSAL '+JSON.stringify(report));
  }
  assert.equal(report.browserClosed,true);assert.equal(report.serverClosed,true);assert.equal(active.size,0);
  assert.equal(report.forwarding.active,0);assert.equal(report.forwarding.pending,0);assert.ok(report.forwarding.peakActive<=8);
});
