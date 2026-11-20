/** Owned PostgreSQL ONLY. No URL, managed credential, actor/consent or provider.
 * Synthetic test verifier/journal is NOT a production custody implementation.
 * Exact selectors are closed17.6/17.11; no SDK/helper/default-profile changes.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool,PoolClient } from "pg";
import { expect,it } from "vitest";
import { createDurableJourneyFixture,submission } from "../../server/research/assisted-order/request-intent/durable-journey.pg.fixture";
import { assembleSources,CAPTURE_SQL,canonical,conservationSQL,LOCKS,noMailPgConnection,reconcileNoMailInstall,runNoMailInstall,sha256,UNARMED_SQL,
  type Capture,type InstallIntent,type InstallReceipt,type InstallRequest,type NoMailConnection,type NoMailOperator } from "./request-intent-no-mail-install";

const six=process.env.XENIOS_NO_MAIL_INSTALL_PG17_6,eleven=process.env.XENIOS_NO_MAIL_INSTALL_PG17_11;
for(const value of [six,eleven])if(value!==undefined&&value!=="0"&&value!=="1")throw Error("invalid_owned_no_mail_selector");
if(six==="1"&&eleven==="1")throw Error("conflicting_owned_no_mail_selectors");
const image=six==="1"?"postgres:17.6":eleven==="1"?"postgres:17.11":null;
const pgIt=image?it:it.skip;
const sources=assembleSources();
const BASELINE_PINS=[
  {
    "path": "supabase/care-access-foundation.sql",
    "bytes": 6227,
    "sha256": "e91331b72820c6ca3f1cb3ce0fa8c79487e70d189d74b853bdaff49b2d7589ce"
  },
  {
    "path": "supabase/candidates/mixed_catalog_request_intent.sql",
    "bytes": 18403,
    "sha256": "c50a54629c5e182dafed61e80831e6f9429c18568aac4dd668c0bad8213d97f8"
  },
  {
    "path": "supabase/research-notification-outbox.sql",
    "bytes": 3651,
    "sha256": "70cee0109dce7401431de9449a1312076ad61b7081ed31b9b8a9659bc6cca7ac"
  },
  {
    "path": "server/research/assisted-order/request-intent/private-contact.candidate.sql",
    "bytes": 5660,
    "sha256": "1cb77c07dc5126b6b5bccc210994a3094877b9c6e4d75db9387f1fb5a7246103"
  },
  {
    "path": "supabase/migrations/20261114133643_early_access_postal_admission.sql",
    "bytes": 4672,
    "sha256": "0bf6e063eb8c08121acd4dfeaa9ea1c0872fec848f5c346c65d0c4478a1800b3"
  },
  {
    "path": "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
    "bytes": 6145,
    "sha256": "94999e02049f2c4c06a55621734a38c7a1f72288ae9b91f7466315db99c5a973"
  },
  {
    "path": "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
    "bytes": 2673,
    "sha256": "71e04a5676a70588ed1bd8edbf18d8ae3c2225713c7ac837cd83c0f76aa4965d"
  },
  {
    "path": "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
    "bytes": 6945,
    "sha256": "1da7e15da3a888a5b0c758a0f4011e62b50f2f3333de6aa7dd2eeb7675381adc"
  },
  {
    "path": "supabase/migrations/20261118024134_request_intent_workflow.sql",
    "bytes": 21072,
    "sha256": "d6dc7c5737c8ac70a2eb89f21fd563505347049cdad9418e4e1e4e1e76ae325a"
  },
  {
    "path": "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
    "bytes": 11531,
    "sha256": "852f1f76aeb70f0893a6e5b56424ea5629a4dace6fb4c0ba9374a65da799de75"
  },
  {
    "path": "server/research/assisted-order/quote/delivery/tables.sql",
    "bytes": 1945,
    "sha256": "e4eec74b106d6b385602e057fd2b005ec05bb402db12973c256156c93cad9e06"
  },
  {
    "path": "server/research/assisted-order/quote/delivery/private-pg.sql",
    "bytes": 1556,
    "sha256": "34bcb80686b5a10414885aaba29fec9bbff1f8d4bc979b110a812b62792ac4eb"
  }
] as const;
const text=(p:string)=>readFileSync(p,"utf8");
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
type Hook=(sql:string,real:()=>ReturnType<NoMailConnection["query"]>,client:PoolClient)=>ReturnType<NoMailConnection["query"]>;

async function owned() {
  if(!image)throw Error("explicit_owned_image_required");
  for(const pin of BASELINE_PINS){const bytes=readFileSync(pin.path);expect(bytes.length).toBe(pin.bytes);expect(sha256(bytes)).toBe(pin.sha256);}
  const db=createDurableJourneyFixture();let pool:Pool|undefined,platform:Pool|undefined;
  const clients=new Set<PoolClient>();
  const cleanup=async()=>{
    for(const client of clients)try{client.release(true);}catch{}clients.clear();
    try{if(pool)await pool.end();if(platform)await platform.end();}finally{await db.close();}
  };
  try {
    await db.start({image,dockerOnly:true,managedCareSchema:true,bootstrapProfile:"separate_owned_superuser"});
    await db.sql("create schema if not exists extensions;alter extension pgcrypto set schema extensions");
    // Actual mounted canonical service supplies a synthetic ordinary saved row.
    const {app}=db.application(db.adapter().client);
    expect((await db.post(app,"",submission(),"a")).status).toBe(200);
    for(const path of ["supabase/research-notification-outbox.sql","server/research/assisted-order/request-intent/private-contact.candidate.sql",
      "supabase/migrations/20261114133643_early_access_postal_admission.sql","supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql","supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql","supabase/migrations/20261118033449_early_access_request_customer_notices.sql"])await db.sql(text(path));
    await db.sql("create schema quote_delivery_private");
    await db.sql("set search_path=quote_delivery_private,pg_catalog;\n"+text("server/research/assisted-order/quote/delivery/tables.sql")+text("server/research/assisted-order/quote/delivery/private-pg.sql"));
    const platformName="no_mail_platform_"+randomUUID().replaceAll("-",""),authOwner="no_mail_auth_"+randomUUID().replaceAll("-",""),platformPassword=randomUUID();
    await db.sql(`create role ${platformName} login superuser password ${literal(platformPassword)}`);
    platform=db.poolForLogin(platformName,platformPassword);
    await platform.query(`create role ${authOwner} nologin nosuperuser nobypassrls;
      alter schema auth owner to ${platformName};alter table auth.users owner to ${authOwner};alter function auth.uid() owner to ${authOwner};
      grant usage on schema auth to postgres;grant select,references on auth.users to postgres;
      grant anon,authenticated,service_role to postgres;
      alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      create schema no_mail_owned_guard;
      create function no_mail_owned_guard.source_actor() returns event_trigger language plpgsql security invoker set search_path='' as $f$
      begin if current_user<>'postgres' or session_user<>'postgres' or (select rolsuper from pg_catalog.pg_roles where rolname=current_user)
       then raise exception using errcode='42501',message='genuine_nonsuper_postgres_required';end if;end $f$;
      revoke all on function no_mail_owned_guard.source_actor() from public,anon,authenticated,service_role;
      grant usage on schema no_mail_owned_guard to postgres;
      grant execute on function no_mail_owned_guard.source_actor() to postgres;
      create event trigger no_mail_source_actor on ddl_command_end execute function no_mail_owned_guard.source_actor();
      alter role postgres nosuperuser bypassrls createdb createrole login inherit;`);
    // OWNED-ONLY credential handoff after all helper SQL. Original credential
    // stays private; helper defaults and every other fixture remain untouched.
    // No later db.sql call is valid/needed; teardown is own-container cleanup.
    const password=randomUUID();await db.sql(`alter role postgres password ${literal(password)}`);
    pool=db.poolForLogin("postgres",password);
    Object.assign(pool.options,{statement_timeout:30000,lock_timeout:5000,idle_in_transaction_session_timeout:5000,query_timeout:0,
      options:"-c transaction_timeout=40000",application_name:"owned-no-mail-install"});
    const connect=async()=>{
      const client=await pool!.connect();clients.add(client);
      await client.query("SET search_path=pg_catalog;SET TimeZone='UTC';SET DateStyle='ISO,YMD'");return client;
    };
    const release=(client:PoolClient)=>{clients.delete(client);client.release(true);};
    const capture=async(client:PoolClient)=>(await client.query(CAPTURE_SQL)).rows[0].evidence as Capture;
    const admin=await connect();
    const identity=(await capture(admin)).identity;
    expect(identity).toMatchObject({currentUser:"postgres",sessionUser:"postgres",superuser:false,bypassRls:true,version:image==="postgres:17.6"?170006:170011});
    expect((await admin.query("select oid<>10 as separate from pg_roles where rolname=current_user")).rows[0].separate).toBe(true);
    const before=(await capture(admin)).catalog;
    // Independent OWNED native reference transaction: all7 exact source units,
    // captured then ROLLED BACK. Never a managed preimage/adoption mechanism.
    await admin.query("BEGIN");for(const unit of sources)await admin.query(unit.sql);
    const after=(await capture(admin)).catalog;await admin.query("ROLLBACK");
    expect(canonical((await capture(admin)).catalog)).toBe(canonical(before));
    const ordinary=async(client=admin)=>{const rows:Record<string,unknown>={};for(const [name] of LOCKS)rows[name]=(await client.query(conservationSQL(name))).rows[0];return canonical(rows);};
    const oldRows=await ordinary();
    const container=db.ownedDockerContainer(),reserved=new Set<string>(),sent:string[]=[];
    let intercept:Hook|undefined;
    const request:InstallRequest={executionId:"owned_"+randomUUID(),implementationSource:"f".repeat(40),target:{project:"owned-container-no-mail",service:container},expectedVersion:image==="postgres:17.6"?170006:170011,wallMs:20000,
      reviewedPreimage:before,reviewedPostimage:after,preimageSha256:sha256(canonical(before)),postimageSha256:sha256(canonical(after))};
    const operator:NoMailOperator={authorizeAndReserve:async(intent:InstallIntent)=>{
      if(intent.target.project!=="owned-container-no-mail"||intent.target.service!==container||reserved.has(intent.executionId))throw Error("owned_custody_refused");
      expect(intent.preimageSha256).toBe(request.preimageSha256);expect(intent.postimageSha256).toBe(request.postimageSha256);
      reserved.add(intent.executionId);return{intentSha256:sha256(canonical(intent)),evidenceId:"OWNED_SYNTHETIC_NOT_PROVIDER_AUTHORITY",validUntilUnixMs:Date.now()+60000};
    },openFreshConnection:async()=>{
      const client=await connect(),base=noMailPgConnection(client,async()=>release(client));
      return {...base,destroy:()=>{base.destroy();if(clients.has(client))release(client);},query:async(sql)=>{sent.push(sql);return intercept?intercept(sql,()=>base.query(sql),client):base.query(sql);}};
    },journal:async(stage,receipt)=>{expect(reserved.has(receipt.executionId)).toBe(true);return "owned_private_"+stage;}};
    const observer={openForRecordedIntent:async(r:InstallRequest,receipt:InstallReceipt)=>{
      expect(r.target.service).toBe(container);expect(reserved.has(receipt.executionId)).toBe(true);
      const client=await connect(),base=noMailPgConnection(client,async()=>release(client));
      return {...base,destroy:()=>{base.destroy();if(clients.has(client))release(client);}};
    }};
    return{request,operator,observer,admin,connect,release,capture,ordinary,oldRows,before,after,sent,reserved,
      hook:(h?:Hook)=>{intercept=h;},cleanup};
  }catch(error){await cleanup();throw error;}
}

pgIt("owned17: exact unarmed commit on ONE real nonsuper backend, full catalog/ACL and ordinary conservation",async()=>{
  const f=await owned();try{
    const r=await runNoMailInstall(f.request,f.operator);expect(r.outcome).toBe("committed_verified_unarmed");
    expect(new Set(r.observations.map(o=>o.pid)).size).toBe(1);
    expect(r.observations.find(o=>o.phase==="commit")).toMatchObject({wire:"I",commands:["COMMIT"]});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.after));expect(await f.ordinary()).toBe(f.oldRows);
    expect((await f.admin.query("select fixture_control_id is null and fixture_request_id is null and not policy_capture_enabled and policy_capture_bundle_id is null as unarmed from request_intent_private.workflow_settings where singleton")).rows[0].unarmed).toBe(true);
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: real failure after EACH exact unit rolls back all prior DDL/ACL/source changes",async()=>{
  const f=await owned();try{
    for(const unit of sources){
      let hit=false;f.hook(async(sql,real,client)=>{const result=await real();if(sql===unit.sql){hit=true;await client.query("select 1/0");}return result;});
      const r=await runNoMailInstall({...f.request,executionId:"owned_rollback_"+randomUUID()},f.operator);
      expect(hit).toBe(true);expect(r).toMatchObject({outcome:"rolled_back_verified",sqlState:"22012",commitSent:false});
      expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.before));expect(await f.ordinary()).toBe(f.oldRows);
    }
  }finally{await f.cleanup();}
},180000);

pgIt("owned17: foreign helper/type/overload and ACL drift refuse before ANY source unit",async()=>{
  const f=await owned();try{
    const originalDeny=(await f.admin.query("select pg_get_functiondef('request_intent_private.deny_mutation()'::regprocedure) as definition")).rows[0].definition as string;
    for(const [change,inverse] of [
      ["create or replace function request_intent_private.deny_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception 'owned_drift';end$$",originalDeny],
      ["create type request_intent_private.optional_context as enum ('owned_decoy')","drop type request_intent_private.optional_context"],
      ["create function public.request_intent_fixture_prepare_metadata(integer) returns integer language sql as $$select 1$$","drop function public.request_intent_fixture_prepare_metadata(integer)"],
      ["grant select on request_intent_private.requests to anon","revoke select on request_intent_private.requests from anon"],
    ]){
      await f.admin.query(change);const pre=canonical((await f.capture(f.admin)).catalog);const at=f.sent.length;
      const r=await runNoMailInstall({...f.request,executionId:"owned_drift_"+randomUUID()},f.operator);
      expect(r.commitSent).toBe(false);expect(f.sent.slice(at).some(sql=>sources.some(u=>u.sql===sql))).toBe(false);
      expect(canonical((await f.capture(f.admin)).catalog)).toBe(pre);await f.admin.query(inverse);
    }
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: two actual backends prove BOTH lock orderings without fake worker/timer polling",async()=>{
  const f=await owned();try{
    const other=await f.connect();await other.query("begin;lock table request_intent_private.requests in access exclusive mode");
    const refused=await runNoMailInstall(f.request,f.operator);expect(refused).toMatchObject({outcome:"rolled_back_verified",sqlState:"55P03",commitSent:false});await other.query("rollback");
    let entered!:()=>void,release!:()=>void;const atLock=new Promise<void>(yes=>{entered=yes;}),gate=new Promise<void>(yes=>{release=yes;});
    f.hook(async(sql,real)=>{const r=await real();if(sql===sources[0].sql){entered();await gate;}return r;});
    const run=runNoMailInstall({...f.request,executionId:"owned_lock_"+randomUUID()},f.operator);const observed=run.then(value=>({value}),error=>({error}));
    await atLock;
    await other.query("begin");const conflict=await other.query("lock table request_intent_private.requests in access exclusive mode nowait").then(()=>({ok:true,code:""}),e=>({ok:false,code:String(e.code)}));
    expect(conflict).toEqual({ok:false,code:"55P03"});await other.query("rollback");release();
    const settled=await observed;expect("value" in settled&&settled.value.outcome).toBe("committed_verified_unarmed");f.release(other);
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: native transaction deadline after actual mutation releases server locks during sleep10",async()=>{
  const f=await owned();try{
    let mutated=false;f.hook(async(sql,real,client)=>{const r=await real();if(sql===sources[0].sql){mutated=true;await client.query("select pg_sleep(10)");}return r;});
    const r=await runNoMailInstall({...f.request,wallMs:3000},f.operator);expect(mutated).toBe(true);expect(r.commitSent).toBe(false);
    const other=await f.connect();await other.query("begin;set local lock_timeout='3s';lock table request_intent_private.requests in access exclusive mode;rollback");f.release(other);
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.before));
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("preimage_observed");
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: actual COMMIT reply loss forbids replay and reconciles read-only exact unarmed postimage",async()=>{
  const f=await owned();try{
    f.hook(async(sql,real)=>{const r=await real();if(sql==="COMMIT")throw Error("owned_reply_lost_AFTER_actual_commit");return r;});
    const r=await runNoMailInstall(f.request,f.operator);expect(r).toMatchObject({outcome:"commit_unknown",commitSent:true,commitAcknowledged:false,replayAllowed:false});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.after));
    const at=f.sent.length;expect((await runNoMailInstall(f.request,f.operator)).outcome).toBe("refused");expect(f.sent.length).toBe(at);
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("postimage_unarmed_observed");expect(f.reserved.has(r.executionId)).toBe(true);
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: actual statement cancellation rolls back, and late unexpected ACL fails precommit comparator",async()=>{
  const f=await owned();try{
    f.hook(async(sql,real,client)=>{const r=await real();if(sql===sources[0].sql)await client.query("set local statement_timeout='100ms';select pg_sleep(10)");return r;});
    const cancelled=await runNoMailInstall(f.request,f.operator);expect(cancelled).toMatchObject({outcome:"rolled_back_verified",sqlState:"57014",commitSent:false});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.before));
    f.hook(async(sql,real,client)=>{const r=await real();if(sql===sources[6].sql)await client.query("grant select on request_intent_private.requests to anon");return r;});
    const drift=await runNoMailInstall({...f.request,executionId:"owned_postcheck_"+randomUUID()},f.operator);
    expect(drift).toMatchObject({outcome:"rolled_back_verified",commitSent:false});expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.before));
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: native idle deadline has honest unknown cleanup until independent read-only proof",async()=>{
  const f=await owned();try{
    let mutated=false;f.hook(async(sql,real,client)=>{const r=await real();if(sql===sources[0].sql){mutated=true;
      await client.query("set local idle_in_transaction_session_timeout='100ms'");
      await new Promise<never>((_ok,no)=>client.once("error",no));
    }return r;});
    const r=await runNoMailInstall(f.request,f.operator);expect(mutated).toBe(true);expect(r).toMatchObject({outcome:"cleanup_unverified",commitSent:false});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(canonical(f.before));
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("preimage_observed");
  }finally{await f.cleanup();}
},90000);

pgIt("owned17: genuine policy publication changes only rows; equal catalog can NEVER prove unarmed",async()=>{
  const f=await owned();try{
    const r=await runNoMailInstall(f.request,f.operator);expect(r.outcome).toBe("committed_verified_unarmed");
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("postimage_unarmed_observed");
    const catalog=canonical((await f.capture(f.admin)).catalog);expect(catalog).toBe(canonical(f.after));
    const bundle=randomUUID();
    // Canonical OWNED-only synthetic policy binding, with every CHECK/FK and
    // immutable/publication trigger active. No live policy/approval is claimed.
    await f.admin.query(`insert into request_intent_private.policy_bundles(
      id,environment,retention_policy_id,retention_policy_version,retention_record_reference,retention_document_sha256,
      recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,
      approval_record_reference,approval_received_at,required_agreements,notice_agreement_kind,notice_agreement_version,notice_document_sha256)
      values($1::uuid,'staging','OWNED-RETENTION','v1','owned:retention:row-state',$2,
       'OWNED-RECIPIENT','v1','owned:recipient:row-state',$3,'owned:approval:row-state',clock_timestamp()-interval '1 second',
       '[{"kind":"fixture-terms","version":"fixture-v1"}]'::jsonb,'fixture-terms','fixture-v1',$4)`,
      [bundle,sha256("owned retention row state"),sha256("owned recipient row state"),sha256("owned notice row state")]);
    // The actual canonical AFTER UPDATE trigger creates the genesis
    // policy_capture_publications row; no direct fabricated publication INSERT.
    const changed=await f.admin.query(`update request_intent_private.workflow_settings
      set environment='staging',start_at=clock_timestamp(),retention_policy_version='owned:retention:row-state',
       recipient_policy_version='owned:recipient:row-state',policy_capture_bundle_id=$1::uuid,policy_capture_enabled=true where singleton`,[bundle]);
    expect(changed.rowCount).toBe(1);
    expect((await f.admin.query("select count(*)::integer as n from request_intent_private.policy_capture_publications where bundle_id=$1::uuid and revision=1",[bundle])).rows[0].n).toBe(1);
    expect((await f.admin.query(UNARMED_SQL)).rows[0]).toEqual({n:1,unarmed:false});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(catalog);
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("unresolved");
    // Flag restoration cannot erase the immutable bundle binding or become
    // unarmed again. This changes rows only and retains every source guard.
    await f.admin.query("update request_intent_private.workflow_settings set policy_capture_enabled=false where singleton");
    expect((await f.admin.query(UNARMED_SQL)).rows[0]).toEqual({n:1,unarmed:false});
    expect(canonical((await f.capture(f.admin)).catalog)).toBe(catalog);
    expect(await reconcileNoMailInstall(f.request,r,f.observer)).toBe("unresolved");
    expect(f.reserved.has(r.executionId)).toBe(true);expect(r.replayAllowed).toBe(false);
  }finally{await f.cleanup();}
},90000);
