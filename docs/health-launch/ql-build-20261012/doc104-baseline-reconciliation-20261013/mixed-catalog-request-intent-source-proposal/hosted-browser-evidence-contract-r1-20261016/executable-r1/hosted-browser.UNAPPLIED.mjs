// UNAPPLIED. Run ONLY after executable acceptance + exact staging mutation admission.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { hash,need,exact,canonical,receipt,freezeExpected,identityAdmission,
  goldenVectors,option2RegressionVectors,assertRelevantAuth,assertNoReceipt,
  assertAuthenticatedB,CLAIM,LABELS,APP_SHA,APP_TREE } from './contracts.mjs';
const API='/api/research/early-access/request-intents';
const MEMBER_ME='/api/research/member/me';
const WIZARD='/research/early-access/order-request';
const MARKER='xenios.assisted-order.intent-attempt.v1';
const [manifestPath,proofPath,outDir,toolsDir]=process.argv.slice(2);
let browser, contexts=[], timer, failure=null;
const evidence={claim:CLAIM,status:'NOT_STARTED',cases:[],accounting:[],
  sessionChecks:[],underlyingCustomerIdentityProved:false,
  browser_scenario_proved_by_this_query_alone:false,dbPersistenceVerified:false,
  staffReadbackVerified:false,adminPaymentRefusalVerified:false,cleanup:{},trueZoom:false};
const outputs=new Set();
let active=0, count=0, posts=0, totalBytes=0, phase='init';
let m,deadline,armed=null,current=null,freezeBeforePost;
const tasks=new Set();
// Volatile only: observe the existing UI's server-verified member bearer.
// Never read credentials from chat, decode identity, log headers or persist tokens.
const contextRoles=new WeakMap(), memberBearers=new Map();
async function write(name,value) {
  need(!outputs.has(name),'OUTPUT_OVERWRITE'); outputs.add(name);
  await fs.writeFile(path.join(outDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
function guard() {
  need(!failure,'PRIOR_FAILURE');
  need(Date.now()<deadline && Date.now()<Date.parse(m.expiresAt),'WINDOW_EXPIRED');
}
function track(p) {
  tasks.add(p); p.catch(()=>{failure??='NETWORK_HANDLER_FAILED';}).finally(()=>tasks.delete(p));
  return p;
}
async function settled() {
  for(let i=0;i<4;i++) {
    await Promise.allSettled([...tasks]); await new Promise(r=>setTimeout(r,250));
  }
  need(tasks.size===0 && active===0 && !failure,'UNSETTLED_REQUEST');
}
function sameReceipt(a,b) { exact(receipt(a),receipt(b),'SAME_NATIVE_RECEIPT'); }
async function readJsonResponse(r) {
  const body=await r.body(); totalBytes+=body.length;
  need(body.length<=m.limits.maxResponseBytes && totalBytes<=m.limits.maxTotalResponseBytes,'RESPONSE_BYTES');
  return JSON.parse(body.toString('utf8'));
}
async function attachNetwork(context,role) {
  await context.route('**/*',route=>track((async()=>{
    const req=route.request(), u=new URL(req.url());
    if(u.protocol==='data:') {await route.continue();return;}
    if(u.origin!==m.origin) {failure='OFF_ORIGIN_TRAFFIC'; await route.abort();return;}
    guard(); count++; active++;
    const row={index:count,role,phase,method:req.method(),path:u.pathname,status:null,outcome:'PENDING'};
    evidence.accounting.push(row);
    try {
      need(count<=m.limits.maxRequests && active<=m.limits.maxInflight,'REQUEST_LIMIT');
      const mutation=!['GET','HEAD'].includes(req.method());
      if(mutation) {
        posts++; need(posts<=m.limits.maxPosts,'POST_LIMIT');
        need(req.method()==='POST' && (u.pathname===API || u.pathname===API+'/recover'),'UNAPPROVED_MUTATION');
        need(role!=='b' || u.pathname===API+'/recover','B_NEVER_SUBMITS');
        if(role==='a' || role==='b') need(memberBearers.has(role)
          && await req.headerValue('authorization')===memberBearers.get(role),'SAME_MEMBER_REQUEST_AUTH');
      }
      let first=false;
      if(req.method()==='POST' && u.pathname===API) {
        const body=req.postDataJSON();
        if(phase==='initial') {
          exact({contact:body.contact,lines:body.lines},
            {contact:current.plan.contact,lines:current.plan.lines},'FIRST_BODY_FACTS');
          if(current.body) exact(body,current.body,'DOUBLECLICK_SAME_BODY');
          else {
            first=true; current.body=body;
            current.expected=freezeExpected(current.plan,body,current.catalog);
            // Actual generated key/acceptedAt are captured BEFORE network forwarding,
            // never taken from database readback. All customer facts were frozen earlier.
            const marker=await current.page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),MARKER);
            exact(marker,{key:body.idempotencyKey,acceptedAt:current.expected.acceptedAt,state:'in_flight'},'MARKER_BEFORE_POST');
            await freezeBeforePost(current);
          }
        } else {
          need(['retry','replay','conflict'].includes(phase),'SUBMIT_PHASE');
          if(phase!=='conflict') exact(body,current.body,'RETRY_IDENTITY');
          else {
            const changed=structuredClone(current.body); changed.contact.fullLegalName+=' Correction';
            exact(body,changed,'EXACT_CONFLICT_PROBE');
          }
        }
      }
      // Observe every HTTP outcome; no retry by Playwright on network errors.
      const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:m.limits.requestTimeoutMs});
      row.status=response.status();
      need(row.status<300 || row.status>=400,'REDIRECT_REFUSED');
      const bytes=await response.body(); totalBytes+=bytes.length;
      need(bytes.length<=m.limits.maxResponseBytes && totalBytes<=m.limits.maxTotalResponseBytes,'RESPONSE_BYTES');
      if(u.pathname===MEMBER_ME && req.method()==='GET' && row.status===200
        && (role==='a' || role==='b')) {
        const auth=await req.headerValue('authorization');
        need(typeof auth==='string' && /^Bearer \S+$/.test(auth)
          && JSON.parse(bytes.toString('utf8')).ok===true,'VERIFIED_UI_MEMBER_AUTH');
        need(!memberBearers.has(role) || memberBearers.get(role)===auth,'MEMBER_CREDENTIAL_CHANGED');
        memberBearers.set(role,auth);
      }
      if(req.method()==='POST' && u.pathname===API) {
        const data=JSON.parse(bytes.toString('utf8'));
        if(phase==='conflict') need(row.status===409 && data.error==='attempt_conflict','CONFLICT_REFUSAL');
        else {
          need(row.status===200,'SUBMIT_HTTP');
          const saved=receipt(data);
          if(current.native) sameReceipt(saved,current.native); else current.native=saved;
        }
      }
      if(first && armed===current.plan.label) {
        armed=null; row.outcome='UPSTREAM_SETTLED_DOWNSTREAM_ABORTED';
        await route.abort('failed'); return;
      }
      await route.fulfill({response,body:bytes});
      row.outcome='DELIVERED';
    } catch {
      row.outcome='FAILED_OR_UNRESOLVED'; failure??='NETWORK_CHECK_FAILED';
      await route.abort().catch(()=>{});
    } finally {active--;}
  })()));
}
async function browserPost(page,url,body) {
  guard();
  const role=contextRoles.get(page.context()), auth=memberBearers.get(role);
  if(role!=='anonymous') need(auth,'MEMBER_AUTH_NOT_OBSERVED');
  return page.evaluate(async({url,body,auth})=>{
    const r=await fetch(url,{method:'POST',credentials:'include',cache:'no-store',
      headers:{'content-type':'application/json',...(auth?{Authorization:auth}:{})},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  },{url,body,auth});
}
async function get(page,url) {
  const response=await page.goto(m.origin+url,{waitUntil:'domcontentloaded'});
  need(response?.status()===200,'GET_JSON_STATUS');
  return JSON.parse(await page.locator('body').innerText());
}
async function pageGet(page,url) {
  const auth=memberBearers.get(contextRoles.get(page.context()));
  need(auth,'MEMBER_AUTH_NOT_OBSERVED');
  return page.evaluate(async({url,auth})=>{
    const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{Authorization:auth}});
    if(r.status!==200) throw new Error('GET_REFUSED');
    return r.json();
  },{url,auth});
}
async function catalog(page) {
  const items=[];let total;
  for(let p=1;p<=50;p++) {
    const result=await pageGet(page,API+'/catalog?page='+p+'&pageSize=100');
    need(result.page===p && result.pageSize===100 && Number.isSafeInteger(result.total),'CATALOG_PAGE');
    total??=result.total;need(total===result.total,'CATALOG_TOTAL_STABLE');
    items.push(...result.items);
    if(items.length===total) break;
    need(items.length<total && result.items.length===100,'CATALOG_COMPLETE');
  }
  need(items.length===total && new Set(items.map(x=>canonical([x.productId,x.variantId]))).size===total,'CATALOG_UNIQUE');
  return items;
}
async function populate(page,plan,items) {
  await page.getByRole('heading',{name:'Request products for review',exact:true}).waitFor();
  for(const line of plan.lines) {
    const item=items.find(x=>x.productId===line.productId && x.variantId===line.variantId);
    need(item,'PLANNED_CATALOG_ITEM');
    const response=page.waitForResponse(r=>r.url().startsWith(m.origin+API+'/catalog?'));
    await page.getByLabel('Search catalog',{exact:true}).fill(item.productName);
    await response;
    const card=page.locator('article.xenios-order-card').filter({
      has:page.getByRole('heading',{name:item.productName,exact:true})})
      .filter({hasText:item.specification || 'Form not stated'});
    need(await card.count()===1,'EXACT_UI_VARIANT');
    await card.getByRole('button',{name:'Add '+item.productName+' to request',exact:true}).click();
    await card.getByLabel('Requested quantity for '+item.productName,{exact:true}).fill(String(line.quantity));
  }
  await page.getByRole('button',{name:'Continue to contact',exact:true}).click();
  const c=plan.contact;
  for(const [name,value] of Object.entries({name:c.fullLegalName,email:c.email,phone:c.mobilePhone,
    shippingLine1:c.shippingAddress.line1,shippingLine2:c.shippingAddress.line2 || '',
    shippingCity:c.shippingAddress.city,shippingRegion:c.shippingAddress.region,
    shippingPostalCode:c.shippingAddress.postalCode,shippingCountryCode:c.shippingAddress.countryCode})) {
    await page.locator('input[name="'+name+'"]').fill(value);
  }
  need(c.ageConfirmed===true && c.billingSameAsShipping===true,'SUPPORTED_SYNTHETIC_CONTACT');
  await page.locator('input[name="age"]').check();
  await page.getByRole('button',{name:'Review request',exact:true}).click();
  const boxes=page.locator('.xenios-order-acknowledgments input[type=checkbox]');
  need(await boxes.count()===plan.agreements.length,'UI_ACKNOWLEDGMENTS');
  for(let i=0;i<await boxes.count();i++) await boxes.nth(i).check();
}
async function recover(page,key,expected,kind) {
  phase=kind;
  const r=await browserPost(page,API+'/recover',{idempotencyKey:key});
  if(expected) {need(r.status===200,'A_RECOVERY_STATUS');sameReceipt(r.body.receipt,expected);}
  else assertNoReceipt(r,kind);
  return r;
}
async function liveSession(page,role,point) {
  phase=role+'-auth-'+point;
  const auth=memberBearers.get(role);
  need(auth && contextRoles.get(page.context())===role,'MEMBER_AUTH_NOT_OBSERVED');
  const check=await page.evaluate(async({url,auth})=>{
    const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{Authorization:auth}});
    return {status:r.status,body:await r.json()};
  },{url:MEMBER_ME,auth});
  evidence.sessionChecks.push({role,point,status:check.status,ok:check.body?.ok===true,
    checkedAt:new Date().toISOString(),identityCompared:false});
  assertRelevantAuth(check);
  return check;
}
try {
  need(process.version==='v20.19.0','PINNED_NODE');
  const raw=await fs.readFile(manifestPath,'utf8');
  need(hash(raw)===process.env.XENIOS_FROZEN_MANIFEST_SHA256,'MANIFEST_HASH');
  m=JSON.parse(raw); deadline=Date.now()+m.limits.maxRunMs;
  const freeMiB=os.freemem()/1048576;
  need(freeMiB>=2048,'BROWSER_MEMORY_FLOOR');
  evidence.resource={availableMiB:freeMiB,minimumMiB:2048,observedAt:new Date().toISOString()};
  need(m.limits.maxPosts>0 && m.limits.maxRequests>0 && m.limits.maxInflight>0
    && m.limits.maxResponseBytes>0 && m.limits.maxTotalResponseBytes>0
    && m.limits.requestTimeoutMs>0,'POSITIVE_LIMITS');
  need(m.limits.maxRunMs>0 && m.limits.maxRunMs<=600000 && m.limits.maxPosts<=40
    && m.limits.maxRequests<=400 && m.limits.maxInflight<=8
    && m.limits.maxResponseBytes<=4194304 && m.limits.maxTotalResponseBytes<=134217728
    && m.limits.requestTimeoutMs<=10000,'BOUNDED_LIMITS');
  const proofRaw=await fs.readFile(proofPath,'utf8');
  need(hash(proofRaw)===m.providerProofSha256,'PROOF_HASH');
  const states={a:await fs.readFile(process.env.XENIOS_STAGING_CUSTOMER_STORAGE_STATE_FILE,'utf8'),
    b:await fs.readFile(process.env.XENIOS_STAGING_SECOND_CUSTOMER_STORAGE_STATE_FILE,'utf8')};
  identityAdmission(m,JSON.parse(proofRaw),states,Date.now());
  need(process.env.npm_config_user_agent?.includes('npm/10.8.2')
    || process.env.XENIOS_VERIFIED_NPM_VERSION==='10.8.2','PINNED_NPM');
  need(m.toolchain.acceptanceReference && m.toolchain.playwrightEntrySha256
    && m.toolchain.browserSha256 && m.toolchain.inventorySha256,'APPROVED_TOOLCHAIN');
  const entry=path.resolve(toolsDir,m.toolchain.playwrightEntry);
  const browserPath=path.resolve(toolsDir,m.toolchain.browserPath);
  for(const p of [entry,browserPath]) need(p.startsWith(path.resolve(toolsDir)+path.sep),'TOOL_PATH');
  need(hash(await fs.readFile(entry))===m.toolchain.playwrightEntrySha256
    && hash(await fs.readFile(browserPath))===m.toolchain.browserSha256,'TOOL_HASH');
  // Full extracted bundle inventory is verified by the separately reviewed CI bootstrap.
  need(process.env.XENIOS_VERIFIED_TOOL_INVENTORY===m.toolchain.inventorySha256,'TOOL_INVENTORY');
  await fs.mkdir(outDir,{recursive:false,mode:0o700});
  evidence.golden=goldenVectors();
  evidence.option2Regressions=option2RegressionVectors();
  await write('preflight.json',{claim:CLAIM,appSha:APP_SHA,appTree:APP_TREE,
    manifestSha256:hash(raw),proofSha256:hash(proofRaw),servedIdentityBasis:'provider-only',
    privatePairProvenance:false,labels:LABELS,toolchain:m.toolchain,startedAt:new Date().toISOString()});
  const {chromium}=await import(pathToFileURL(entry).href);
  browser=await chromium.launch({headless:true,executablePath:browserPath});
  need(browser.version()===m.toolchain.browserVersion,'BROWSER_VERSION');
  timer=setTimeout(()=>{failure??='RUN_DEADLINE';void browser.close();},m.limits.maxRunMs);
  const a=await browser.newContext({storageState:JSON.parse(states.a),serviceWorkers:'block'});
  const b=await browser.newContext({storageState:JSON.parse(states.b),serviceWorkers:'block'});
  const anon=await browser.newContext({serviceWorkers:'block'});
  contexts=[a,b,anon];
  need(a!==b && hash(states.a)!==hash(states.b),'SEPARATE_SESSION_SETUP');
  for(const [ctx,role] of [[a,'a'],[b,'b'],[anon,'anonymous']]) {
    contextRoles.set(ctx,role);await attachNetwork(ctx,role);
  }
  const pageB=await b.newPage(), pageAnon=await anon.newPage();
  phase='initialization';
  await pageB.goto(m.origin+WIZARD); await pageAnon.goto(m.origin+WIZARD);
  const aProbe=await a.newPage();await aProbe.goto(m.origin+WIZARD);
  await settled();await liveSession(aProbe,'a','start');await aProbe.close();
  for(const plan of m.cases) {
    guard();phase='setup';
    const page=await a.newPage();await page.goto(m.origin+WIZARD);
    const items=await catalog(page);
    need(hash(canonical(items))===plan.catalogSha256,'CATALOG_SNAPSHOT_PIN');
    const config=await pageGet(page,API+'/config');
    need(hash(canonical(config))===plan.configSha256,'CONFIG_SNAPSHOT_PIN');
    current={plan,page,catalog:items,body:null,native:null,expected:null};
    await populate(page,plan,items);
    freezeBeforePost=async c=>{
      await write(plan.label+'.prepost.json',{label:plan.label,
        expected_json:c.expected.expected_json,expected_sha256:c.expected.expected_sha256,
        expected_fingerprint:c.expected.expected_fingerprint,catalogSha256:plan.catalogSha256,
        configSha256:plan.configSha256,frozenAt:new Date().toISOString(),beforeUpstream:true});
    };
    phase='initial';armed=plan.label==='normal_doubleclick'?null:plan.label;
    // Two click events reach the actual mounted handler; its lock prevents duplicate posts.
    await page.getByRole('button',{name:'Submit for review',exact:true}).evaluate(el=>{
      el.click();el.click();
    });
    if(plan.label==='normal_doubleclick') {
      await page.getByRole('heading',{name:'Request saved for review',exact:true}).waitFor();
    } else {
      await page.getByRole('alert').filter({hasText:'We could not confirm the result'}).waitFor();
      await settled();need(current.native && !armed,'ACTUAL_RESPONSE_LOSS');
      if(plan.label==='lost_response_retry') {
        phase='retry';await page.getByRole('button',{name:'Retry same request',exact:true}).click();
      } else {
        phase='remount';await page.reload();
        await page.getByRole('heading',{name:'Check your earlier request',exact:true}).waitFor();
        const marker=await page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),MARKER);
        need(Object.keys(marker).sort().join(',')==='acceptedAt,key,state'
          && marker.key===current.body.idempotencyKey
          && marker.acceptedAt===current.expected.acceptedAt,'PRIVATE_MARKER_ONLY');
        phase='recover-ui';await page.getByRole('button',{name:'Check saved request',exact:true}).click();
      }
      await page.getByRole('heading',{name:'Request saved for review',exact:true}).waitFor();
    }
    await settled();need(current.native,'NATIVE_RECEIPT');
    need((await page.getByRole('status').innerText()).includes(current.native.publicReference),'UI_REFERENCE');
    need(await page.evaluate(k=>sessionStorage.getItem(k),MARKER)===null,'MARKER_CLEARED');
    phase='replay';
    const replay=await browserPost(page,API,current.body);
    need(replay.status===200,'REPLAY_STATUS');sameReceipt(replay.body,current.native);
    const changed=structuredClone(current.body);changed.contact.fullLegalName+=' Correction';
    phase='conflict';const conflict=await browserPost(page,API,changed);
    need(conflict.status===409 && conflict.body.error==='attempt_conflict','REQUIRED_409');
    await recover(page,current.body.idempotencyKey,current.native,'a-recover');
    const bBefore=await liveSession(pageB,'b',plan.label+'-before');
    const bResult=await recover(pageB,current.body.idempotencyKey,null,'b-recover');
    const bAfter=await liveSession(pageB,'b',plan.label+'-after');
    assertAuthenticatedB(bBefore,bResult,bAfter);
    await recover(pageAnon,current.body.idempotencyKey,null,'anonymous-recover');
    await settled();
    const r=current.native;
    const checks={identicalReplay:true,changedFact409:true,aRecovery:true,bNoReceipt:true,anonymousNoReceipt:true,
      bAuthenticatedBefore:true,bAuthenticatedAfter:true,distinctnessBasis:'behavior-only',
      underlyingCustomerIdentityProved:false};
    evidence.cases.push({label:plan.label,receipt:r,...checks});
    const e=current.expected;
    await write(plan.label+'.binding.json',{label:plan.label,request_id:r.requestId,
      public_reference:r.publicReference,status:r.status,created_at:r.createdAt,
      expected_json:e.expected_json,expected_sha256:e.expected_sha256,
      expected_fingerprint:e.expected_fingerprint});
    await page.screenshot({path:path.join(outDir,plan.label+'.png'),fullPage:true});
    await page.close();
  }
  await settled();
  need(new Set(evidence.cases.map(c=>c.receipt.requestId)).size===3
    && new Set(evidence.cases.map(c=>c.receipt.publicReference)).size===3,'DISTINCT_CASE_RECEIPTS');
  evidence.status='BROWSER_OBSERVATIONS_COMPLETE_PENDING_INDEPENDENT_DB_AND_POST_IDENTITY';
  evidence.endedAt=new Date().toISOString();
} catch(e) {
  failure??=/^[A-Z0-9_]+$/.test(e.message)?e.message:'EXECUTION_FAILED_SANITIZED';
  evidence.status='FAILED';evidence.failure=failure;process.exitCode=1;
} finally {
  clearTimeout(timer);
  memberBearers.clear();
  const closures=await Promise.allSettled(contexts.map(c=>c.close()));
  evidence.cleanup.contextsClosed=closures.every(x=>x.status==='fulfilled');
  try {await browser?.close();evidence.cleanup.browserCloseResolved=true;}
  catch {evidence.cleanup.browserCloseResolved=false;process.exitCode=1;}
  // Browser API closure is not an independent OS process census.
  evidence.cleanup.independentProcessClosureProved=false;
  evidence.cleanup.activeRequests=active;evidence.cleanup.handlers=tasks.size;
  if(active || tasks.size || failure || !evidence.cleanup.contextsClosed) process.exitCode=1;
  if(m && outDir && outputs.has('preflight.json')) {
    try {await write('browser-evidence.json',evidence);} catch {process.exitCode=1;}
  }
  // Never print raw exception, body, state or credentials.
  console.log(JSON.stringify({status:evidence.status,exitCode:process.exitCode??0,
    browserQualificationPassed:false,claim:CLAIM}));
}
