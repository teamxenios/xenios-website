// Source contract only. Passing this test is not effective PostgreSQL proof.
// The separately executed disposable driver owns database/runtime evidence.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8").replace(/\r\n/g,"\n");
const sql=read("supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql");
const proof=read("supabase/verification/research_assisted_order_quote_provider_settlement_local.mjs");
const http=read("supabase/verification/research_assisted_order_quote_provider_settlement_http.ts");
const body=(name:string,end:string)=>sql.split(`create function public.research_assisted_order_${name}(`)[1]?.split(`$${end}$;`)[0]??"";
describe("ADP03 separately governed provider capture SQL source contract",()=>{
  it("adds empty separate capture authority without a provider configuration or historical verification backfill",()=>{
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_provider_(sources|source_grants|settlement_policies|settlement_grants)\s*\(/);
    expect(sql).toContain("capture_semantics='single_full_capture'");
    for(const value of ["assisted_order_provider_settlement_v1","separate_scoped_admin_capture_v1","canonical_verification_outbox_admin_v2","reviewed_lineage_no_new_facts_v1","'historicalAdoption',false"])expect(sql).toContain(value);
    expect(sql).not.toMatch(/create (?:or replace )?function public\.research_assisted_order_financial_state\(/);
  });
  it("locks request then global fence before checking exact source, policy and actor grants",()=>{
    const guard=body("provider_settlement_guard","guard");
    expect(guard.indexOf("where id=new.request_id for update")).toBeLessThan(guard.indexOf("provider_fence where id for update"));
    for(const token of ["provider_scope_valid(new.expected_scope,source,new.adapter_revision)","policy_revision=new.policy_revision","auth_user_id=new.actor_auth_user_id and revoked_at is null for share","Settlement facts must be database-derived"])expect(guard).toContain(token);
  });
  it("requires current accepted full quote and exact captured external identity, with no extra or unresolved facts",()=>{
    const guard=body("provider_settlement_guard","guard");
    for(const token of ["q.state<>'accepted'","a.acceptance_id is distinct from q.acceptance_id","a.quote_version is distinct from q.version",
      "a.expected_amount_cents is distinct from q.total_cents","j.event->>'currency' is distinct from q.currency","j.event->>'kind'<>'captured'",
      "version>q.version","established_request_id is null","provider_identity_bindings","provider_create_results"])
      expect(guard).toContain(token);
    expect(guard).not.toContain("valid_until<");
    expect(body("provider_settlement_graph","graph")).toContain(">100");
  });
  it("atomically uses canonical observations, verification, evidence and paid event with deferred graph completeness",()=>{
    const commit=body("provider_settlement_commit","settle");
    for(const token of ["payment_observations","payment_verifications","research_assisted_order_set_status","'payment_review','paid'","paymentVerificationId"])
      expect(commit).toContain(token);
    for(const token of ["deferrable initially deferred","provider_settlement_complete(new.id)","evidence_claims","research_notification_outbox","provider_settlement_verification_valid"])
      expect(sql).toContain(token);
    expect(sql).toContain("verification_atomic_canonical_outbox_admin_v2");
  });
  it("keeps historical verification distinct from current financial fulfillment eligibility and exact replay",()=>{
    const eligibility=body("financial_eligibility","eligibility");
    for(const token of ["provider_settlement_integrity()","paymentVerified","fulfillmentEligible","provider_uncertainty_held","provider_settlement_incomplete","provider_settlement_graph"])
      expect(eligibility).toContain(token);
    expect(sql).toContain("ASSISTED_ORDER_PROVIDER_FULFILLMENT_HELD");
    expect(proof).toContain("exact receipt replay survives independent source/policy/grant revocation");
    expect(http).toContain("eligible supplier progression can precede notification audit");
  });
  it("retains effective ALWAYS immutability, RLS, column ACL, exact RPC and schema-seal enforcement",()=>{
    for(const token of ["force row level security","enable always trigger adp03_settlement","enable always trigger adp03_settlement_complete",
      "research_assisted_order_observation_immutable","hl12_claim_immutable","hl12_correction_immutable","research_assisted_order_events_append_only",
      "has_any_column_privilege","ADP03_SCHEMA_V1:","provider_settlement_commit(uuid,uuid,text,text,jsonb,text,uuid)","financial_eligibility(uuid)"])
      expect(sql).toContain(token);
    expect(proof).toContain("set local session_replication_role=replica");
    expect(proof).toContain("provider_settlement_authority(text) to service_role");
  });
  it("rejects unsupported transaction snapshots before replay or missing-record shortcuts",()=>{
    for(const [name,end] of [["provider_settlement_commit","settle"],["financial_eligibility","eligibility"],["provider_settlement_integrity","integrity"]])
      expect(body(name,end)).toContain("provider_require_read_committed()");
    for(const token of ["['read uncommitted','repeatable read','serializable']","staleTransaction(level","await tx.ready","TRANSACTION_ISOLATION_REQUIRED","begin isolation level read committed"])
      expect(proof).toContain(token);
  });
  it("keeps real composed SQL/F4 proof and explicit synthetic limits separate from static assertions",()=>{
    for(const token of ["await runHttp('legacy')","await runHttp('core')","await runHttp('restart')","runSettlementRaces(db)","await db.lockedRace",
      "select 1/0","valid_until < clock_timestamp()","SETTLEMENT_SQL CLEANUP","postRemovalInspect:'not_found'"])
      expect(proof).toContain(token);
    for(const token of ["new AssistedProviderSettlementService","new SupabaseAssistedOrderRepository","resolveAssistedOrderAuditAuthority",
      "resolvePaymentEffectsRecovery","paymentEffectDispatchAllowed","SYNTHETIC_COMMITTED_RECEIPT_LOSS","synthetic-adp03-key-2","realProviderAuthenticated:false"])
      expect(http).toContain(token);
  });
});
