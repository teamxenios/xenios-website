import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const active=Boolean(process.env.CI)||process.env.XENIOS_RUN_PG16_VERIFIER==="1";
const actor="10000000-0000-4000-8000-000000000001";
describe.skipIf(!active)("business application actual disposable PG16",()=>{
  const name="xenios-business-app-"+randomUUID(),password=randomUUID();let port=0,created=false;
  const docker=(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",windowsHide:true,timeout:60000,stdio:["ignore","pipe","pipe"]}).trim();
  async function query(sql:string,values:unknown[]=[],role="postgres"){
    if(!port)throw Error("Owned PG unavailable");
    const client=new pg.Client({host:"127.0.0.1",port,user:"postgres",password,database:"business_app",connectionTimeoutMillis:5000,statement_timeout:12000});
    await client.connect();try{await client.query("begin");if(!["postgres","service_role","anon","authenticated"].includes(role))throw Error("Bad fixture role");await client.query("set local role "+role);const r=await client.query(sql,values);await client.query("commit");return r;}catch(e){await client.query("rollback");throw e;}finally{await client.end();}
  }
  const readiness=()=>query("select public.research_business_inquiry_readiness() as ready",[],"service_role").then(r=>r.rows[0].ready);
  beforeAll(async()=>{
    docker("create","--rm","--name",name,"--publish","127.0.0.1::5432","--env","POSTGRES_PASSWORD="+password,"--env","POSTGRES_DB=business_app","postgres:16");created=true;docker("start",name);
    const published=/^127\.0\.0\.1:(\d+)$/.exec(docker("port",name,"5432/tcp"));if(!published)throw Error("Owned loopback required");port=Number(published[1]);
    execFileSync("docker",["exec",name,"sh","-c","i=0; while [ \"$i\" -lt 30 ]; do if pg_isready -h 127.0.0.1 -U postgres -d business_app >/dev/null 2>&1; then exit 0; fi; i=$((i+1)); sleep 1; done; exit 1"],{timeout:35000,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    const version=Number((await query("show server_version_num")).rows[0].server_version_num);expect(version).toBeGreaterThanOrEqual(160000);expect(version).toBeLessThan(170000);
    await query("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);grant usage on schema public,auth to service_role;grant select on auth.users to service_role;");
    await query("insert into auth.users values($1,now(),null)",[actor]);
    await query(readFileSync(resolve("supabase/care-access-foundation.sql"),"utf8"));
    // Prove the companion preserves an existing separately reviewed role value.
    await query("alter table public.care_role_assignments drop constraint care_role_assignments_role_check;alter table public.care_role_assignments add constraint care_role_assignments_role_check check(role in('care_patient','clinician','clinical_admin','pharmacy_operations','lab_reviewer','clinical_support','care_security_admin','existing_review_role'));");
    await query(readFileSync(resolve("supabase/candidates/business_inquiry.sql"),"utf8"));
    const application=readFileSync(resolve("supabase/candidates/business_inquiry_application.sql"),"utf8");await query(application);await query(application);
  },60000);
  afterAll(()=>{if(created)docker("rm","--force",name)});
  it("applies twice while preserving old authority, granting no human access and enabling nothing",async()=>{
    expect(await readiness()).toBe(false);expect((await query("select count(*)::int n from public.care_role_assignments")).rows[0].n).toBe(0);
    expect((await query("select capability_key,state from public.care_capabilities where capability_key like 'business_inquiry_%' order by capability_key")).rows).toEqual([{capability_key:"business_inquiry_assign",state:"disabled"},{capability_key:"business_inquiry_read",state:"disabled"}]);
    await query("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'existing_review_role',$1)",[actor]);
    await expect(query("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'invented_global_admin',$1)",[actor])).rejects.toThrow();
  });
  it("requires actual policy/visibility/retention and approved dedicated staff capability on each readiness lookup",async()=>{
    await query("update business_inquiry_private.configuration set enabled=true,visibility_ready=true,retention_ready=true,policy_version='owned-fixture',policy_binding='{\"scope\":\"business_b2b\",\"retentionRecord\":\"owned-fixture\",\"recipientRecord\":\"owned-fixture\"}'");
    expect(await readiness()).toBe(false);
    await query("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'business_inquiry_reader',$1)",[actor]);expect(await readiness()).toBe(false);
    await query("update public.care_capabilities set state='enabled',approved_by=$1,approved_at=now() where capability_key='business_inquiry_read'",[actor]);expect(await readiness()).toBe(true);
    await query("update public.care_role_assignments set revoked_at=now() where role='business_inquiry_reader'");expect(await readiness()).toBe(false);
    await query("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'business_inquiry_operator',$1)",[actor]);expect(await readiness()).toBe(true);
    await query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[actor]);expect(await readiness()).toBe(false);
    await query("update auth.users set banned_until=null where id=$1",[actor]);expect(await readiness()).toBe(true);
    await query("update business_inquiry_private.configuration set visibility_ready=false,enabled=false");expect(await readiness()).toBe(false);
  });
  it.each(["anon","authenticated"])("refuses browser readiness invocation as %s",async role=>{
    await expect(query("select public.research_business_inquiry_readiness()",[],role)).rejects.toThrow("permission denied");
  });
  it("does not let the server change policy/activation or create a role through readiness",async()=>{
    await expect(query("update business_inquiry_private.configuration set enabled=true",[],"service_role")).rejects.toThrow("permission denied");
    await expect(query("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'business_inquiry_operator',$1)",[actor],"service_role")).rejects.toThrow("permission denied");
  });
});
