// Requires the explicit loopback preview-sql-claims.ts fixture. No live targets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const base='http://127.0.0.1:5305';
const output=new URL('./evidence/sql-claims-qualification.json',import.meta.url);
const cases=[];
const fixture=await(await fetch(base+'/__audit_fixture')).json();
const initial=await(await fetch(base+'/__audit_state')).json();
assert.equal(initial.productionMutated,false);
assert.equal(initial.members.length,0,'Restart local SQL fixture before qualification');
async function signIn(email){return (await(await fetch(base+'/preview-backend/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'native-preview-password'})})).json()).access_token;}
async function claim(name,token,authorization,status){
 const r=await fetch(base+'/api/research/member/claim',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization:'Bearer '+authorization}:{})},body:JSON.stringify({token})});
 const result=await r.json();assert.equal(r.status,status,name);cases.push({name,status,result});return result;
}
await claim('status-purpose cannot claim',fixture.status,null,401);
await claim('recovery-purpose cannot claim',fixture.claim,fixture.recovery,409);
const expiredRedirect=await fetch(base+'/__audit_claim/expired',{redirect:'manual'});
await claim('expired signature-valid token cannot claim',new URL(expiredRedirect.headers.get('location'),base).searchParams.get('token'),null,401);
await claim('foreign signed-in owner cannot claim',fixture.claim,await signIn('other@preview.invalid'),409);
const owner=await signIn('member@preview.invalid');
const first=await claim('matching verified owner claims',fixture.claim,owner,200);assert.equal(first.replayed,false);
const replay=await claim('consumed claim safely replays',fixture.claim,owner,200);assert.equal(replay.replayed,true);
const final=await(await fetch(base+'/__audit_state')).json();
assert.equal(final.application.status,'active');assert.equal(final.members.length,1);
assert.equal(final.members[0].auth_user_id,'20000000-0000-4000-8000-000000000001');
assert.equal(final.members[0].access_basis,'approved_customer');assert.equal(final.members[0].billing_state,'not_started');
assert.equal(final.outbox.reduce((n,r)=>n+r.count,0),initial.outbox.reduce((n,r)=>n+r.count,0)+1);
assert.ok(final.outbox.every(r=>r.status==='pending'));
const sources=['server/research/members.ts','server/research/membership.ts','server/research/approved-customer-access.ts','server/research/approved-customer-access-production.ts','supabase/candidates/20260905_research_approved_customer_access.sql'];
const sourceHashes=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex')]));
const receipt={status:'PASS',observedAt:new Date().toISOString(),provenance:'Real HTTP registrar, token validation, production claim dependencies, actual SQL function under service_role; synthetic exact-match Auth provider and local PGlite',cases,initial,final,sourceHashes,productionMutated:false,externalDelivery:false,limits:['Not managed PostgREST/GoTrue parity','No external messages','In-memory SQL; restart persistence not claimed']};
fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,cases:cases.length,memberCount:final.members.length,outboxIncrease:1,externalDelivery:false}));
