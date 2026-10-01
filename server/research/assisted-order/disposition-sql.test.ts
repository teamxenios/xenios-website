import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261001062651_research_assisted_order_quote_no_funds_disposition.sql");
const proof = read("supabase/verification/research_assisted_order_quote_no_funds_disposition_local.mjs");
const body = (name: string, delimiter: string) => sql.split(`create or replace function public.${name}(`)[1].split(`$${delimiter}$;`)[0];

describe("N2 positive no-funds explicit cancellation SQL contract", () => {
  it("installs a separate empty capability and refuses void/refund/provider/historical adoption", () => {
    expect(sql).toContain("primary key(auth_user_id,source_namespace)");
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_no_funds_grants/);
    expect(sql).toContain("check(outcome='never_received')");
    expect(sql).toContain("check(finality='terminal')");
    expect(sql).toContain("'unsupportedKinds',jsonb_build_array('void','refund')");
    expect(sql).toContain("'historicalAdoption',false");
    expect(sql).not.toMatch(/create or replace function public\.research_assisted_order_(?:financial_state|payment_verify|payment_observe|payment_correct_manual|quote_issue|quote_accept|payment_effects_)/);
  });
  it("binds the entire bounded graph and refuses orphan claims, cross-order edges and cycles", () => {
    const graph = body("research_assisted_order_disposition_graph", "graph");
    for (const token of ["method<>'manual'", "observed_by_auth_user_id is null", "state='accepted'", "status='paid'",
      "research_assisted_order_payment_verifications", "observations", "corrections", "claims", "with recursive walk", "cycle",
      "Financial source graph is incomplete or cross-request", "extensions.digest", "'sha256'"]) expect(graph).toContain(token);
    expect(graph.match(/>100/g)).toHaveLength(3);
    expect(graph).not.toMatch(/\blimit\s+100/i);
  });
  it("locks request first, rechecks scoped grant and current graph, and atomically cancels", () => {
    const commit = body("research_assisted_order_disposition_commit_cancel", "commit");
    expect(commit.indexOf("for update;")).toBeLessThan(commit.indexOf("for share;"));
    expect(commit.indexOf("for share;")).toBeLessThan(commit.indexOf("disposition_graph(p_request_id)"));
    for (const token of ["p_intent is distinct from 'cancel'", "ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE", "e.receipt is distinct from p_receipt",
      "max(observed_at)", "max(claimed_at)", "research_assisted_order_no_funds_evidence", "research_assisted_order_financial_dispositions",
      "'financialDispositionId',d.id", "d.resolved_at"]) expect(commit).toContain(token);
  });
  it("guards direct writes, deferred correction endpoints, terminal status and retained graph", () => {
    for (const token of ["hl12_disposition_evidence before insert", "new.receipt is distinct from jsonb_build_object",
      "a.request_id is distinct from b.request_id", "a.quote_id is distinct from b.quote_id", "deferrable initially deferred",
      "hl12_disposition_cancel_event before insert", "aa_hl12_disposition_terminal before update of status",
      "before truncate", "'research_assisted_order_events'", "ASSISTED_ORDER_FINANCIAL_DISPOSITION_TERMINAL"]) expect(sql).toContain(token);
    const terminal = body("research_assisted_order_disposition_terminal_guard", "terminal");
    expect(terminal).toContain("if tg_table_name='research_assisted_order_requests' then\n      if new.status='cancelled'");
  });
  it("persists only canonical held outbox then appends exact canonical audit before release", () => {
    expect(sql).not.toMatch(/create table[^;]*(?:queue|outbox|audit)/);
    for (const token of ["assisted_order_disposition_id", "'held',new.resolved_at,new.resolved_at,new.id", "'cancellation_reason_present'",
      "research_assisted_order_audit_append(p_schema_version,p_attestation,p_event)", "ASSISTED_ORDER_DISPOSITION_EFFECTS_AUDIT_REQUIRED",
      "(created_at,id)>(p_after_created_at,p_after_id)", "p_disposition_id is null then return false", "'Request cancelled. No funds were received for this request.'"]) expect(sql).toContain(token);
    expect(body("research_assisted_order_disposition_effects_complete", "complete")).not.toContain("no_funds_grants");
  });
  it("requires effective exact predecessor guards and explicit seven-RPC service allowlist", () => {
    for (const token of ["tgfoid=to_regprocedure('public.'||g.function_name)", "tgenabled in ('O','A')", "hl12_claim_immutable",
      "research_assisted_order_events_append_only", "research_assisted_order_observation_immutable", "hl12_observed_cancel",
      "revoke all on function %s from public,anon,authenticated,service_role", "permitted and v_role='service_role'",
      "force row level security"]) expect(sql).toContain(token);
  });
  it("provides bounded read-only inventory/postchecks including absent signatures and nullable search_path", () => {
    for (const suffix of ["precheck", "postcheck"]) {
      const check = read(`supabase/verification/research_assisted_order_quote_no_funds_disposition_${suffix}.sql`);
      expect(check).toContain("begin transaction read only;");
      expect(check).toContain("set local statement_timeout='15s';");
      expect(check).toContain("set local lock_timeout='5s';");
      expect(check).toContain("hl12_claim_immutable");
      expect(check).toContain("tgenabled in ('O','A')");
    }
  });
  it("provides actual-role disposable interruption, graph, row-lock race and HTTP parity proof", () => {
    for (const token of ["v20.19.0", "'--network','none'", "set role service_role", "wait_event_type='Lock'",
      "replacement-invisible", "edge-inserted", "select 1/0", "synthetic-orphan", "synthetic2", "_http.ts", "CLEANUP removed exact"])
      expect(proof).toContain(token);
  });
});
