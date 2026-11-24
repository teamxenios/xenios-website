// Read-only bounded observation. This helper never closes/replaces a target and
// never substitutes browser/process exit for the ORIGINAL target's absence.
import assert from 'node:assert/strict';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function observeOriginalPageAbsence({originalTargetId,queryTargets,maxMs=1500,intervalMs=50,now=Date.now,pause=delay}){
  assert(typeof originalTargetId==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(originalTargetId),'OWNED_PAGE_IDENTITY_REQUIRED');
  assert(typeof queryTargets==='function'&&Number.isSafeInteger(maxMs)&&maxMs>0&&maxMs<=1500
    &&Number.isSafeInteger(intervalMs)&&intervalMs>0&&intervalMs<=50,'OWNED_PAGE_OBSERVATION_BOUND');
  const started=now(),deadline=started+maxMs;
  const observation={kind:'BOUNDED_ORIGINAL_PAGE_TARGET_ABSENCE',originalTargetId,startedAtMs:started,maxMs,
    maxSamples:32,perQueryMaxMs:250,state:'NOT_CONFIRMED',samples:[]};
  const fail=code=>{observation.state=code;observation.elapsedMs=Math.max(0,now()-started);
    throw Object.assign(Error(code),{observation});};
  for(let n=0;n<32;n++){
    const remaining=deadline-now();if(remaining<=0)break;
    let response,timer;
    try{
      const timeoutMs=Math.min(250,remaining);
      response=await Promise.race([queryTargets(timeoutMs),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Error('OWNED_PAGE_QUERY_TIMEOUT')),timeoutMs);
      })]);
    }catch(error){observation.queryFailure=error?.message==='OWNED_PAGE_QUERY_TIMEOUT'?'BOUNDED_QUERY_TIMEOUT':'QUERY_REJECTED';
      return fail('OWNED_PAGE_ABSENCE_OBSERVATION_FAILED');}
    finally{clearTimeout(timer);}
    const rows=response?.targetInfos;
    if(!Array.isArray(rows)||rows.length>1024||rows.some(t=>!t||typeof t.targetId!=='string'||!t.targetId.length)
      ||new Set(rows.map(t=>t.targetId)).size!==rows.length)return fail('OWNED_PAGE_TARGETS_RESPONSE_INVALID');
    const original=rows.find(t=>t.targetId===originalTargetId);
    observation.samples.push({afterMs:Math.max(0,now()-started),originalPresent:Boolean(original),targetCount:rows.length,
      originalType:typeof original?.type==='string'?original.type.slice(0,40):null,
      originalAttached:typeof original?.attached==='boolean'?original.attached:null});
    if(now()>deadline)return fail('OWNED_PAGE_ABSENCE_BUDGET_EXHAUSTED');
    if(!original){observation.state='ORIGINAL_TARGET_ABSENT';observation.elapsedMs=Math.max(0,now()-started);return observation;}
    const wait=Math.min(intervalMs,deadline-now());if(wait>0)await pause(wait);
  }
  return fail('OWNED_PAGE_STILL_PRESENT');
}
