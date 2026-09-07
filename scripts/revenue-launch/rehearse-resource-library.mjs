/** Offline PostgreSQL/WASM rehearsal. Usage: pinned-node this-file <absolute PGlite module>. No DB URL, network, production identity or provider. */
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
assert(process.argv[2] && isAbsolute(process.argv[2]), 'Absolute local PGlite module path required');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root='supabase/candidates/20260906120000_research_resource_library';
const source=(suffix)=>readFileSync(root+suffix,'utf8');
const checks=[]; const engines=new Set(); const record=(name)=>checks.push(name);
const boot=`create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean not null default false); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text); alter table storage.objects enable row level security; alter table storage.buckets enable row level security;`;
const hashes=Object.fromEntries(['.sql','.precheck.sql','.postcheck.sql'].map(s=>[root+s,createHash('sha256').update(source(s).replaceAll('\r\n','\n')).digest('hex')]));
for(const mode of ['minimal','broad']){
 const db=new PGlite();
 try{
  await db.exec(boot); engines.add((await db.query('select version() version')).rows[0].version);
  if(mode==='broad') await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
  const precheck=()=>db.exec(source('.precheck.sql'));
  const postcheck=()=>db.exec(source('.postcheck.sql'));
  const reject=async(name,sql,pattern)=>{await assert.rejects(()=>db.exec(sql),pattern);record(mode+': '+name);};
  const rejectGate=async(name,gate,pattern)=>{await assert.rejects(gate,pattern);await db.exec('rollback');record(mode+': '+name);};
  await db.exec('create role local_resource_checker nologin nosuperuser nobypassrls; grant usage,create on schema public to local_resource_checker; grant usage on schema storage to local_resource_checker; grant select on storage.buckets,storage.objects to local_resource_checker; set role local_resource_checker');
  await rejectGate('fresh precheck rejects non-bypass executor',precheck,/checker requires SUPERUSER or BYPASSRLS executor/);
  await db.exec('reset role');
  await precheck();record(mode+': fresh precheck');
  await db.exec('create table public.research_resource_library(id text)');
  await rejectGate('incompatible existing table precheck',precheck,/already exists/);await db.exec('drop table public.research_resource_library');
  await db.exec("create policy broad_storage on storage.objects for all to authenticated using (true) with check (true)");
  await rejectGate('broad storage policy precheck',precheck,/policy requires/);await db.exec('drop policy broad_storage on storage.objects');
  await db.exec("create policy other_bucket on storage.objects for select to authenticated using (bucket_id='separate-bucket')");
  await precheck();record(mode+': unrelated exact bucket policy accepted');await db.exec('drop policy other_bucket on storage.objects');
  await db.exec("insert into storage.buckets values('research-resource-library','research-resource-library',true)");
  await rejectGate('existing public bucket precheck',precheck,/bucket already exists/);await db.exec('delete from storage.buckets');
  await db.exec(source('.sql')); await postcheck();record(mode+': corrected migration + exact postcheck');
  await rejectGate('uncertain retry refused',precheck,/already exists/);
  await db.exec(source('.sql'));await postcheck();record(mode+': isolated repeat apply and postcheck');
  await db.exec('grant truncate on public.research_resource_deliveries to authenticated');
  await rejectGate('postcheck detects ACL regression',postcheck,/client privilege remains/);await db.exec('revoke truncate on public.research_resource_deliveries from authenticated');
  await db.exec('alter table public.research_resource_library disable row level security');
  await rejectGate('postcheck detects missing RLS',postcheck,/table\/RLS\/owner/);await db.exec('alter table public.research_resource_library enable row level security');
  for(const table of ['research_resource_library','research_resource_versions','research_resource_deliveries']){
   await db.exec(`alter table public.${table} no force row level security`);
   await rejectGate('postcheck detects missing FORCE RLS '+table,postcheck,/table\/RLS\/owner/);
   await db.exec(`alter table public.${table} force row level security`);
  }
  await db.exec("update storage.buckets set public=true where id='research-resource-library'");
  await rejectGate('postcheck detects public bucket',postcheck,/private bucket mismatch/);await db.exec("update storage.buckets set public=false where id='research-resource-library'");
  await postcheck();
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const table of ['research_resource_library','research_resource_versions','research_resource_deliveries']){
    for(const sql of [`select * from public.${table}`,`insert into public.${table} default values`,`update public.${table} set id=id`,`delete from public.${table}`,`truncate public.${table}`]) await reject(role+' '+sql.split(' ')[0]+' '+table,sql,/permission denied/);
   }
   await reject(role+' publish RPC',"select public.research_resource_hub_publish(gen_random_uuid(),gen_random_uuid(),'synthetic',now())",/permission denied/);
   await reject(role+' withdraw RPC',"select public.research_resource_hub_withdraw(gen_random_uuid(),gen_random_uuid(),'synthetic',now(),'test')",/permission denied/);
   await reject(role+' trigger helper',"select public.research_resource_versions_immutable()",/permission denied/);
   await db.exec('reset role');
  }
  const r1='10000000-0000-4000-8000-000000000001',r2='10000000-0000-4000-8000-000000000002';
  const v1='20000000-0000-4000-8000-000000000001',v2='20000000-0000-4000-8000-000000000002';
  await db.exec('set role service_role');
  for(const r of [r1,r2]) await db.query("insert into public.research_resource_library(id,title,purpose,created_by_admin) values($1,'Local qualification','Synthetic local-only resource','qualification@example.invalid')",[r]);
  for(const [v,n] of [[v1,1],[v2,2]]) await db.query("insert into public.research_resource_versions(id,resource_id,version_number,state,usage_policy,audience,size_bytes,sha256,original_filename,content_type,storage_key,validation_ok,uploaded_by_admin,reviewed_at,reviewed_by_admin,review_reason,upload_idempotency_key) values($1::uuid,$2::uuid,$3,'in_review','private',array['affiliate'],100,repeat('a',64),'synthetic.pdf','application/pdf',$1::text,true,'qualification@example.invalid',now(),'qualification@example.invalid','Synthetic review',$1::text)",[v,r1,n]);
  record(mode+': service inserts without default grants');
  for(const [field,value] of [['storage_key',"'changed'"],['sha256',"repeat('b',64)"],['size_bytes','200'],['resource_id',`'${r2}'`],['version_number','99']]) await reject('immutable '+field,`update public.research_resource_versions set ${field}=${value} where id='${v1}'`,/bytes identity is immutable/);
  const publish=(r,v)=>`select public.research_resource_hub_publish('${r}','${v}','qualification@example.invalid','2026-09-07T12:00:00Z')`;
  await reject('cross-resource publish',publish(r2,v1),/unknown version/);
  await db.exec(publish(r1,v1));await db.exec(publish(r1,v1));record(mode+': valid publish and idempotent repeat');
  await db.exec(publish(r1,v2));
  assert.deepEqual((await db.query('select id,state from public.research_resource_versions order by id')).rows,[{id:v1,state:'superseded'},{id:v2,state:'published'}]);
  assert.equal((await db.query('select current_published_version_id id from public.research_resource_library where id=$1',[r1])).rows[0].id,v2);record(mode+': publish swaps current and supersedes prior');
  await db.exec(`select public.research_resource_hub_withdraw('${r1}','${v2}','qualification@example.invalid',now(),'Synthetic withdrawal')`);
  assert.equal((await db.query('select current_published_version_id id from public.research_resource_library where id=$1',[r1])).rows[0].id,null);record(mode+': withdraw clears pointer');
  await reject('republish withdrawn version',publish(r1,v2),/cannot be published/);
  await db.query("update public.research_resource_versions set state='in_review',validation_ok=false where id=$1",[v1]);
  await reject('invalid validation publish',publish(r1,v1),/research_resource_published_is_complete/);
  assert.equal((await db.query('select state from public.research_resource_versions where id=$1',[v1])).rows[0].state,'in_review');
  record(mode+': failed publish preserves version state');
  await db.query('update public.research_resource_versions set validation_ok=true where id=$1',[v1]);
  await db.exec('reset role; alter table public.research_resource_library add constraint local_rehearsal_pointer_failure check(current_published_version_id is null); set role service_role');
  await reject('atomic publish pointer failure',publish(r1,v1),/local_rehearsal_pointer_failure/);
  assert.equal((await db.query('select state from public.research_resource_versions where id=$1',[v1])).rows[0].state,'in_review');
  assert.equal((await db.query('select current_published_version_id id from public.research_resource_library where id=$1',[r1])).rows[0].id,null);
  record(mode+': failed pointer update rolls back prior version update');
  await db.exec('reset role; alter table public.research_resource_library drop constraint local_rehearsal_pointer_failure; set role service_role');
  await db.query("insert into public.research_resource_deliveries(resource_id,version_id,member_id,outcome) values($1,$2,'30000000-0000-4000-8000-000000000001','denied')",[r1,v2]);
  for(const sql of ['update public.research_resource_deliveries set reason=reason','delete from public.research_resource_deliveries','truncate public.research_resource_deliveries']) await reject('service evidence '+sql.split(' ')[0],sql,/permission denied/);
  await db.exec('reset role');
  await db.exec('create role local_resource_owner nologin nosuperuser nobypassrls; grant usage on schema public to local_resource_owner');
  const seededTables=[['research_resource_library',2],['research_resource_versions',2],['research_resource_deliveries',1]];
  for(const [table] of seededTables) await db.exec(`alter table public.${table} owner to local_resource_owner`);
  await db.exec('set role local_resource_owner');
  for(const [table] of seededTables){
   assert.equal(Number((await db.query(`select count(*) count from public.${table}`)).rows[0].count),0);
   record(mode+': FORCE RLS hides seeded rows from non-bypass owner '+table);
  }
  await rejectGate('postcheck rejects non-bypass owner with hidden seeded rows',postcheck,/checker requires SUPERUSER or BYPASSRLS executor/);
  await db.exec('reset role; set role service_role');
  for(const [table,count] of seededTables){
   assert.equal(Number((await db.query(`select count(*) count from public.${table}`)).rows[0].count),count);
   record(mode+': service still reads preserved seeded rows '+table);
  }
  await db.exec('reset role');
  await rejectGate('postcheck refuses unexpected seeded rows',postcheck,/unexpected first-install rows/);
 }finally{await db.close();}
}
const receipt={status:'PASS',observedAt:new Date().toISOString(),checks:checks.length,cases:checks,sourceHashes:hashes,engines:[...engines],productionMutated:false,networkDatabaseConnections:false,limits:['Single-process WASM engine, no concurrent-session proof','Synthetic storage metadata, no Supabase Storage HTTP/object-byte proof','Production PostgreSQL17.6 catalog parity still requires exact environment validation']};
console.log(JSON.stringify(receipt,null,2));
