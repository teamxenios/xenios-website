import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { observeOriginalPageAbsence } from './publication-owner-page-close.mjs';
const original='owned-original-page';
const row=targetId=>({targetId,type:'page',attached:true});
function fixture(lists,{maxMs=150}={}){
  let time=0,calls=0;const timeouts=[];
  const options={originalTargetId:original,maxMs,now:()=>time,pause:async ms=>{time+=ms;},
    queryTargets:async timeout=>{timeouts.push(timeout);return {targetInfos:lists[Math.min(calls++,lists.length-1)]};}};
  return{options,calls:()=>calls,timeouts};
}
test('explicit original absence passes even while an unrelated page remains',async()=>{
  const f=fixture([[row('unrelated-about-blank')]]),r=await observeOriginalPageAbsence(f.options);
  assert.equal(r.state,'ORIGINAL_TARGET_ABSENT');assert.equal(r.originalTargetId,original);assert.equal(r.samples.length,1);
});
test('causal control: immediate single sample rejects delayed release; bounded original-ID observation succeeds',async()=>{
  const first=[row(original),row('other-page')];
  assert.throws(()=>assert(!first.some(t=>t.targetId===original),'OLD_SINGLE_SAMPLE_STILL_PRESENT'),/OLD_SINGLE_SAMPLE/);
  const f=fixture([first,[row('other-page')]]),r=await observeOriginalPageAbsence(f.options);
  assert.deepEqual(r.samples.map(s=>s.originalPresent),[true,false]);assert.equal(r.elapsedMs,50);assert.equal(f.calls(),2);
});
test('never-released original target remains a failure within the finite budget',async()=>{
  const f=fixture([[row(original)]],{maxMs:100});
  await assert.rejects(observeOriginalPageAbsence(f.options),error=>{
    assert.equal(error.message,'OWNED_PAGE_STILL_PRESENT');assert(error.observation.samples.every(s=>s.originalPresent));
    assert(error.observation.samples.length<=32);assert.equal(error.observation.elapsedMs,100);return true;
  });
});
test('a mutable page slot cannot replace the captured original ID with an absent new target',async()=>{
  const page={targetId:original},captured=page.targetId;page.targetId='replacement-slot';
  const targets=[row(original)];assert(!targets.some(t=>t.targetId===page.targetId),'old mutable-slot predicate would pass');
  const f=fixture([targets],{maxMs:50});f.options.originalTargetId=captured;
  await assert.rejects(observeOriginalPageAbsence(f.options),error=>error.message==='OWNED_PAGE_STILL_PRESENT'&&error.observation.originalTargetId===original);
});
test('missing or malformed target inventories cannot stand in for target absence',async()=>{
  for(const response of [{},{targetInfos:null},{targetInfos:[{}]},{targetInfos:[row(original),row(original)]}]){
    await assert.rejects(observeOriginalPageAbsence({originalTargetId:original,queryTargets:async()=>response}),/TARGETS_RESPONSE_INVALID/);
  }
});
test('rejected or closed-connection query stays unconfirmed, not absent',async()=>{
  await assert.rejects(observeOriginalPageAbsence({originalTargetId:original,queryTargets:async()=>{throw Error('socket closed');}}),error=>{
    assert.equal(error.message,'OWNED_PAGE_ABSENCE_OBSERVATION_FAILED');assert.equal(error.observation.queryFailure,'QUERY_REJECTED');return true;
  });
});
test('unresponsive query has its own finite timeout and cannot produce a pass',async()=>{
  await assert.rejects(observeOriginalPageAbsence({originalTargetId:original,maxMs:15,queryTargets:()=>new Promise(()=>{})}),error=>{
    assert.equal(error.message,'OWNED_PAGE_ABSENCE_OBSERVATION_FAILED');assert.equal(error.observation.queryFailure,'BOUNDED_QUERY_TIMEOUT');return true;
  });
});
test('a response arriving outside the observation budget does not pass',async()=>{
  let time=0;
  await assert.rejects(observeOriginalPageAbsence({originalTargetId:original,maxMs:50,now:()=>time,queryTargets:async()=>{time=51;return{targetInfos:[]};}}),/BUDGET_EXHAUSTED/);
});
test('unknown identity and larger or unbounded observation budgets are refused before querying',async()=>{
  for(const change of [{originalTargetId:null},{originalTargetId:''},{maxMs:1501},{maxMs:Infinity},{intervalMs:0}]){
    let calls=0;await assert.rejects(observeOriginalPageAbsence({originalTargetId:original,queryTargets:async()=>{calls++;return{targetInfos:[]};},...change}));assert.equal(calls,0);
  }
});
test('observer issues no close request; driver keeps all later cleanup and final assertions',()=>{
  const helper=readFileSync(new URL('./publication-owner-page-close.mjs',import.meta.url),'utf8');
  assert(!helper.includes('Target.closeTarget')&&!helper.includes('browserExitObserved'));
  const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
  assert.equal(driver.match(/await page\.close\(\)/g)?.length,1);
  assert(driver.includes("'Target.getTargets',{filter:[{}]}"));assert(driver.includes('ownedPageTargetId=page.targetId'));
  assert(driver.includes('within(action(),3000)')&&driver.includes('CDP_SOCKET_NOT_CLOSED')&&driver.includes('OWNED_BROWSER_RELEASE_UNCONFIRMED'));
  assert(driver.includes("assert.equal(cleanupErrors.length,0,'CLEANUP_UNCONFIRMED')"));
  assert(driver.indexOf('assertOwnerWholeRun(page,final,role,origin,embeddedSource)')>driver.indexOf("cleanup('ownedBrowserReleased'"));
});
