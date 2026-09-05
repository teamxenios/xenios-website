/** Offline PostgreSQL/WASM rehearsal. No network, credentials or live users. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

assert(process.argv[2] && isAbsolute(process.argv[2]), 'Absolute local PGlite module required');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const candidatePath = 'supabase/candidates/20260905_research_approved_customer_access.sql';
const candidate = readFileSync(candidatePath, 'utf8');
const hash = (value) => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
const sourceHashes = {};
const admin = '10000000-0000-4000-8000-000000000001';
const customer = '20000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000002';
let checks = 0;
const checked = () => { checks += 1; };
async function scalar(sql, values = []) { return (await db.query(sql, values)).rows[0].value; }
async function refused(operation, pattern) {
  await assert.rejects(operation, pattern); checked();
}
const defaultInput = [admin, 'customer@example.invalid', 'Customer', 'Fixture', 'Explicit synthetic customer access review', null, null, 'synthetic-approval-0001'];
async function approve(input = defaultInput) {
  return scalar('select public.research_admin_approve_customer_access($1,$2,$3,$4,$5,$6,$7,$8) value', input);
}
const claim = (application, actor = customer) => scalar('select public.research_claim_approved_customer_access($1,$2) value', [application, actor]);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table public.research_order_payment_canary(id integer primary key, state text);
    insert into public.research_order_payment_canary values(1,'not_paid');`);
  for (const source of ['supabase/research-membership.sql','supabase/research-members.sql','supabase/research-notification-outbox.sql']) {
    const sql = execFileSync('git', ['show', `HEAD:${source}`], { encoding: 'utf8' });
    sourceHashes[source] = hash(sql);
    // This engine has core gen_random_uuid; pgcrypto is not installed. No other
    // source SQL is changed. Auth is an explicitly minimal synthetic parent.
    await db.exec(sql.replace(/^create extension if not exists "pgcrypto";\s*$/gm, ''));
  }
  await db.query('insert into auth.users values($1,$2,clock_timestamp())', [admin,'admin@example.invalid']);
  await db.exec(candidate); await db.exec(candidate); checked();
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await refused(() => approve(), /permission denied/);
    await refused(() => claim(admin), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.deepEqual(await scalar('select public.research_approved_customer_access_authority() value'), { schemaVersion: 'approved_customer_access_20260905' }); checked();
  const approved = await approve();
  assert.equal(approved.ok,true); assert.equal(approved.state,'approved_customer');
  assert.equal(approved.delivery,'queued'); assert.equal(approved.replayed,false); checked();
  const replay = await approve(); assert.equal(replay.replayed,true); assert.equal(replay.applicationId,approved.applicationId); checked();
  const mismatch = [...defaultInput]; mismatch[4] = 'A changed synthetic approval reason';
  assert.equal((await approve(mismatch)).code,'idempotency_conflict'); checked();
  const secondKey = [...defaultInput]; secondKey[7] = 'synthetic-approval-0002';
  assert.equal((await approve(secondKey)).code,'stale_inspection'); checked();
  await db.exec('reset role');
  const application = (await db.query('select * from public.research_applications where id=$1',[approved.applicationId])).rows[0];
  assert.equal(application.country,null); assert.equal(application.age_confirmed,false);
  assert.equal(application.source_page,'admin_approved_customer'); assert.equal(application.access_approval_version,1); checked();
  assert.equal(await scalar('select count(*)::int value from public.research_members'),0); checked();
  assert.equal(await scalar('select count(*)::int value from public.research_notification_outbox'),1); checked();
  assert.equal(await scalar('select count(*)::int value from public.research_application_events'),1); checked();
  assert.equal((await claim(approved.applicationId)).code,'verified_sign_in_required'); checked();
  await db.query('insert into auth.users values($1,$2,null)',[customer,'customer@example.invalid']);
  assert.equal((await claim(approved.applicationId)).code,'verified_sign_in_required'); checked();
  await db.query('insert into auth.users values($1,$2,clock_timestamp())',[foreign,'foreign@example.invalid']);
  assert.equal((await claim(approved.applicationId,foreign)).code,'claim_not_available'); checked();
  await db.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1',[customer]);
  const claimed = await claim(approved.applicationId);
  assert.equal(claimed.ok,true); assert.equal(claimed.state,'active'); assert.equal(claimed.replayed,false); checked();
  const member = (await db.query('select * from public.research_members where id=$1',[claimed.memberId])).rows[0];
  assert.equal(member.auth_user_id,customer); assert.equal(member.access_basis,'approved_customer');
  assert.equal(member.billing_state,'not_started'); assert.equal(member.status,'active'); checked();
  assert.equal((await claim(approved.applicationId)).replayed,true); checked();
  assert.equal(await scalar('select count(*)::int value from public.research_notification_outbox'),2); checked();
  assert.equal(await scalar('select count(*)::int value from public.research_application_events'),2); checked();
  assert.equal(await scalar('select state value from public.research_order_payment_canary where id=1'),'not_paid'); checked();
  await db.query("update public.research_members set status='closed' where id=$1",[claimed.memberId]);
  assert.equal((await claim(approved.applicationId)).code,'identity_review_required'); checked();
  await db.query("update public.research_members set status='active' where id=$1",[claimed.memberId]);
  // An expired approval never grants access even with a verified matching Auth.
  const expInput = [...defaultInput]; expInput[1]='expired@example.invalid'; expInput[7]='synthetic-expiry-0001';
  const exp = await approve(expInput);
  await db.query("update public.research_applications set approval_expires_at=clock_timestamp()-interval '1 second' where id=$1",[exp.applicationId]);
  const expiredUser='20000000-0000-4000-8000-000000000003';
  await db.query('insert into auth.users values($1,$2,clock_timestamp())',[expiredUser,'expired@example.invalid']);
  assert.equal((await claim(exp.applicationId,expiredUser)).code,'claim_not_available'); checked();
  // A failure to enqueue must roll the approval and its audit back together.
  await db.exec("alter table public.research_notification_outbox add constraint fail_synthetic_delivery check(recipient<>'failed@example.invalid')");
  const bad = [...defaultInput]; bad[1]='failed@example.invalid'; bad[7]='synthetic-failure-0001';
  await refused(() => approve(bad), /fail_synthetic_delivery/);
  assert.equal(await scalar("select count(*)::int value from public.research_applications where email='failed@example.invalid'"),0); checked();
  assert.equal(await scalar("select count(*)::int value from public.research_application_events where operation_key='synthetic-failure-0001'"),0); checked();
  await db.exec('alter table public.research_notification_outbox drop constraint fail_synthetic_delivery');
  assert.equal((await approve(bad)).ok,true); checked();
  console.log(JSON.stringify({ status:'PASS', checks, candidatePath, candidateLfSha256:hash(candidate), sourceHashes,
    productionMutated:false, engine:(await db.query('select version() value')).rows[0].value,
    scope:'In-memory SQL engine; Git baseline application/member/outbox schema and minimal synthetic Auth. Apply twice, service grants, exact identities, expiry, replay and rollback atomicity. Not production schema parity, live email, browser ownership, cross-session concurrency or restart attestation.' },null,2));
} finally { await db.close(); }
