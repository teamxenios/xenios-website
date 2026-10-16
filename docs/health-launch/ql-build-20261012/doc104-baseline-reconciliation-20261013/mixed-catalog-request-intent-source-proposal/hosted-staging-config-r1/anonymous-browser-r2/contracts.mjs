// UNAPPLIED source proposal. No application imports or runtime changes.
import { createHash } from 'node:crypto';
export const APP_SHA = '8efa9a9ef4e94773c446e7fa2a17cf00c6592d85';
export const APP_TREE = '0c92fdc66b122c5128d3904936c85ba9c912a5cc';
export const LABELS = ['normal_doubleclick','lost_response_retry','reload_recovery'];
export const CLAIM = 'Fresh public login-free Quick Order in an explicitly authorized staging open-access window; anonymous cookie-owned requests and behavioral A/B isolation, no member identity or private-pair provenance. No production or Doc399-equivalent proof.';
export const hash = text => createHash('sha256').update(text,'utf8').digest('hex');
export function need(ok, code) { if (!ok) throw new Error(code); }
export const exact = (a,b,code) => need(canonical(a)===canonical(b),code);
export function canonical(v) {
  if (v===null || typeof v!=='object') return JSON.stringify(v);
  if (Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
// Expected serializations are independent literals, not imported application output.
// Standard SHA-256 known-answer vector verifies the hash primitive separately.
export function goldenVectors() {
  need(hash('abc')==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','SHA256_VECTOR');
  const vectors = [
    [{z:2,a:1}, '{"a":1,"z":2}'],
    [{b:[{z:null,a:true},2],a:'line\n"slash\\'}, '{"a":"line\\n\\"slash\\\\","b":[{"a":true,"z":null},2]}'],
    [{kind:'unapproved_selection_request',lines:[{variantId:'v',quantity:2,productId:'p'}],
      contact:{email:'synthetic@example.invalid'},agreements:[]},
     '{"agreements":[],"contact":{"email":"synthetic@example.invalid"},"kind":"unapproved_selection_request","lines":[{"productId":"p","quantity":2,"variantId":"v"}]}'],
  ];
  for(const [input,literal] of vectors) {
    need(canonical(input)===literal,'SERIALIZATION_GOLDEN');
    need(hash(canonical(input))===hash(literal),'FINGERPRINT_GOLDEN');
  }
  return {count:vectors.length,hashKnownAnswer:true};
}
export function receipt(raw) {
  const keys=['kind','requestId','publicReference','status','createdAt'];
  need(raw && keys.every(k=>typeof raw[k]==='string'),'RECEIPT_SHAPE');
  need(raw.kind==='unapproved_selection_request' && raw.status==='pending_review','RECEIPT_STATE');
  need(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.requestId),'RECEIPT_ID');
  need(raw.publicReference==='XRI-'+raw.requestId.replaceAll('-','').toUpperCase(),'RECEIPT_REFERENCE');
  need(/^\d{4}-\d\d-\d\dT/.test(raw.createdAt) && Number.isFinite(Date.parse(raw.createdAt)),'RECEIPT_TIME');
  return Object.fromEntries(keys.map(k=>[k,raw[k]])); // original timestamp string, no roundtrip
}
export function expand(item,quantity) {
  need(item.selectableForReview && item.sourceSelection?.variantId,'CATALOG_BINDING');
  need(Number.isInteger(quantity) && quantity>=item.minimumQuantity
    && (item.maximumQuantity===null || quantity<=item.maximumQuantity)
    && (quantity-item.minimumQuantity)%item.quantityIncrement===0,'QUANTITY');
  if(item.clinicalReviewRequired) need(item.unitPriceCents===null,'CARE_PRICE_SUPPRESSION');
  const fields=['productId','variantId','productName','specification','family','workflowMode',
    'researchUseOnly','clinicalReviewRequired','sourceDisplayState','sourceVariantDisplayState',
    'sourceRefusal','catalogVersion'];
  need(fields.every(k=>Object.hasOwn(item,k)),'CATALOG_FIELDS');
  return {...Object.fromEntries(fields.map(k=>[k,item[k]])),
    sourceVariantId:item.sourceSelection.variantId,quantity,reviewState:'pending'};
}
export function freezeExpected(planned,body,items) {
  exact(body.contact,planned.contact,'CONTACT_PREBOUND');
  exact(body.lines,planned.lines,'SELECTION_PREBOUND');
  need(/^[a-f0-9-]{36}$/i.test(body.idempotencyKey),'ATTEMPT_KEY');
  need(body.agreements.length===planned.agreements.length,'AGREEMENTS_COUNT');
  const acceptedAt=body.agreements[0]?.acceptedAt;
  need(Number.isFinite(Date.parse(acceptedAt)),'ACCEPTANCE_TIME');
  exact(body.agreements.map(({kind,version,accepted})=>({kind,version,accepted})),
    planned.agreements,'AGREEMENTS_PREBOUND');
  need(body.agreements.every(a=>a.acceptedAt===acceptedAt),'ONE_ACCEPTED_AT');
  const lines=body.lines.map(l=>{
    const found=items.filter(i=>i.productId===l.productId && i.variantId===l.variantId);
    need(found.length===1,'EXACT_VARIANT'); return expand(found[0],l.quantity);
  });
  const expected_json=JSON.stringify({contact:planned.contact,agreements:body.agreements,lines});
  need(Buffer.byteLength(expected_json)<=32768,'EXPECTED_SIZE');
  return {expected_json,expected_sha256:hash(expected_json),
    expected_fingerprint:hash(canonical({kind:'unapproved_selection_request',
      contact:planned.contact,agreements:body.agreements,lines:planned.lines})),acceptedAt};
}
export function assertLiveAnonymous(check) {
  need(check?.status===200 && check.body?.authenticated===true,'LIVE_ANONYMOUS_SESSION_REQUIRED');
  need(typeof check.body.expiresAt==='string' && Date.parse(check.body.expiresAt)>Date.now(),'ANONYMOUS_SESSION_EXPIRY');
}
export function assertNoReceipt(response,kind) {
  const body=response?.body;
  const empty=response?.status===200 && body!==null && typeof body==='object'
    && !Array.isArray(body) && Object.keys(body).length===1
    && Object.hasOwn(body,'receipt') && body.receipt===null;
  if(kind==='other-recover') need(empty,'OTHER_ANONYMOUS_NO_RECEIPT');
  else need(kind==='sessionless-recover' && [401,403].includes(response?.status)
    && body!==null && typeof body==='object' && !Array.isArray(body)
    && typeof body.error==='string' && !('receipt' in body),'SESSIONLESS_DENIAL');
}
export function anonymousRegressionVectors() {
  let denied=0;
  const rejects=fn=>{let refused=false;try{fn();}catch{refused=true;}need(refused,'ANONYMOUS_REGRESSION_REJECT');denied++;};
  assertNoReceipt({status:200,body:{receipt:null}},'other-recover');
  for(const status of [401,403]) {
    rejects(()=>assertNoReceipt({status,body:{error:'unauthorized'}},'other-recover'));
    assertNoReceipt({status,body:{error:'unauthorized'}},'sessionless-recover');
  }
  rejects(()=>assertNoReceipt({status:200,body:{receipt:{requestId:'other'}}},'other-recover'));
  rejects(()=>assertNoReceipt({status:200,body:{receipt:null,extra:true}},'other-recover'));
  rejects(()=>assertNoReceipt({status:200,body:{receipt:null}},'sessionless-recover'));
  rejects(()=>assertLiveAnonymous({status:401,body:{authenticated:true,expiresAt:'2999-01-01T00:00:00Z'}}));
  rejects(()=>assertLiveAnonymous({status:200,body:{authenticated:false,expiresAt:'2999-01-01T00:00:00Z'}}));
  rejects(()=>assertLiveAnonymous({status:200,body:{authenticated:true,expiresAt:'2000-01-01T00:00:00Z'}}));
  rejects(()=>assertLiveAnonymous({status:200,body:{authenticated:true}}));
  assertLiveAnonymous({status:200,body:{authenticated:true,expiresAt:new Date(Date.now()+60000).toISOString()}});
  return {rejectionVectors:denied,positiveVectors:4,authoredControlOnly:true};
}
export function deriveCase(planned,items,config) {
  need(config?.enabled===true && Array.isArray(config.requiredAgreements)
    && Array.isArray(config.formAcknowledgments),'CURRENT_CONFIG');
  const allowed=(i,n)=>i.selectableForReview===true && i.sourceSelection?.variantId
    && Number.isInteger(i.minimumQuantity) && n>=i.minimumQuantity
    && (i.maximumQuantity===null || Number.isInteger(i.maximumQuantity)&&n<=i.maximumQuantity)
    && Number.isInteger(i.quantityIncrement) && i.quantityIncrement>0
    && (n-i.minimumQuantity)%i.quantityIncrement===0;
  const selected=[items.find(i=>i.researchUseOnly===true && i.clinicalReviewRequired===false && allowed(i,2)),
    items.find(i=>i.clinicalReviewRequired===true && i.researchUseOnly===false && allowed(i,3))];
  need(selected.every(Boolean),'ACTUAL_RESEARCH_AND_CLINICAL_REQUIRED');
  selected.forEach((i,n)=>expand(i,n===0?2:3));
  const agreements=[...config.requiredAgreements,...config.formAcknowledgments.filter(p=>
    p.scope==='always'||p.scope==='research_use_only')].map(({kind,version})=>({kind,version,accepted:true}));
  need(agreements.length>0 && agreements.every(p=>typeof p.kind==='string'&&typeof p.version==='string'),'CURRENT_AGREEMENTS');
  return {...planned,lines:selected.map((i,n)=>({productId:i.productId,variantId:i.variantId,quantity:n===0?2:3})),
    agreements,catalogSha256:hash(canonical(items)),configSha256:hash(canonical(config))};
}
export function identityAdmission(m,proof,now) {
  need(m.appSha===APP_SHA && m.appTree===APP_TREE,'EXACT_APP');
  need(m.origin==='https://xenios-research-staging.onrender.com'
    && m.supabaseProject==='tetynodzrtmdbuzgboro'
    && m.renderService==='srv-d9h4f4m7r5hc73ctjng0','EXACT_STAGING');
  need(m.servedIdentityBasis==='provider-only' && proof.providerOnlyBasisAccepted===true,'PROVIDER_ONLY_REVIEW');
  need(proof.appSha===APP_SHA && proof.appTree===APP_TREE && proof.serviceId===m.renderService
    && proof.origin===m.origin && proof.deployId===m.deployId && proof.status==='live','DEPLOY_BINDING');
  need(proof.authorizationReference && m.executionAuthorization && m.executableAcceptance,'ACTUAL_AUTHORITIES');
  need(m.providerEvidenceMaxAgeMs>0 && m.providerEvidenceMaxAgeMs<=300000
    && now-Date.parse(proof.observedAt)>=0
    && now-Date.parse(proof.observedAt)<=m.providerEvidenceMaxAgeMs
    && now<Date.parse(m.expiresAt),'IDENTITY_WINDOW');
  need(m.fixtureRecipe==='first-requestable-research-2-clinical-3-v1','FIXTURE_RECIPE');
  exact(m.cases.map(p=>p.label),LABELS,'EXACT_SCENARIOS');
  exact(m.cases.map(p=>p.ownerRole),['a','a','b'],'EXACT_OWNER_ALLOCATION');
  exact(m.cases.map(p=>p.contact.email),['normal@example.invalid','retry@example.invalid','reload@example.invalid'],'EXACT_SYNTHETIC_EMAILS');
  for(const p of m.cases) {
    const address={line1:'1 Synthetic Way',city:'Test City',region:'CA',postalCode:'90001',countryCode:'US'};
    exact(p.contact,{fullLegalName:'Synthetic Mixed Qualification',email:p.contact.email,
      mobilePhone:'+12025550123',ageConfirmed:true,shippingAddress:address,billingSameAsShipping:true,billingAddress:address},'EXACT_SYNTHETIC_CONTACT');
  }
  need(m.publicModeWindow?.mode==='time-limited-staging-open-access'
    && m.publicModeWindow.maxUnlockPosts===2 && m.publicModeWindow.maxAgreementPosts===2
    && proof.publicStagingWindowReference && m.publicBootstrapRequired===true,'PUBLIC_WINDOW_AUTHORITY');
  need(now>=Date.parse(m.publicModeWindow.startsAt)
    && Date.parse(m.publicModeWindow.endsAt)>=Date.parse(m.expiresAt)
    && now<Date.parse(m.publicModeWindow.endsAt),'PUBLIC_WINDOW_CURRENT');
  exact(m.publicModeWindow.requiredLegalPairs,[{kind:'early_access_terms',version:'v1'}],'EXACT_STAGE_LEGAL_PAIR');
  need(m.databaseSuccessorReview && m.preStaffSnapshotRequired===true,'DB_REVIEW_PREREQUISITE');
}
