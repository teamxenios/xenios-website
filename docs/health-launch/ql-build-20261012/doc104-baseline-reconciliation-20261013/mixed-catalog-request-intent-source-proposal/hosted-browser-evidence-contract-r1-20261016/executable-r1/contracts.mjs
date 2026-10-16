// UNAPPLIED source proposal. No application imports or runtime changes.
import { createHash } from 'node:crypto';
export const APP_SHA = 'e33c12a999536cc87c7c0153e482220c533b9624';
export const APP_TREE = 'ab4415f0e1fb85171aeb9242ace0eb309d9651bf';
export const LABELS = ['normal_doubleclick','lost_response_retry','reload_recovery'];
export const CLAIM = 'observation-based ownership (behavioral A/B/anonymous, replay, 409), no private-pair provenance. Owner A/B distinctness is behavioral: authenticated B is refused A\'s receipt under A\'s key while A recovers it. No server identity value is compared.';
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
// Doc210 Option2: member/me proves live sign-in, NOT an exposed owner identity.
export function assertRelevantAuth(check) {
  need(check?.status===200 && check.body?.ok===true,'LIVE_MEMBER_SIGN_IN_REQUIRED');
}
export function assertNoReceipt(response,kind) {
  const body=response?.body;
  const empty=response?.status===200 && body!==null && typeof body==='object'
    && !Array.isArray(body) && Object.keys(body).length===1
    && Object.hasOwn(body,'receipt') && body.receipt===null;
  if(kind==='b-recover') need(empty,'AUTHENTICATED_B_NO_RECEIPT');
  else {
    need(kind==='anonymous-recover','NEGATIVE_ROLE');
    need(empty || ([401,403].includes(response?.status) && body!==null
      && typeof body==='object' && !Array.isArray(body)
      && typeof body.error==='string' && !('receipt' in body)),'ANONYMOUS_NO_RECEIPT');
  }
}
export function assertAuthenticatedB(before,recovery,after) {
  assertRelevantAuth(before);
  assertNoReceipt(recovery,'b-recover');
  assertRelevantAuth(after);
}
// Focused pure regression checks; no fetch, browser, credentials or application import.
export function option2RegressionVectors() {
  const auth=()=>({status:200,body:{ok:true}});
  const empty={status:200,body:{receipt:null}}, noAuth=status=>({status,body:{error:'authentication_required'}});
  let count=0;
  function expect(work,pass) {let ok=true;try{work();}catch{ok=false;}need(ok===pass,'OPTION2_REGRESSION');count++;}
  expect(()=>assertAuthenticatedB(auth(),empty,auth()),true);
  for(const status of [401,403]) {
    expect(()=>assertNoReceipt(noAuth(status),'b-recover'),false);
    expect(()=>assertNoReceipt(noAuth(status),'anonymous-recover'),true);
  }
  for(const body of [{receipt:{requestId:'unexpected'}},{receipt:null,extra:true},{},null,[]])
    expect(()=>assertNoReceipt({status:200,body},'b-recover'),false);
  for(const side of ['before','after']) {
    for(const defect of ['signed-out','unauthorized','forbidden','unavailable','malformed']) {
      const bad=auth();
      if(defect==='signed-out') bad.body.ok=false;
      if(defect==='unauthorized') bad.status=401;
      if(defect==='forbidden') bad.status=403;
      if(defect==='unavailable') bad.status=503;
      if(defect==='malformed') bad.body={};
      expect(()=>assertAuthenticatedB(side==='before'?bad:auth(),empty,
        side==='after'?bad:auth()),false);
    }
  }
  return {cases:count,scope:'pure-source-regressions-not-hosted'};
}
export function identityAdmission(m,proof,states,now) {
  need(m.appSha===APP_SHA && m.appTree===APP_TREE,'EXACT_APP');
  need(m.supabaseProject==='tetynodzrtmdbuzgboro' &&
    m.renderService==='srv-d9h4f4m7r5hc73ctjng0','EXACT_STAGING');
  const u=new URL(m.origin);
  need(u.protocol==='https:' && u.origin===m.origin && !u.username && !u.password
    && !['xeniostechnology.com','www.xeniostechnology.com'].includes(u.hostname),'STAGING_ORIGIN');
  need(m.servedIdentityBasis==='provider-only' && proof.providerOnlyBasisAccepted===true,'PROVIDER_ONLY_REVIEW');
  need(proof.appSha===APP_SHA && proof.appTree===APP_TREE && proof.serviceId===m.renderService
    && proof.origin===m.origin && proof.deployId===m.deployId && proof.status==='live','DEPLOY_BINDING');
  need(proof.authorizationReference && m.executionAuthorization && m.executableAcceptance,'ACTUAL_AUTHORITIES');
  need(now<Date.parse(m.expiresAt) && now-Date.parse(proof.observedAt)>=0
    && now-Date.parse(proof.observedAt)<=m.providerEvidenceMaxAgeMs,'IDENTITY_WINDOW');
  need(m.providerEvidenceMaxAgeMs>0 && m.providerEvidenceMaxAgeMs<=300000,'IDENTITY_AGE_LIMIT');
  exact(m.cases.map(c=>c.label),LABELS,'EXACT_SCENARIOS');
  need(m.cases.length===3 && new Set(m.cases.map(c=>c.contact.email)).size===3,'DISTINCT_SYNTHETIC_CONTACTS');
  need(m.cases.every(c=>c.contact.email.endsWith('@example.invalid')),'SYNTHETIC_EMAIL_ONLY');
  // Static evidence binds approved session input custody, not distinct customer IDs.
  // Live member/me checks and A/B recovery behavior establish Option2's claim.
  need(proof.principalEvidence?.authority==='server-session' &&
    proof.principalEvidence.sourceReference && proof.principalEvidence.aEligible===true
    && proof.principalEvidence.bEligible===true,'APPROVED_SESSION_INPUTS');
  for(const k of ['a','b']) need(proof.principalEvidence.stateSha256[k]===hash(states[k]),'STATE_IDENTITY_BINDING');
  need(proof.principalEvidence.expiresAt && now<Date.parse(proof.principalEvidence.expiresAt),'PRINCIPAL_EXPIRY');
  need(m.databaseSuccessorReview && m.preStaffSnapshotRequired===true,'DB_REVIEW_PREREQUISITE');
}
