import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHeldEducationLookup as lookup,heldEducationDigest as digest} from '../../server/research/master-offerings/held-education.ts';
const c={datasetSha256:'5'.repeat(64),family:'clinical_formulations_503a',offeringId:'mo_0a',sourceVariantId:'mov_0a'};
const h={staffReviewCode:'offering_decision',customerMessage:'This is a synthetic hold notice.',neutralSpecification:null};
const grant={...c,holdCode:h.staffReviewCode,holdMessage:h.customerMessage,summary:'Synthetic education only.',overview:'Technical overview for this synthetic case.',contentReviewJira:'KAN-98/165',displayDecisionJira:'KAN-98/166'};
const pin=r=>({...r,digest:digest(r)});
const exercise=(raw=[pin(grant)],ctx=c,hold=h)=>lookup(raw)(ctx,hold);
test('empty registry or no current hold gives no held education',()=>{assert.equal(exercise([]),undefined);assert.equal(exercise([pin(grant)],c,null),undefined);});
test('explicit row returns only two public fields without changing the hold; grants do not authorize commerce',()=>{
 const got=exercise();assert.deepEqual(got,{summary:grant.summary,overview:grant.overview});assert.ok(Object.isFrozen(got));assert.equal(h.staffReviewCode,'offering_decision');
});
test('editing approved text, dataset, family, receipt, variant, hold code or hold message invalidates the exact approval',()=>{
 const r=pin(grant);for(const f of ['summary','overview','datasetSha256','family','offeringId','sourceVariantId','contentReviewJira','displayDecisionJira','holdCode','holdMessage','digest'])assert.equal(exercise([{...r,[f]:r[f]+'0'}]),undefined,f);
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
test('duplicate rows fail closed only for the affected pair; ambiguous or absent receipt refuses',()=>{
 const g=pin(grant);const another=pin({...grant,sourceVariantId:'mov_0b'});const fn=lookup([g,g,another]);
 assert.equal(fn(c,h),undefined);assert.ok(fn({...c,sourceVariantId:'mov_0b'},h));
 for(const bad of [{displayDecisionJira:grant.contentReviewJira},{contentReviewJira:''},{displayDecisionJira:'approved'},{overview:' '},{summary:'x\u0001'}])assert.equal(exercise([pin({...grant,...bad})]),undefined);
});
