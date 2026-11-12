import test from 'node:test';
import assert from 'node:assert/strict';
import {bindReviewedXriQuoteLines as bind} from '../../server/research/assisted-order/quote/xri-line-bindings.ts';
import {AssistedOrderQuoteService as Service} from '../../server/research/assisted-order/quote/service.ts';
import {InMemoryAssistedOrderQuoteRepository as Repo} from '../../server/research/assisted-order/quote/memory-repository.ts';
function fixtures(){
  const id='1520449e-7cfd-4ebb-b193-bd85b507aeef';
  const source={productId:'one',variantId:'v-1',sourceVariantId:'source-v-1',quantity:2,catalogVersion:'catalog-A',workflowMode:'provider_request',clinicalReviewRequired:true,researchUseOnly:false};
  const intent={requestId:id,publicReference:'XRI-'+id.replaceAll('-','').toUpperCase(),kind:'unapproved_selection_request',status:'pending_review',lines:[source,{...source,productId:'two',variantId:'v-2',sourceVariantId:'source-v-2'}]};
  const target={requestId:'real-issue-request',sellerId:'seller-A',lines:[{lineId:'stored-line-91',productId:'one',variantId:'v-1',productName:'Example',specification:null,quantity:2,unitPriceCents:null,currency:'USD'}]};
  const link={xriRequestId:id,xriReference:intent.publicReference,issueRequestId:target.requestId,issueLineId:'stored-line-91',sellerId:'seller-A',approvalEvidenceId:'private-decision-9',clearedForQuotation:true,source:{...source}};
  return {intent,target,link};
}
test('returns only durable line IDs for the approved subset; original inquiry preserved; no prices, notes or contacts in projection',()=>{
  const {intent,target,link}=fixtures(); const before=structuredClone(intent);
  assert.deepEqual(bind(intent,target,[link]),[{requestLineId:'stored-line-91',productId:'one',variantId:'v-1',quantity:2}]);
  assert.deepEqual(intent,before);
});
test('requires persistent line identity and matching source, target, seller, and clearance',()=>{
  const {intent,target,link}=fixtures();
  for(const [field,value] of Object.entries({issueLineId:'v-1',xriRequestId:'other',xriReference:'other',issueRequestId:'other',sellerId:'other',approvalEvidenceId:' ',clearedForQuotation:false})){
    assert.throws(()=>bind(intent,target,[{...link,[field]:value}]),/not fully verified/);
  }
  assert.throws(()=>bind({...intent,publicReference:'XRI-OTHER'},target,[link]));
  assert.throws(()=>bind(intent,target,[]));assert.throws(()=>bind(intent,target,[link,link]));
});
test('rejects changed strength variant, source identity, quantity, catalog or category restrictions',()=>{
  const {intent,target,link}=fixtures();
  for(const [field,value] of Object.entries({productId:'other',variantId:'v-2',sourceVariantId:'alternate',quantity:1,catalogVersion:'stale',workflowMode:'request_pricing',clinicalReviewRequired:false,researchUseOnly:true})){
    assert.throws(()=>bind(intent,target,[{...link,source:{...link.source,[field]:value}}]));
  }
  for(const [field,value] of Object.entries({productId:'other',variantId:'v-2',quantity:1})){
    assert.throws(()=>bind(intent,{...target,lines:[{...target.lines[0],[field]:value}]},[link]));
  }
  assert.throws(()=>bind({...intent,lines:[...intent.lines,intent.lines[0]]},target,[link]));
  assert.throws(()=>bind(intent,{...target,lines:[...target.lines,...target.lines]},[link]));
});
function harness(){
  const repo=new Repo(), audits=[]; let seq=0; const admin={capabilities:new Set(['assisted_orders:manage']),actorLabel:'synthetic-issuer'};
  const sourceLine={productId:'p',variantId:'v',quantity:1,unitPriceCents:null,currency:'USD',specification:null,productName:'Synthetic'};
  const svc=new Service({repository:repo,requests:{bindingFor:async requestId=>({requestId,publicReference:'TEST'})},
    requestLines:{linesFor:async()=>['a','b'].map(lineId=>({...sourceLine,lineId}))},
    ids:{uuid:()=>String(++seq)},clock:{now:()=>new Date('2027-01-01T12:00:00Z')},audit:{record:async e=>{audits.push(e);}}});
  const input=(rows)=>({requestId:'rq',validUntil:'2027-01-02T12:00:00Z',lines:rows});
  const priced=(id,cents)=>({requestLineId:id,unitPriceCents:cents,pricingBasis:'test'});
  return {repo,audits,admin,svc,input,priced};
}
test('overflowing reissue leaves prior issued quote and audit intact',async()=>{
  const {repo,audits,admin,svc,input,priced}=harness(); const first=await svc.issue(admin,input([priced('a',100)]));
  await assert.rejects(svc.issue(admin,input([priced('a',Number.MAX_SAFE_INTEGER),priced('b',1)])),/safe integer/);
  assert.equal((await repo.byId(first.quoteId)).state,'issued');assert.equal(audits.length,1);
});
test('an accepted sibling blocks reissue without modifying an earlier issued record',async()=>{
  const {repo,audits,admin,svc,input,priced}=harness(); const first=await svc.issue(admin,input([priced('a',100)]));
  await repo.create({...await repo.byId(first.quoteId),quoteId:'inconsistent',version:2,state:'accepted'});
  await assert.rejects(svc.issue(admin,input([priced('a',102)])),/accepted quote/i);
  assert.equal((await repo.byId(first.quoteId)).state,'issued');assert.equal(audits.length,1);
});
test('valid reissue continues to supersede version one; issuing authority is still required',async()=>{
  const {repo,audits,admin,svc,input,priced}=harness(); const first=await svc.issue(admin,input([priced('a',100)]));
  await assert.rejects(svc.issue({capabilities:new Set(['assisted_orders:read_all'])},input([priced('a',45)])),/not authorized/);
  const replacement=await svc.issue(admin,input([priced('a',112)]));assert.equal(replacement.totalCents,112);
  assert.equal(replacement.version,2);assert.equal((await repo.byId(first.quoteId)).state,'superseded');
  assert.deepEqual(audits.map(e=>e.type),['assisted_order_quote_issued','assisted_order_quote_superseded','assisted_order_quote_issued']);
});
