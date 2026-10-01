import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8").replace(/\r\n/g,"\n");
const sql=read("supabase/migrations/20261001085559_research_assisted_order_quote_provider_journal.sql");
const proof=read("supabase/verification/research_assisted_order_quote_provider_journal_local.mjs");
const harness=read("supabase/verification/research_assisted_order_quote_provider_journal_harness.mjs");
const http=read("supabase/verification/research_assisted_order_quote_provider_journal_http.ts");
const isolation=read("supabase/verification/research_assisted_order_quote_provider_journal_isolation.mjs");
const body=(name:string,delimiter:string)=>sql.split(`create function public.${name}(`)[1]?.split(`$${delimiter}$;`)[0]??"";

describe("ADP01 provider-neutral held journal SQL source contract",()=>{
  it("installs empty source/grant authority and never settles, refunds or fabricates historical payment",()=>{
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_provider_(sources|source_grants)\s*\(/);
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_(payment_observations|payment_verifications|events)|update public\.research_assisted_order_requests set status/);
    expect(sql).toContain("'settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false");
    expect(sql).not.toMatch(/create (?:or replace )?function public\.research_assisted_order_(financial_state|payment_verify|payment_observe)\(/);
    expect(sql).toContain("check(state='held')");
  });
  it("binds exact configured scope/revision and accepted quote facts under request-first locking",()=>{
    const reserve=body("research_assisted_order_provider_attempt_reserve","reserve");
    expect(reserve.indexOf("for update;")).toBeLessThan(reserve.indexOf("provider_fence"));
    for(const token of ["p_adapter_revision text,p_expected_scope jsonb","provider_scope_valid(p_expected_scope,s,p_adapter_revision)",
      "auth_user_id=p_actor_auth_user_id and revoked_at is null for share","a.expected_scope is distinct from p_expected_scope",
      "q.total_cents,q.currency"])expect(reserve).toContain(token);
    const guard=body("research_assisted_order_provider_attempt_guard","attempt_guard");
    for(const token of ["q.state is distinct from 'accepted'","q.version is distinct from new.quote_version",
      "q.acceptance_id is distinct from new.acceptance_id","q.total_cents is distinct from new.expected_amount_cents",
      "research_assisted_order_payment_observations","research_assisted_order_payment_verifications","status='paid'",
      "research_assisted_order_financial_dispositions"])expect(guard).toContain(token);
  });
  it("freezes initial known parent before fence; never rebinds initially unknown provider claims",()=>{
    const guard=body("research_assisted_order_provider_journal_guard","journal_guard");
    expect(guard.indexOf("into attempt_uuid,request_uuid")).toBeLessThan(guard.indexOf("provider_fence"));
    expect(guard.indexOf("where id=request_uuid for update")).toBeLessThan(guard.indexOf("provider_fence"));
    expect(guard).toContain("provider_event_classify(new.source_id,new.event,attempt_uuid)");
    const classifier=body("research_assisted_order_provider_event_classify","classify");
    expect(classifier).toContain("where id=p_locked_attempt_id and source_id=p_source_id");
    expect(classifier).not.toMatch(/for update|for share/);
    expect(classifier).toContain("elsif a.id is null then why:='unknown_attempt'");
    expect(classifier).toContain("elsif e->>'kind'='unknown' then why:='unsupported_financial_effect'");
  });
  it("persists conflicts alongside original immutable journal facts and requires database-derived bindings",()=>{
    for(const token of ["unique(source_id,event_identity,event_fingerprint)","event_identity_conflict","payment_identity_conflict",
      "new.event_identity is not null","new.established_request_id is not null","new.classification is not null",
      "new.received_at is not null","new.received_at:=date_trunc('milliseconds',clock_timestamp())"])expect(sql).toContain(token);
    expect(body("research_assisted_order_provider_event_append","append")).not.toMatch(/for update|for share/);
  });
  it("uncertainty protects both normalized financial facts and N2 without rewriting original two-key state",()=>{
    const uncertainty=body("research_assisted_order_provider_uncertainty","uncertainty");
    expect(uncertainty).toContain("where established_request_id is null");
    expect(uncertainty).toContain("provider_unbound_event_held");
    for(const token of ["research_assisted_order_no_funds_evidence","research_assisted_order_financial_dispositions",
      "research_assisted_order_payment_verifications","research_assisted_order_payment_observations",
      "research_assisted_order_observation_corrections","before insert or update on public.research_assisted_order_quotes",
      "before update of status on public.research_assisted_order_requests"])expect(sql).toContain(token);
    expect(sql).toContain("perform public.research_assisted_order_provider_assert_clear(p_request_id)");
  });
  it("seals schema/ACL/guards, keeps RLS forced and grants only the exact held public RPCs",()=>{
    for(const token of ["ADP01_SCHEMA_V1:","pg_get_functiondef","a.attacl::text","t.tgenabled","force row level security",
      "enable always trigger","has_any_column_privilege","permitted and role_name='service_role'",
      "research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)",
      "research_assisted_order_provider_event_append(text,text,jsonb,jsonb)"])expect(sql).toContain(token);
  });
  it("refuses stale isolation rather than assuming a row lock refreshes an old snapshot",()=>{
    expect(sql).toContain("current_setting('transaction_isolation')");
    expect(sql).toContain("'read committed'");
    expect(sql).toContain("ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED");
    for(const [name,delimiter] of [["provider_uncertainty","uncertainty"],["provider_attempt_reserve","reserve"],
      ["provider_journal_guard","journal_guard"],["provider_journal_authority","authority"]]) {
      expect(body(`research_assisted_order_${name}`,delimiter)).toContain("provider_require_read_committed()");
    }
    for(const token of ["repeatable-read/reservation/cancel","repeatable-read/reservation/manual-verify","repeatable-read/reservation/no-funds",
      "serializable/reservation/cancel","repeatable-read/global/manual-verify","repeatable-read/global/no-funds",
      "repeatable-read/global/cancel","serializable/global/cancel","await tx.ready", "await db.psql(reserve(n))",
      "['read uncommitted','repeatable read','serializable']","assert.equal(state.financial.paymentVerified,false,label)",
      "begin isolation level read committed", "Migration changed during isolation qualification"])expect(isolation).toContain(token);
    expect(proof).toContain("research_assisted_order_quote_provider_journal_isolation.mjs");
  });
  it("includes real-role no-network rollback, lock-wait, drift, scope and mounted-application qualification",()=>{
    for(const token of ["'v20.19.0'","'--network', 'none'","'--pull=never'","wait_event_type='Lock'","CLEANUP removed exact"])
      expect(harness).toContain(token);
    for(const token of ["synthetic-initially-invisible-attempt","synthetic-global-after-cancel","manual-verify",
      "select 1/0","source_id,adapter_revision,expected_scope,event,${field}","grant select(event)","await db.psql(migration)",
      "await runHttp('bound')","await runHttp('quarantine')"])expect(proof).toContain(token);
    for(const token of ["createAssistedOrderRouteTable","new AssistedProviderJournalService","set role service_role",
      "SYNTHETIC_ROLLBACK","SYNTHETIC_RESPONSE_LOSS","syntheticAuth:true","providerConfigured:false"])
      expect(http).toContain(token);
  });
});
