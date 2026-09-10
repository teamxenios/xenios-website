import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Adapted from the hash-verified native-finish package; executes integrated source, not package copies.
const {test}=require('node:test');const assert=require('node:assert/strict');const C=await import('./qualification-control.ts');const {createAuthenticatedFaultPort}=await import('./managed-ports.ts');
const identity={runId:'qa-test-run',projectRef:'tetynodzrtmdbuzgboro',sourceSha:'a'.repeat(40),mode:'test',pid:process.pid,bootId:'boot-fixture'};
for(const env of [{NODE_ENV:'production'},{RENDER_SERVICE_ID:'service'},{VERCEL:'1'}])test(`control refuses deployed env ${Object.keys(env)[0]}`,()=>assert.throws(()=>C.assertChildIdentity(identity,env)));
test('control refuses production project',()=>assert.throws(()=>C.assertChildIdentity({...identity,projectRef:'yvzeduaxbwgcwllhywff'},{})));
test('fault is scoped, does not get consumed by a read or other member',async()=>{const f=new C.QualificationFaults(new Set(['member']));let calls=0;const send=f.wrapTransport(async()=>{calls++;return{status:200,body:{ok:true}}});f.arm('lost_response');await send({method:'GET',path:'/v1/payment_intents/pi_Test'});await send({method:'POST',path:'/v1/payment_intents',form:{'metadata[memberId]':'other'}});assert.equal(f.snapshot().consumed.length,0);await assert.rejects(send({method:'POST',path:'/v1/payment_intents',form:{'metadata[memberId]':'member'}}),e=>e.code==='injected_lost_provider_response');assert.equal(calls,3);await send({method:'POST',path:'/v1/payment_intents',form:{'metadata[memberId]':'member'}});assert.equal(f.snapshot().consumed.length,1);});
test('local commit fault preserves real store and fails only once',async()=>{const f=new C.QualificationFaults(new Set(['member']));let committed=0;const s=f.wrapExecutionStore({other(){return 7},async commitCaptured(){committed++;return {phase:'committed'}}},async id=>id==='mine');f.arm('local_commit');await s.commitCaptured('other',1);await assert.rejects(s.commitCaptured('mine',1));assert.equal(committed,1);await s.commitCaptured('mine',1);assert.equal(committed,2);assert.equal(s.other(),7);});
test('fault expires and cannot accidentally affect late request',async()=>{let n=0;const f=new C.QualificationFaults(new Set(['m']),()=>n);f.arm('lost_response');n=30001;await f.wrapTransport(async()=>({status:200,body:null}))({method:'POST',path:'/v1/payment_intents',form:{'metadata[memberId]':'m'}});assert.equal(f.snapshot().consumed.length,0);});
test('control is authenticated, origin-restricted and bound to expected identity',async()=>{const f=new C.QualificationFaults(new Set(['m']));const token='a'.repeat(64);const c=await C.startQualificationControl({identity,token,faults:f,env:{NODE_ENV:'development'}});try{
  let r=await fetch(c.origin+'/__qualification/identity');assert.equal(r.status,403);
  r=await fetch(c.origin+'/__qualification/identity',{headers:{Authorization:'Bearer '+token,Origin:'https://evil.example'}});assert.equal(r.status,403);
  r=await fetch(c.origin+'/__qualification/identity',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);assert.equal((await r.json()).identity.runId,identity.runId);
  const p=createAuthenticatedFaultPort(c.origin,token,identity);await p.injectTransportFault('lost_response');assert.equal(f.snapshot().armed,'lost_response');
  await assert.rejects(createAuthenticatedFaultPort(c.origin,token,{...identity,runId:'wrong-run'}).failNextLocalCommit());
  r=await fetch(c.origin+'/__qualification/fault',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fault:'create_unbounded'})});assert.equal(r.status,400);
  r=await fetch(c.origin+'/__qualification/fault',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'text/plain'},body:'{}'});assert.equal(r.status,400);
  r=await fetch(c.origin+'/other',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,404);
}finally{await c.close()}});
