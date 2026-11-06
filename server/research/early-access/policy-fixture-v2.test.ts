import { test } from 'vitest';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { policyBodyDigest, assertSyntheticOrigin, verifySyntheticPolicyProtocol,
 makeLoopbackBrowserRequest, POLICY_V2_EXPECTATION } from '../../../scripts/evidence/lib/policy-fixture-v2.mjs';
const ORIGIN='http://127.0.0.1:4321';
const fresh=(version)=>({title:version==='v2'?'Synthetic Product Policy':'Synthetic Research Policy',updated:'SYNTHETIC TEST',agreement:{kind:'early_access_terms',version},sections:[{heading:'Scope',paragraphs:['Synthetic text only.'],bullets:['No production claim.']}]});
function fixture(mutator) {
 const v2=fresh('v2'),v1=fresh('v1');
 const expected={...POLICY_V2_EXPECTATION,bodySha256:policyBodyDigest(v2),historicalBodySha256:policyBodyDigest(v1)};
 let accepted=false,writes=0;const calls=[];
 const request=async req=>{
  calls.push(req);const step=calls.length;let result;
  if(req.path==='/api/research/policies')result={ok:true,status:200,payload:{policies:{'early-access-product-policy':v2,'research-use':v1}}};
  else if(req.method==='GET')result={ok:true,status:200,payload:{ok:true,accepted,required:[{kind:'early_access_terms',version:'v2'}]}};
  else if(req.body.version==='v1')result={ok:false,status:400,payload:{ok:false,code:'AGREEMENT_NOT_REQUIRED'}};
  else {const prior=accepted;accepted=true;if(!prior)writes++;result={ok:true,status:200,payload:{ok:true,kind:'early_access_terms',version:'v2',alreadyAccepted:prior}};}
  if(mutator)result=mutator({step,req,result,v2,v1})??result;
  return result;
 };
 return {expected,request,calls,v2,v1,getWrites:()=>writes,run:()=>verifySyntheticPolicyProtocol({origin:ORIGIN,request,expected})};
}
test('finite exact protocol proves stale refusal, current acceptance and replay',async()=>{const f=fixture();const r=await f.run();assert.equal(r.requestCount,8);assert.equal(f.getWrites(),1);assert.equal(r.checks.length,8);assert.equal(r.productionVerified,false);assert.equal(r.databaseRowsInspected,false);});
test('only three canonical paths and exact pair payloads are used',async()=>{const f=fixture();await f.run();assert.deepEqual(f.calls.filter(c=>c.method==='POST').map(c=>c.body),[{kind:'early_access_terms',version:'v1'},{kind:'early_access_terms',version:'v2'},{kind:'early_access_terms',version:'v2'}]);assert.ok(f.calls.every(c=>c.origin===ORIGIN));});
test('default production expectation does not accept arbitrary synthetic text',async()=>{const f=fixture();await assert.rejects(verifySyntheticPolicyProtocol({origin:ORIGIN,request:f.request}),/reviewed documents/);assert.equal(f.getWrites(),0);});
for(const origin of ['https://xeniostechnology.com','https://xeniostechnology.com:443','http://localhost.evil.test:4321','http://0.0.0.0:4321','http://192.168.1.2:4321','file:///tmp/a','http://127.0.0.1','http://localhost:4321/','http://localhost:4321/x','http://u:p@localhost:4321','http://localhost:4321?secret=1','http://localhost:4321#x','http://127.1:4321','http://2130706433:4321']) {
 test('rejects noncanonical/nonloopback origin '+origin,async()=>{const f=fixture();await assert.rejects(verifySyntheticPolicyProtocol({origin,request:f.request,expected:f.expected}));assert.equal(f.calls.length,0);});
}
for(const origin of ['http://127.0.0.1:4321','http://localhost:3000','http://[::1]:5555','https://localhost:4443'])test('accepts explicit loopback '+origin,()=>assert.equal(assertSyntheticOrigin(origin),origin));
test('rejects current body tamper before first acceptance',async()=>{const f=fixture(({step,result})=>{if(step===1)result.payload.policies['early-access-product-policy'].sections[0].paragraphs[0]='Changed';});await assert.rejects(f.run(),/reviewed documents/);assert.equal(f.getWrites(),0);});
test('rejects altered historical v1 before first acceptance',async()=>{const f=fixture(({step,result})=>{if(step===1)result.payload.policies['research-use'].updated='Changed';});await assert.rejects(f.run());assert.equal(f.getWrites(),0);});
test('rejects wrong policy identity even with matching body digest',async()=>{const f=fixture(({step,result})=>{if(step===1)result.payload.policies['early-access-product-policy'].agreement.version='v3';});await assert.rejects(f.run());assert.equal(f.getWrites(),0);});
test('rejects extra agreement identity fields',async()=>{const f=fixture(({step,result})=>{if(step===1)result.payload.policies['early-access-product-policy'].agreement.extra='x';});await assert.rejects(f.run());});
test('refuses an already-accepted synthetic persona',async()=>{const f=fixture(({step,result})=>{if(step===2)result.payload.accepted=true;});await assert.rejects(f.run(),/standing/);assert.equal(f.calls.length,2);});
test('refuses ambiguous required agreement list',async()=>{const f=fixture(({step,result})=>{if(step===2)result.payload.required.push({...result.payload.required[0]});});await assert.rejects(f.run(),/standing/);});
test('refuses v1 configured standing',async()=>{const f=fixture(({step,result})=>{if(step===2)result.payload.required[0].version='v1';});await assert.rejects(f.run());});
for(const [label,edit] of [
 ['stale request accepted',r=>{r.ok=true;r.status=200;r.payload={kind:'early_access_terms',version:'v1'};}],
 ['wrong refusal status',r=>{r.status=403;}],
 ['wrong refusal code',r=>{r.payload.code='IDENTITY_REQUIRED';}],
 ['missing refusal body',r=>{r.payload=null;}],
 ['missing failure flag',r=>{delete r.payload.ok;}],
]) test(label+' fails rather than passing a generic error',async()=>{const f=fixture(({step,result})=>{if(step===3)edit(result);});await assert.rejects(f.run(),/Stale v1/);assert.equal(f.getWrites(),0);});
test('stale refusal must leave standing false',async()=>{const f=fixture(({step,result})=>{if(step===4)result.payload.accepted=true;});await assert.rejects(f.run());assert.equal(f.getWrites(),0);});
test('current acceptance must return exact version',async()=>{const f=fixture(({step,result})=>{if(step===5)result.payload.version='v1';});await assert.rejects(f.run(),/acceptance/);});
test('first acceptance may not masquerade as replay',async()=>{const f=fixture(({step,result})=>{if(step===5)result.payload.alreadyAccepted=true;});await assert.rejects(f.run());});
test('acceptance must become observable standing',async()=>{const f=fixture(({step,result})=>{if(step===6)result.payload.accepted=false;});await assert.rejects(f.run(),/standing/);});
test('replay must not claim another insertion',async()=>{const f=fixture(({step,result})=>{if(step===7)result.payload.alreadyAccepted=false;});await assert.rejects(f.run());});
test('last standing must remain v2 accepted',async()=>{const f=fixture(({step,result})=>{if(step===8)result.payload.required[0].version='v1';});await assert.rejects(f.run());});
test('transport failure is not automatically retried',async()=>{let calls=0;await assert.rejects(verifySyntheticPolicyProtocol({origin:ORIGIN,request:async()=>{calls++;throw new Error('offline');}}));assert.equal(calls,1);});
test('receipt does not retain response data, identity or timestamp',async()=>{const f=fixture(({result})=>{if(result.payload)result.payload.secret='PRIVATE-PAYLOAD';});const r=await f.run();assert.equal(JSON.stringify(r).includes('PRIVATE-PAYLOAD'),false);});
test('body digest uses omitted bullets as null, not empty array',()=>{const a=fresh('v2');delete a.sections[0].bullets;const b=structuredClone(a);b.sections[0].bullets=[];assert.notEqual(policyBodyDigest(a),policyBodyDigest(b));});
test('metadata excluded from canonical body digest',()=>{const a=fresh('v2'),b=structuredClone(a);b.agreement={kind:'x',version:'wrong'};assert.equal(policyBodyDigest(a),policyBodyDigest(b));});
for(const [label,value] of [['null',null],['array',[]],['no sections',{title:'x',updated:'x'}],['bad paragraph',{title:'x',updated:'x',sections:[{heading:'x',paragraphs:[3]}]}],['bad bullets',{title:'x',updated:'x',sections:[{heading:'x',paragraphs:[],bullets:'bad'}]}]])test('digest rejects '+label,()=>assert.throws(()=>policyBodyDigest(value)));
test('browser expression uses same origin, no-store, redirect-error and bounded timer',async()=>{
 let observed;
 const page={evaluate:async expression=>vm.runInNewContext(expression,{location:{origin:ORIGIN},AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{observed={url,options};return new Response('{"policies":{}}',{status:200,headers:{'content-type':'application/json'}});}})};
 const request=makeLoopbackBrowserRequest(page,ORIGIN);const r=await request({origin:ORIGIN,method:'GET',path:'/api/research/policies'});
 assert.equal(r.status,200);assert.equal(observed.options.redirect,'error');assert.equal(observed.options.cache,'no-store');assert.equal(observed.options.credentials,'include');assert.equal(observed.options.body,undefined);assert.equal(observed.options.signal instanceof AbortSignal,true);
});
test('browser refuses navigation to production before any fetch',async()=>{
 let calls=0;const page={evaluate:async e=>vm.runInNewContext(e,{location:{origin:'https://xeniostechnology.com'},fetch:()=>calls++,AbortController,setTimeout,clearTimeout})};
 await assert.rejects(makeLoopbackBrowserRequest(page,ORIGIN)({origin:ORIGIN,method:'GET',path:'/api/research/policies'}));assert.equal(calls,0);
});
test('browser refuses HTML 200 masquerading as API',async()=>{const page={evaluate:async e=>vm.runInNewContext(e,{location:{origin:ORIGIN},AbortController,setTimeout,clearTimeout,fetch:async()=>new Response('<html/>',{headers:{'content-type':'text/html'}})})};await assert.rejects(makeLoopbackBrowserRequest(page,ORIGIN)({origin:ORIGIN,method:'GET',path:'/api/research/policies'}),/non-JSON/);});
test('browser refuses oversize JSON',async()=>{const page={evaluate:async e=>vm.runInNewContext(e,{location:{origin:ORIGIN},AbortController,setTimeout,clearTimeout,fetch:async()=>new Response(' '.repeat(262145),{headers:{'content-type':'application/json'}})})};await assert.rejects(makeLoopbackBrowserRequest(page,ORIGIN)({origin:ORIGIN,method:'GET',path:'/api/research/policies'}),/too large/);});
test('browser transport cannot be used for arbitrary path or order POST',async()=>{const f=makeLoopbackBrowserRequest({evaluate:()=>{throw new Error('must not evaluate');}},ORIGIN);for(const input of [{origin:ORIGIN,method:'POST',path:'/api/research/early-access/request-intents',body:{}},{origin:ORIGIN,method:'GET',path:'//evil.test/x'},{origin:'http://localhost:9999',method:'GET',path:'/api/research/policies'}])await assert.rejects(f(input),/Invalid/);});
