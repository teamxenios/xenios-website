// Static source contract only. Executing this file is not a database proof;
// the separate disposable driver exercises the effective installed SQL.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8").replace(/\r\n/g,"\n");
const sql=read("supabase/migrations/20261001102904_research_assisted_order_quote_provider_execution.sql");
const proof=read("supabase/verification/research_assisted_order_quote_provider_execution_local.mjs");
const harness=read("supabase/verification/research_assisted_order_quote_provider_execution_harness.mjs");
const http=read("supabase/verification/research_assisted_order_quote_provider_execution_http.ts");
const body=(name:string,delimiter:string)=>sql.split(`create function public.research_assisted_order_${name}(`)[1]?.split(`$${delimiter}$;`)[0]??"";
describe("ADP02 durable provider create/recovery SQL source contract",()=>{
  it("adds no money authority, production source/policy/grant or historical adoption",()=>{
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_provider_(sources|source_grants|create_policies|execution_grants)\s*\(/);
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_(payment_observations|payment_verifications|events)|update public\.research_assisted_order_requests set status/);
    expect(sql).not.toMatch(/create (?:or replace )?function public\.research_assisted_order_(financial_state|payment_observe|payment_verify_bound|disposition_commit_cancel)\(/);
    expect(sql).toContain("'settlementEnabled',false,'refundEnabled',false,'liveExecutionEnabled',false");
    expect(sql).toContain("'schemaVersion','assisted_order_provider_journal_v2'");
  });
  it("locks request before fence and verifies distinct execution policy/grant plus immutable quote",()=>{
    const context=body("provider_create_context","context");
    expect(context.indexOf("where id=p_request_id for update")).toBeLessThan(context.indexOf("provider_fence"));
    for(const token of ["provider_scope_valid(p_expected_scope,s,p_adapter_revision)","policy_revision=p_policy_revision and revoked_at is null for share",
      "auth_user_id=p_actor_auth_user_id and revoked_at is null for share","q.acceptance_id is distinct from a.acceptance_id",
      "q.total_cents is distinct from a.expected_amount_cents","q.currency is distinct from a.currency"])expect(context).toContain(token);
    expect(context).toContain("provider_event_journal where established_request_id is null or established_request_id=r.id");
  });
  it("durable claims freeze creation key, body fingerprint and deadline while replay cannot redispatch",()=>{
    const claim=body("provider_create_claim","claim"),guard=body("provider_create_claim_guard","claim_guard");
    expect(claim).toContain("'authorized',false,'replayed',true");expect(claim).toContain("'authorized',true,'replayed',false");
    expect(claim).toContain("'claimIssuedAt'");expect(claim).toContain("'dispatchBudgetMs'");
    expect(sql).toContain("'dispatchTiming','database_budget_monotonic_v1'");
    for(const token of ["new.creation_started_at:=coalesce","new.creation_replay_until:=coalesce","new.request_fingerprint:=encode",
      "'canonicalOrderId',null","stamp>=new.creation_replay_until","new.lease_expires_at:=least"])expect(guard).toContain(token);
    expect(sql).toContain("unique(attempt_id,sequence)");expect(sql).toContain("claim_key uuid not null unique");
  });
  it("retains unknown/late/conflicting responses without replacing external identity or accepted economics",()=>{
    const guard=body("provider_create_result_guard","result_guard");
    for(const token of ["provider_require_read_committed()","where id=c.request_id for update","provider_fence where id for update",
      "result_fingerprint=new.result_fingerprint","new.classification:='unknown'","provider_identity_conflict","response_conflict",
      "(e->>'observedAmountCents')::bigint is distinct from a.expected_amount_cents","e->>'currency' is distinct from a.currency"])expect(guard).toContain(token);
    expect(sql).toContain("primary key(attempt_id,binding_kind)");expect(sql).toContain("unique(source_id,binding_kind,provider_identity)");
    expect(body("provider_create_result_append","append_result")).not.toContain("revoked_at is null");
  });
  it("bounds the result envelope and preserves request-first independent journal quarantine",()=>{
    const validator=body("provider_create_result_validate","result_validate");
    expect(validator).toContain("from jsonb_object_keys(e))<>16");expect(validator).toContain("Unknown result cannot carry invented facts");
    expect(validator).toContain("e->>'state' not in ('pending','authorized')");
    expect(sql).toContain("research_assisted_order_provider_pre_execution_event_classify");
    expect(sql).toContain("if p_locked_attempt_id is null then return prior;end if");
  });
  it("forces RLS, immutable records, exact role signatures and full predecessor/successor seal",()=>{
    for(const token of ["force row level security","enable always trigger adp02_claim","enable always trigger adp02_result",
      "enable always trigger adp02_identity","ADP02_SCHEMA_V1:","Exact final ADP01 definition required",
      "a.attacl::text","t.tgenabled","has_any_column_privilege"]) {
      expect(sql).toContain(token);
    }
    for(const signature of ["provider_create_context(uuid,uuid,text,text,jsonb,text,uuid)",
      "provider_create_claim(uuid,uuid,text,text,jsonb,text,uuid,uuid)","provider_create_result_append(uuid,text,text,jsonb,text,jsonb)","provider_execution_authority()"])
      expect(sql).toContain(signature);
    expect(sql).toContain("permitted and role_name='service_role'");
  });
  it("refuses unsupported isolation before replay and missing-record early returns",()=>{
    for(const [name,delimiter] of [["provider_create_context","context"],["provider_create_claim","claim"],["provider_create_result_append","append_result"],
      ["provider_create_result_guard","result_guard"],["provider_identity_guard","identity_guard"],["provider_execution_authority","execution_authority"]])
      expect(body(name,delimiter)).toContain("provider_require_read_committed()");
    for(const token of ["['read uncommitted','repeatable read','serializable']","await tx.ready","staleTransaction(level",
      "TRANSACTION_ISOLATION_REQUIRED","begin isolation level read committed"])expect(proof).toContain(token);
  });
  it("includes real SQL/HTTP restart, deadline, privilege and financial-invariance proof separately from static assertions",()=>{
    for(const token of ["ProviderJournalHarness","17\\.11","provider_create_result_append","snapshot()"])
      expect(harness).toContain(token);
    for(const token of ["await runHttp('legacy')","await runHttp('core')","await runHttp('restart')","await db.lockedRace",
      "select 1/0","creationReplayUntil","assert.deepEqual(await db.snapshot(),before","Migration changed during execution proof"])
      expect(proof).toContain(token);
    for(const token of ["createAssistedOrderRouteTable","new AssistedProviderExecutionService","set role service_role",
      "SYNTHETIC_COMMITTED_RESPONSE_LOST","providerConfigured:false","clientSecret","const firstBody=bodies.at(-1)"])
      expect(http).toContain(token);
    expect(http).toContain("Number(delayedClaim!.dispatchBudgetMs)+100");
    expect(http).toContain("Math.floor(Number(delayedClaim!.dispatchBudgetMs)/2)");
    expect(http).toContain("applicationWithinIssuedWindow:true,databaseLeaseExpired:true,transportCalls:0");
    expect(proof).toContain("'grant-only','provider_execution_grants'");
    expect(proof).toContain("'policy-only','provider_create_policies'");
    expect(proof).toContain("set local session_replication_role=replica");
    expect(proof).toContain("for(const [sql,detail] of replicaInserts)");
    expect(proof).toContain("provider_execution_authority(text) to service_role");
  });
});
