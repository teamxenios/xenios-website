// Exact old-source fixture, never a hosted database or a migration downgrade.
// The successor must refuse this valid older seal rather than silently adopt it.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { ProviderJournalHarness,migrationPath,actor,actorLabel,service,json } from './research_assisted_order_quote_provider_journal_harness.mjs';
const run=promisify(execFile),db=new ProviderJournalHarness();
const digest=x=>createHash('sha256').update(x).digest('hex');
const oldRevision='5809b727617e3abe065df69e563374d13f2bcfa8';
const old=(await run('git',['show',`${oldRevision}:${migrationPath}`],{windowsHide:true,maxBuffer:2*1024*1024})).stdout;
assert.equal(digest(old),'5ab6ebcce2bf812d37921aa366d2d144d6ef659fc9f786a8a1c301964b2a5067');
const current=await readFile(migrationPath,'utf8');
const authoritySql=service('select public.research_assisted_order_provider_journal_authority()::text;');
const expected={schemaVersion:'assisted_order_provider_journal_v1',settlementEnabled:false,refundEnabled:false,liveExecutionEnabled:false};
const countsSql=`select json_build_array((select count(*) from public.research_assisted_order_provider_sources),
 (select count(*) from public.research_assisted_order_provider_source_grants),(select count(*) from public.research_assisted_order_provider_attempts),
 (select count(*) from public.research_assisted_order_provider_event_journal),(select count(*) from public.research_assisted_order_payment_observations),
 (select count(*) from public.research_assisted_order_payment_verifications))::text;`;
try{
  await db.start();await db.baseline();await db.psql(old);
  assert.deepEqual(json(await db.psql(authoritySql)),expected,'Old valid schema must actually self-attest successfully');
  await db.setup(800);
  await db.psql(`insert into public.research_assisted_order_provider_sources(source_id,provider_namespace,account_ref,mode,adapter_revision,granted_by)
    values('synthetic-provider-journal','synthetic-unconfigured','synthetic-account','test','synthetic-adapter-v1','synthetic-owner');
    insert into public.research_assisted_order_provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
    values('synthetic-provider-journal','${actor}','${actorLabel}','synthetic-owner');`);
  const counts=await db.psql(countsSql);
  const child=await run(process.execPath,['--import','tsx','supabase/verification/research_assisted_order_quote_provider_journal_http.ts',db.containerId,'legacy'],
    {windowsHide:true,maxBuffer:2*1024*1024,timeout:60_000});
  process.stdout.write(child.stdout);process.stderr.write(child.stderr);
  assert.equal(await db.psql(countsSql),counts);
  await db.refused(current,'55000');
  assert.deepEqual(json(await db.psql(authoritySql)),expected,'Refused successor must not rewrite old valid authority');
  assert.equal(await db.psql(countsSql),counts,'Refused successor must not alter prior records');
  assert.equal(digest(await readFile(migrationPath,'utf8')),digest(current));
  console.log(JSON.stringify({result:'PASS',oldRevision,oldMigrationSha256:digest(old),successorMigrationSha256:digest(current),
    validOldAuthority:true,newApplicationRefusedBeforeWrite:true,successorApplyRefused:true,recordCountsUnchanged:true,node:process.version}));
}catch(error){console.error('LEGACY_AUTHORITY_PROOF_ERROR',error);process.exitCode=1;}
finally{await db.stop();}
