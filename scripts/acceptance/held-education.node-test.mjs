import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHeldEducationLookup as lookup,heldEducationDigest as digest,heldEducationReceiptSha256 as receipt} from '../../server/research/master-offerings/held-education.ts';
const c={datasetSha256:'5'.repeat(64),family:'clinical_formulations_503a',offeringId:'mo_0a',sourceVariantId:'mov_0a'};
const h={staffReviewCode:'offering_decision',customerMessage:'This is a synthetic hold notice.',neutralSpecification:null};
const grant={...c,holdCode:h.staffReviewCode,holdMessage:h.customerMessage,summary:'Synthetic education only.',overview:'Technical overview for this synthetic case. See the cautions.',
 purpose:'Synthetic purpose sentence.',cautions:'Synthetic first caution.\n\nSynthetic second caution.',
 contentReviewReceiptSha256:receipt('synthetic content review 1'),displayDecisionReceiptSha256:receipt('synthetic display decision 2')};
const pin=r=>({...r,digest:digest(r)});
const exercise=(raw=[pin(grant)],ctx=c,hold=h)=>lookup(raw)(ctx,hold);
test('empty registry or no current hold gives no held education',()=>{assert.equal(exercise([]),undefined);assert.equal(exercise([pin(grant)],c,null),undefined);});
test('explicit row returns the four education fields verbatim without changing the hold; grants do not authorize commerce',()=>{
 const got=exercise();assert.deepEqual(got,{summary:grant.summary,overview:grant.overview,purpose:grant.purpose,cautions:grant.cautions});
 assert.ok(Object.isFrozen(got));assert.equal(h.staffReviewCode,'offering_decision');
 assert.equal(JSON.stringify(got).includes(grant.contentReviewReceiptSha256),false);
});
test('purpose and cautions are required: a row without either shows nothing',()=>{
 for(const f of ['purpose','cautions']){
  const {[f]:_,...rest}=grant;assert.equal(exercise([pin(rest)]),undefined,f+' absent');
  assert.equal(exercise([pin({...grant,[f]:''})]),undefined,f+' empty');
  assert.equal(exercise([pin({...grant,[f]:' padded '})]),undefined,f+' untrimmed');
 }
});
test('editing approved text, dataset, family, receipt, variant, hold code or hold message invalidates the exact approval',()=>{
 const r=pin(grant);for(const f of ['summary','overview','purpose','cautions','datasetSha256','family','offeringId','sourceVariantId','contentReviewReceiptSha256','displayDecisionReceiptSha256','holdCode','holdMessage','digest'])assert.equal(exercise([{...r,[f]:r[f]+'0'}]),undefined,f);
 assert.equal(exercise([r],{...c,datasetSha256:'b'.repeat(64)}),undefined);
 assert.equal(exercise([r],c,{...h,customerMessage:'A revised notice.'}),undefined);
});
test('only risk and offering holds on clinical 503A are eligible, with no redacted label',()=>{
 for(const code of ['identity_unconfirmed','label_or_source_needed','strength_or_formulation_unconfirmed','wording_decision','category_display_decision','description_pending','unknown']){
  assert.equal(exercise([pin({...grant,holdCode:code})],c,{...h,staffReviewCode:code}),undefined,code);
 }
 assert.equal(exercise([pin(grant)],c,{...h,neutralSpecification:'Strength unconfirmed.'}),undefined);
 assert.equal(exercise([pin({...grant,family:'supplements'})],{...c,family:'supplements'}),undefined);
 assert.ok(exercise([pin({...grant,holdCode:'risk_review'})],c,{...h,staffReviewCode:'risk_review'}));
});
test('duplicate rows fail closed only for the affected pair; ambiguous, absent or plain-text receipts refuse',()=>{
 const g=pin(grant);const another=pin({...grant,sourceVariantId:'mov_0b'});const fn=lookup([g,g,another]);
 assert.equal(fn(c,h),undefined);assert.ok(fn({...c,sourceVariantId:'mov_0b'},h));
 for(const bad of [{displayDecisionReceiptSha256:grant.contentReviewReceiptSha256},{contentReviewReceiptSha256:''},{displayDecisionReceiptSha256:'approved'},
  {contentReviewReceiptSha256:'KAN-98/165'},{overview:' '},{summary:'x\u0001'},{cautions:'x\u0007'}])assert.equal(exercise([pin({...grant,...bad})]),undefined,JSON.stringify(bad));
});
test('the registered rows carry no plain ticket reference',async()=>{
 const {readFileSync}=await import('node:fs');
 const text=readFileSync(new URL('../../server/research/master-offerings/held-education-registrations.ts',import.meta.url),'utf8');
 assert.equal(/\b[A-Z][A-Z0-9]+-\d+\/\d+\b/.test(text),false);
});
