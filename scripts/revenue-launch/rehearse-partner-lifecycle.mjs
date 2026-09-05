/** Offline PostgreSQL/WASM rehearsal. No network, live identity or email. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
assert(process.argv[2] && isAbsolute(process.argv[2]), 'Absolute local PGlite module required');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const candidatePath='supabase/candidates/20260905_research_partner_lifecycle.sql';
const candidate=readFileSync(candidatePath,'utf8');
const hash=(s)=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const sourceHashes={}; let checks=0; const checked=()=>{checks++;};
const admin='10000000-0000-4000-8000-000000000001';
const customer='20000000-0000-4000-8000-000000000001';
const other='20000000-0000-4000-8000-000000000002';
async function scalar(sql,params=[]) { return (await db.query(sql,params)).rows[0].value; }
const operate=(op,actor=admin)=>scalar('select public.research_admin_partner_operation($1,$2::jsonb) value',[actor,JSON.stringify(op)]);
let sequence=0;
const common=()=>({ reason:'Explicit synthetic evidence review only', idempotencyKey:`synthetic-operation-${++sequence}` });
const basePrepare=(memberId)=>({ ...common(),action:'prepare',memberId,role:'affiliate',legalName:'Synthetic Partner' });
async function selected(partnerId,action,extra={}) { return { ...common(),partnerId,action,expectedUpdatedAt:await scalar('select updated_at::text value from public.research_partners where id=$1',[partnerId]),...extra }; }
const evidence={evidenceReference:'synthetic:external:review',reviewedEvidence:true};
try {
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create table public.money_canary(state text); insert into public.money_canary values(\'not_paid\');');
  for(const name of ['supabase/research-membership.sql','supabase/research-members.sql','supabase/research-partners.sql']) {
    const sql=execFileSync('git',['show',`HEAD:${name}`],{encoding:'utf8'});sourceHashes[name]=hash(sql);
    await db.exec(sql.replace(/^create extension if not exists "pgcrypto";\s*$/gm,''));
  }
  await db.exec(readFileSync('supabase/candidates/20260905_research_partner_lifecycle.precheck.sql','utf8'));checked();
  await db.exec(candidate);await db.exec(candidate);checked();
  await db.exec(readFileSync('supabase/candidates/20260905_research_partner_lifecycle.postcheck.sql','utf8'));checked();
  for(const [id,email] of [[admin,'admin@example.invalid'],[customer,'customer@example.invalid'],[other,'other@example.invalid']]) await db.query('insert into auth.users values($1,$2,clock_timestamp())',[id,email]);
  async function seedMember(id,email) {
    const app=await scalar("insert into public.research_applications(email,first_name,last_name,country,age_confirmed,status) values($1,'Synthetic','Customer','US',false,'active') returning id value",[email]);
    return scalar("insert into public.research_members(application_id,auth_user_id,email,first_name,status) values($1,$2,$3,'Synthetic','active') returning id value",[app,id,email]);
  }
  const member=await seedMember(customer,'customer@example.invalid');const otherMember=await seedMember(other,'other@example.invalid');
  const prepare=basePrepare(member);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`); await assert.rejects(()=>operate(prepare),/permission denied/);checked(); await db.exec('reset role');
  }
  const authority=await scalar('select public.research_partner_lifecycle_authority() value');
  assert.equal(authority.schemaVersion,'partner_lifecycle_20260905');assert.equal(authority.requirements.agreements.length,4);assert.equal(authority.requirements.trainingModules.length,14);checked();
  const p=await operate(prepare);assert.equal(p.ok,true);assert.equal(p.state,'application');assert.match(p.partnerId,/^[a-f0-9-]{36}$/);checked();
  assert.equal((await operate(prepare)).replayed,true);checked();
  assert.equal((await operate({...prepare,role:'professional_partner'})).code,'idempotency_conflict');checked();
  assert.equal((await operate(basePrepare(member))).code,'partner_already_exists');checked();
  assert.equal((await operate({...basePrepare(otherMember),actorAuthUserId:admin})).code,'invalid_input');checked();
  assert.equal(await scalar('select count(*)::int value from public.research_partner_lifecycle_events'),1);checked();
  const premature=await operate(await selected(p.partnerId,'activate'));assert.equal(premature.code,'requirements_missing');assert.equal(premature.missingRequirements.length,22);checked();
  const first=await selected(p.partnerId,'record_clearance',{...evidence,kind:'identity',decision:'verified'});
  assert.equal((await operate(first)).state,'tax_status_pending');checked();
  assert.equal((await operate({...first,idempotencyKey:'synthetic-stale-0001'})).code,'stale_inspection');checked();
  assert.equal((await operate(first)).replayed,true);checked();
  for(const kind of ['tax','payout']) assert.equal((await operate(await selected(p.partnerId,'record_clearance',{...evidence,kind,decision:'verified'}))).ok,true);checked();
  const future=await selected(p.partnerId,'record_training',{...evidence,moduleKey:'security',version:'1.0.0',completedAt:'2999-01-01T00:00:00Z'});
  assert.equal((await operate(future)).code,'invalid_input');checked();
  const fake=await selected(p.partnerId,'record_training',{...evidence,moduleKey:'unknown',version:'1.0.0',completedAt:'2026-01-01T00:00:00Z'});
  assert.equal((await operate(fake)).code,'invalid_input');checked();
  for(const item of authority.requirements.agreements) {
    const op=await selected(p.partnerId,'record_agreement',{...evidence,agreementKey:item.key,version:item.version,contentHash:'a'.repeat(64),acceptedAt:'2026-01-01T00:00:00Z'});
    assert.equal((await operate(op)).ok,true);checked();
  }
  const duplicateEvidence=await selected(p.partnerId,'record_agreement',{...evidence,agreementKey:'partner_agreement',version:'1.0.0',contentHash:'b'.repeat(64),acceptedAt:'2026-01-02T00:00:00Z'});
  assert.equal((await operate(duplicateEvidence)).code,'evidence_conflict');checked();
  for(const item of authority.requirements.trainingModules) {
    assert.equal((await operate(await selected(p.partnerId,'record_training',{...evidence,moduleKey:item.key,version:item.version,completedAt:'2026-01-01T00:00:00Z'}))).ok,true);checked();
  }
  assert.deepEqual((await operate(await selected(p.partnerId,'activate'))).missingRequirements,['admin_certification']);checked();
  assert.equal((await operate(await selected(p.partnerId,'certify'))).state,'certification_pending');checked();
  const activation=await selected(p.partnerId,'activate');assert.equal((await operate(activation)).state,'active');checked();
  assert.equal((await operate(activation)).replayed,true);checked();
  assert.equal(await scalar('select state value from public.money_canary'),'not_paid');checked();
  assert.equal((await operate(await selected(p.partnerId,'record_clearance',{...evidence,kind:'identity',decision:'rejected'}))).state,'quality_review');checked();
  assert.equal((await operate(await selected(p.partnerId,'reinstate'))).code,'requirements_missing');checked();
  assert.equal((await operate(await selected(p.partnerId,'record_clearance',{...evidence,kind:'identity',decision:'verified'}))).state,'quality_review');checked();
  assert.equal((await operate(await selected(p.partnerId,'certify'))).ok,true);checked();
  assert.equal((await operate(await selected(p.partnerId,'reinstate'))).state,'active');checked();
  assert.equal((await operate(await selected(p.partnerId,'suspend'))).state,'suspended');checked();
  await db.query("update public.research_members set status='closed' where id=$1",[member]);
  assert.equal((await operate(await selected(p.partnerId,'reinstate'))).code,'identity_review_required');checked();
  assert.equal((await operate(await selected(p.partnerId,'terminate'))).state,'terminated');checked();
  assert.equal((await operate(await selected(p.partnerId,'activate'))).code,'identity_review_required');checked();
  const p2=await operate(basePrepare(otherMember));assert.equal(p2.ok,true);checked();
  // Updating the canonical partner and appending its audit is one transaction.
  const fail=await selected(p2.partnerId,'record_clearance',{...evidence,kind:'identity',decision:'verified'});
  await db.query("alter table public.research_partner_lifecycle_events add constraint fail_synthetic_audit check(operation_key<>'"+fail.idempotencyKey+"')");
  await assert.rejects(()=>operate(fail),/fail_synthetic_audit/);checked();
  assert.equal(await scalar('select identity_verified value from public.research_partners where id=$1',[p2.partnerId]),false);checked();
  await db.exec('alter table public.research_partner_lifecycle_events drop constraint fail_synthetic_audit');
  assert.equal((await operate(fail)).ok,true);checked();
  assert.equal(await scalar('select count(*)::int value from public.research_partner_agreements where partner_id=$1',[p2.partnerId]),0);checked();
  console.log(JSON.stringify({status:'PASS',checks,candidatePath,candidateLfSha256:hash(candidate),sourceHashes,productionMutated:false,
    scope:'Offline PGlite synthetic Auth/member/partner baseline. Exact gates, idempotency, stale revisions, append-only evidence, privileged operations and transaction rollback. No production parity, live onboarding evidence, concurrency or provider attestations.'},null,2));
} finally {await db.close();}
