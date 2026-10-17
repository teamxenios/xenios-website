// UNAPPLIED. Run ONLY after executable acceptance + exact staging mutation admission.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { guardedRoute,trackedRoute,sanitizedOrigin,failureCode,createForwardingQueue } from './route-boundary.mjs';
import { hash,need,exact,canonical,receipt,expand,freezeExpected,identityAdmission,
  goldenVectors,assertLiveAnonymous,assertNoReceipt,deriveCase,anonymousRegressionVectors,
  CLAIM,LABELS,APP_SHA,APP_TREE } from './contracts.mjs';
const API='/api/research/early-access/request-intents';
const SESSION='/api/research/early-access/session';
const UNLOCK='/api/research/early-access/unlock';
const AGREEMENT='/api/research/early-access/agreements';
const COOKIE='__Host-XeniosPrivateEarlyAccess';
const WIZARD='/research/early-access/order-request';
const MARKER='xenios.assisted-order.intent-attempt.v1';
const [manifestPath,proofPath,outDir,toolsDir]=process.argv.slice(2);
let browser, contexts=[], timer, failure=null,forwardingQueue;
const evidence={claim:CLAIM,status:'NOT_STARTED',cases:[],accounting:[],
  sessionChecks:[],publicLoginFreeBootstrapProved:false,infrastructureGateUsed:false,
  memberLoginUsed:false,storageStateExportUsed:false,underlyingCustomerIdentityProved:false,
  browser_scenario_proved_by_this_query_alone:false,dbPersistenceVerified:false,
  staffReadbackVerified:false,adminPaymentRefusalVerified:false,cleanup:{},trueZoom:false};
const outputs=new Set();
let active=0, count=0, posts=0, totalBytes=0, phase='init';
let m,deadline,armed=null,current=null,freezeBeforePost;
const tasks=new Set();
// Anonymous cookie handles stay volatile; no password, member login or state import.

const contextRoles=new WeakMap(), cookieHandles=new Map();
const unlockPosts=new Map(), agreementPosts=new Map(), unlockExpiries=new Map();
async function write(name,value) {
  need(!outputs.has(name),'OUTPUT_OVERWRITE'); outputs.add(name);
  await fs.writeFile(path.join(outDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
function guard() {
  need(!failure,'PRIOR_FAILURE');
  need(Date.now()<deadline && Date.now()<Date.parse(m.expiresAt),'WINDOW_EXPIRED');
}
function recordFailure(code,info={}) {
  if(failure!==null) return;
  failure=code;
  evidence.firstFailure={code,phase,recordedAt:new Date().toISOString(),
    ...(typeof info.url==='string'?{origin:sanitizedOrigin(info.url)}:{})};
  forwardingQueue?.cancel(code);
}
function track(p) {return trackedRoute(p,tasks,recordFailure);}
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
  await context.route('**/*',route=>track(guardedRoute(route,{
    targetOrigin:m.origin,isFailed:()=>failure!==null,onFailure:recordFailure,
    onDenied:route=>{
      count++;
      if(evidence.accounting.length<m.limits.maxRequests) {
        evidence.accounting.push({index:count,role,phase,
          origin:sanitizedOrigin(route.request().url()),status:null,outcome:'ABORTED_BY_BOUNDARY'});
      } else evidence.accountingTruncated=true;
    },
    onAllowed:async(route,req,u)=>{
    guard(); count++;
    const row={index:count,role,phase,method:null,path:u.pathname,status:null,outcome:'PENDING'};
    evidence.accounting.push(row);
    const requestDeadlineAt=Math.min(Date.now()+m.limits.requestTimeoutMs,deadline,Date.parse(m.expiresAt));
    let release,admitted=false;
    try {
      need(count<=m.limits.maxRequests,'REQUEST_LIMIT');
      release=await forwardingQueue.acquire({requestDeadlineAt});
      guard();active++;admitted=true;
      row.inflightAtForward=active;
      row.method=req.method();
      need(await req.headerValue('authorization')===null,'NO_MEMBER_BEARER');
      const mutation=!['GET','HEAD'].includes(req.method());
      if(mutation) {
        posts++; need(posts<=m.limits.maxPosts,'POST_LIMIT');
        need(req.method()==='POST' && [API,API+'/recover',UNLOCK,AGREEMENT+'/accept'].includes(u.pathname),'UNAPPROVED_MUTATION');
        if(u.pathname===UNLOCK) {
          need(['a','b'].includes(role) && phase==='public-bootstrap','UNLOCK_SCOPE');
          need((unlockPosts.get(role)||0)===0,'ONE_UNLOCK_PER_CONTEXT');
          const body=req.postDataJSON();
          exact(body,{},'EXACT_AUTOMATIC_EMPTY_UNLOCK');
          unlockPosts.set(role,1);
        } else if(u.pathname===AGREEMENT+'/accept') {
          need(['a','b'].includes(role) && phase==='infrastructure-agreement','AGREEMENT_SCOPE');
          need((agreementPosts.get(role)||0)===0,'ONE_AGREEMENT_PER_CONTEXT');
          exact(req.postDataJSON(),m.publicModeWindow.requiredLegalPairs[0],'EXACT_LEGAL_PAIR');
          agreementPosts.set(role,1);
        } else if(u.pathname===API) {
          need(current && role===current.plan.ownerRole,'EXACT_SUBMIT_OWNER');
        }
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
      const remaining=requestDeadlineAt-Date.now();
      need(remaining>0,'REQUEST_TIMEOUT');
      guard();
      const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:remaining});
      row.status=response.status();
      need(row.status<300 || row.status>=400,'REDIRECT_REFUSED');
      const bytes=await response.body(); totalBytes+=bytes.length;
      need(bytes.length<=m.limits.maxResponseBytes && totalBytes<=m.limits.maxTotalResponseBytes,'RESPONSE_BYTES');
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
    } catch(e) {
      row.outcome='FAILED_OR_UNRESOLVED'; recordFailure(failureCode(e));
      await route.abort().catch(()=>{});
    } finally {if(admitted)active--;release?.();}
    }
  })));
}
async function browserPost(page,url,body) {
  guard();
  return page.evaluate(async({url,body})=>{
    const r=await fetch(url,{method:'POST',credentials:'include',cache:'no-store',
      headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  },{url,body});
}
async function get(page,url) {
  const response=await page.goto(m.origin+url,{waitUntil:'domcontentloaded'});
  need(response?.status()===200,'GET_JSON_STATUS');
  return JSON.parse(await page.locator('body').innerText());
}
async function pageGet(page,url) {
  return page.evaluate(async url=>{
    const r=await fetch(url,{credentials:'include',cache:'no-store'});
    if(r.status!==200)throw new Error('GET_REFUSED');
    return r.json();
  },url);
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
  const postsBeforeValidation=posts;
  await page.getByRole('button',{name:'Review request',exact:true}).click();
  need(await page.locator('input[name="name"]').isVisible() && posts===postsBeforeValidation,'CONTACT_VALIDATION_REQUIRED');
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
  need(await page.getByRole('button',{name:'Submit for review',exact:true}).isDisabled(),'ACKNOWLEDGMENTS_REQUIRED');
  for(let i=0;i<await boxes.count();i++) await boxes.nth(i).check();
}
async function recover(page,key,expected,kind) {
  phase=kind;
  const r=await browserPost(page,API+'/recover',{idempotencyKey:key});
  if(expected) {need(r.status===200,'OWNER_RECOVERY_STATUS');sameReceipt(r.body.receipt,expected);}
  else assertNoReceipt(r,kind);
  return r;
}
async function liveSession(page,role,point) {
  phase=role+'-session-'+point;
  need(contextRoles.get(page.context())===role,'EXACT_SESSION_CONTEXT');
  const check=await page.evaluate(async url=>{
    const r=await fetch(url,{credentials:'include',cache:'no-store'});
    return {status:r.status,body:await r.json()};
  },SESSION);
  const cookies=await page.context().cookies(m.origin);
  const owned=cookies.filter(c=>c.name===COOKIE);
  need(owned.length===1 && owned[0].httpOnly && owned[0].secure
    && owned[0].sameSite==='Strict' && owned[0].path==='/' && owned[0].expires>Date.now()/1000,'SERVER_COOKIE_ATTRIBUTES');
  assertLiveAnonymous(check,{unlockExpiresAt:unlockExpiries.get(role),
    cookieExpiresAtEpochSeconds:owned[0].expires});
  if(cookieHandles.has(role)) need(cookieHandles.get(role)===owned[0].value,'ANONYMOUS_HANDLE_CHANGED');
  else cookieHandles.set(role,owned[0].value);
  evidence.sessionChecks.push({role,point,status:check.status,authenticated:true,
    serverReportedExpiresAt:check.body.expiresAt??null,
    unlockResponseExpiresAt:unlockExpiries.get(role),cookieExpiresAtEpochSeconds:owned[0].expires,
    expiryBoundsAuthorize:false,httpOnly:true,secure:true,sameSite:'Strict',
    checkedAt:new Date().toISOString(),identityCompared:false});
  return check;
}
async function prepareContext(context,role) {
  const page=await context.newPage();
  phase='public-bootstrap';
  // Direct first navigation starts with no account, password or injected state.
  const [unlocked]=await Promise.all([
    page.waitForResponse(r=>r.url()===m.origin+UNLOCK && r.request().method()==='POST'),
    page.goto(m.origin+WIZARD),
  ]);
  need(unlocked.status()===200,'AUTOMATIC_PUBLIC_UNLOCK_REQUIRED');
  const issued=await unlocked.json();
  need(issued.ok===true && typeof issued.expiresAt==='string'
    && Date.parse(issued.expiresAt)>Date.now(),'ACTUAL_UNLOCK_EXPIRY_REQUIRED');
  unlockExpiries.set(role,issued.expiresAt);
  await page.getByTestId('quick-order-agreement-mount').waitFor();
  await settled();
  const ready=await liveSession(page,role,'after-public-bootstrap');
  need(ready.body.openAccess===true,'ACTUAL_OPEN_ACCESS_REQUIRED');
  need(await page.locator('input[type="password"]').count()===0,'NO_PUBLIC_PASSWORD_UI');
  need(await page.locator('a[href*="/member/login"]').count()===0,'NO_PUBLIC_MEMBER_LOGIN_UI');
  const standing=await pageGet(page,AGREEMENT);
  need(standing.ok===true,'ANONYMOUS_LEGAL_IDENTITY_REQUIRED');
  exact(standing.required,m.publicModeWindow.requiredLegalPairs,'ACTUAL_REQUIRED_LEGAL_PAIR');
  if(standing.accepted!==true) {
    phase='infrastructure-agreement';
    await page.getByTestId('early-access-agreement-checkbox').check();
    const accepted=page.waitForResponse(r=>r.url()===m.origin+AGREEMENT+'/accept' && r.request().method()==='POST');
    await page.getByTestId('early-access-agreement-submit').click();
    need((await accepted).status()===200,'CANONICAL_AGREEMENT_REFUSED');
    await settled();
  }
  const after=await pageGet(page,AGREEMENT);
  need(after.ok===true && after.accepted===true,'DURABLE_AGREEMENT_REQUIRED');
  await liveSession(page,role,'after-agreement');
  await page.close();
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
  forwardingQueue=createForwardingQueue({capacity:m.limits.maxInflight,maxPending:m.limits.maxRequests,
    timeoutMs:m.limits.requestTimeoutMs,deadlineAt:Math.min(deadline,Date.parse(m.expiresAt))});
  const proofRaw=await fs.readFile(proofPath,'utf8');
  need(hash(proofRaw)===m.providerProofSha256,'PROOF_HASH');
  identityAdmission(m,JSON.parse(proofRaw),Date.now());
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
  evidence.anonymousControls=anonymousRegressionVectors();

  await write('preflight.json',{claim:CLAIM,appSha:APP_SHA,appTree:APP_TREE,
    manifestSha256:hash(raw),proofSha256:hash(proofRaw),servedIdentityBasis:'provider-only',
    privatePairProvenance:false,labels:LABELS,toolchain:m.toolchain,startedAt:new Date().toISOString()});
  const {chromium}=await import(pathToFileURL(entry).href);
  browser=await chromium.launch({headless:true,executablePath:browserPath});
  need(browser.version()===m.toolchain.browserVersion,'BROWSER_VERSION');
  timer=setTimeout(()=>{recordFailure('RUN_DEADLINE');void browser.close().catch(()=>{});},m.limits.maxRunMs);
  const a=await browser.newContext({serviceWorkers:'block'});
  const b=await browser.newContext({serviceWorkers:'block'});
  const anon=await browser.newContext({serviceWorkers:'block'});
  contexts=[a,b,anon];
  need(a!==b && (await a.cookies()).length===0 && (await b.cookies()).length===0
    && (await anon.cookies()).length===0,'FRESH_ANONYMOUS_CONTEXTS');
  for(const [ctx,role] of [[a,'a'],[b,'b'],[anon,'anonymous']]) {
    contextRoles.set(ctx,role);await attachNetwork(ctx,role);
  }
  await prepareContext(a,'a');await prepareContext(b,'b');
  need(cookieHandles.get('a')!==cookieHandles.get('b'),'SEPARATE_SERVER_SESSION_HANDLES');
  const pageAnon=await anon.newPage();
  // Establish a same-origin page without minting a third anonymous session.
  phase='sessionless-initialization';await get(pageAnon,API+'/config');
  let baselineCatalog,baselineConfig;
  for(const planned of m.cases) {
    guard();phase='setup';
    const ownerContext=planned.ownerRole==='a'?a:b;
    const otherContext=planned.ownerRole==='a'?b:a;
    const otherRole=planned.ownerRole==='a'?'b':'a';
    const page=await ownerContext.newPage();await page.goto(m.origin+WIZARD);
    need(await page.locator('input[type="password"]').count()===0,'NO_CUSTOMER_PASSWORD_UI');
    need(await page.locator('a[href*="/member/login"]').count()===0,'NO_MEMBER_LOGIN_UI');
    await liveSession(page,planned.ownerRole,'before-'+planned.label);
    const items=await catalog(page);
    const config=await pageGet(page,API+'/config');
    const plan=deriveCase(planned,items,config);
    baselineCatalog??=plan.catalogSha256;baselineConfig??=plan.configSha256;
    need(plan.catalogSha256===baselineCatalog && plan.configSha256===baselineConfig,'AUTHORITATIVE_SNAPSHOT_STABLE');
    await write(plan.label+'.plan.json',{...plan,expectedExpandedLines:plan.lines.map(l=>
      expand(items.find(i=>i.productId===l.productId && i.variantId===l.variantId),l.quantity)),frozenAt:new Date().toISOString(),
      source:'anonymous-cookie-catalog-observation-before-request-post',publicBootstrapProved:true});
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
    need(await page.getByRole('status').filter({hasText:current.native.publicReference}).count()===1,'UI_REFERENCE');
    need(await page.evaluate(k=>sessionStorage.getItem(k),MARKER)===null,'MARKER_CLEARED');
    phase='replay';
    const replay=await browserPost(page,API,current.body);
    need(replay.status===200,'REPLAY_STATUS');sameReceipt(replay.body,current.native);
    const changed=structuredClone(current.body);changed.contact.fullLegalName+=' Correction';
    phase='conflict';const conflict=await browserPost(page,API,changed);
    need(conflict.status===409 && conflict.body.error==='attempt_conflict','REQUIRED_409');
    await recover(page,current.body.idempotencyKey,current.native,'owner-recover');
    const otherPage=await otherContext.newPage();await get(otherPage,API+'/config');
    await liveSession(otherPage,otherRole,plan.label+'-before-other-recover');
    await recover(otherPage,current.body.idempotencyKey,null,'other-recover');
    await liveSession(otherPage,otherRole,plan.label+'-after-other-recover');
    await recover(pageAnon,current.body.idempotencyKey,null,'sessionless-recover');
    await otherPage.close();await settled();
    const r=current.native;
    const checks={ownerRole:plan.ownerRole,identicalReplay:true,changedFact409:true,ownerRecovery:true,
      otherAnonymousNoReceipt:true,sessionlessDenial:true,otherSessionBefore:true,otherSessionAfter:true,
      contactValidationRequired:true,acknowledgmentsRequired:true,distinctnessBasis:'behavior-only',
      memberLoginUsed:false,publicLoginFreeBootstrapProved:true,underlyingCustomerIdentityProved:false};
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
  need([...unlockPosts.values()].reduce((n,v)=>n+v,0)===2,'EXACT_TWO_AUTOMATIC_PUBLIC_UNLOCKS');
  need([...agreementPosts.values()].reduce((n,v)=>n+v,0)<=2,'LEGAL_WRITE_CEILING');
  evidence.publicBootstrapWrites={unlocks:2,agreements:[...agreementPosts.values()].reduce((n,v)=>n+v,0)};
  evidence.publicLoginFreeBootstrapProved=true;
  evidence.status='PUBLIC_ANONYMOUS_STAGING_OBSERVATIONS_COMPLETE_DB_POST_IDENTITY_STAFF_PENDING';
  evidence.endedAt=new Date().toISOString();
} catch(e) {
  recordFailure(failureCode(e));
  evidence.status='FAILED';evidence.failure=failure;process.exitCode=1;
} finally {
  clearTimeout(timer);
  forwardingQueue?.cancel(failure??'RUN_FINISHED');
  cookieHandles.clear();unlockExpiries.clear();
  const closures=await Promise.allSettled(contexts.map(c=>c.close()));
  evidence.cleanup.contextsClosed=closures.every(x=>x.status==='fulfilled');
  if(!evidence.cleanup.contextsClosed) recordFailure('CONTEXT_CLOSE_FAILED');
  try {await browser?.close();evidence.cleanup.browserCloseResolved=true;}
  catch {evidence.cleanup.browserCloseResolved=false;recordFailure('BROWSER_CLOSE_FAILED');process.exitCode=1;}
  await Promise.allSettled([...tasks]);
  // Browser API closure is not an independent OS process census.
  evidence.cleanup.independentProcessClosureProved=false;
  evidence.cleanup.activeRequests=active;evidence.cleanup.handlers=tasks.size;
  evidence.forwarding=forwardingQueue?.stats()??null;
  evidence.cleanup.pendingRequests=evidence.forwarding?.pending??0;
  if(failure) {evidence.status='FAILED';evidence.failure=failure;}
  if(active || tasks.size || failure || !evidence.cleanup.contextsClosed) process.exitCode=1;
  if(m && outDir && outputs.has('preflight.json')) {
    try {await write('browser-evidence.json',evidence);} catch {process.exitCode=1;}
  }
  // Never print raw exception, body, state or credentials.
  console.log(JSON.stringify({status:evidence.status,exitCode:process.exitCode??0,
    browserQualificationPassed:false,claim:CLAIM}));
}
