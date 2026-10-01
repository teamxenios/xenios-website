import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261001044200_research_assisted_order_quote_history_reissue.sql");
const old = read("supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql");
const proof = read("supabase/verification/research_assisted_order_quote_history_reissue_local.mjs");
const body = (text: string) => text.split("create or replace function public.research_assisted_order_quote_issue(")[1].split("$issue$;")[0];

describe("HIST-02 narrow quote history/reissue SQL contract", () => {
  it("keeps the RPC signature and complete economics/snapshot tail unchanged", () => {
    expect(body(sql).split("returns jsonb")[0]).toBe(body(old).split("returns jsonb")[0]);
    expect(body(sql).split("  for v_line in ")[1]).toBe(body(old).split("  for v_line in ")[1]);
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
    expect(sql).not.toMatch(/create table|insert into public\.research_assisted_order_payment_/);
  });
  it("admits the two legacy pre-payment statuses only after acquiring the parent lock", () => {
    const implementation = body(sql);
    expect(implementation).toContain("'agreements_complete', 'payment_pending', 'payment_review'");
    expect(implementation.indexOf("for update;")).toBeLessThan(implementation.indexOf("v_request.status not in"));
    expect(implementation.indexOf("ASSISTED_ORDER_QUOTE_FINANCIAL_HISTORY_HOLD")).toBeLessThan(implementation.indexOf("for v_line in"));
  });
  it("holds accepted quotes and every observation/verification/paid history without inferring no funds", () => {
    expect(body(sql)).toContain("where request_id = p_request_id and state = 'accepted'");
    expect(body(sql)).toMatch(/from public\.research_assisted_order_payment_observations\s+where request_id = p_request_id\)/);
    expect(body(sql)).toMatch(/from public\.research_assisted_order_payment_verifications\s+where request_id = p_request_id\)/);
    expect(body(sql)).toContain("where request_id = p_request_id and status = 'paid'");
    expect(body(sql)).not.toContain("not exists (select 1 from public.research_assisted_order_observation_corrections");
  });
  it("preserves request-line authority, positive cents, full coverage and immutable versioning", () => {
    for (const fragment of ["Held or Care lines cannot be quoted", "A priced line must retain its authoritative unit price",
      "private pricing basis", "v_unit <= 0", "v_total > 100000000", "v_unit * v_line.quantity",
      "pg_catalog.jsonb_array_length(p_line_decisions) <> v_count", "where request_id = p_request_id and state = 'issued'"]) {
      expect(body(sql)).toContain(fragment);
    }
  });
  it("requires effective origin guards and explicit service-only RPC privileges", () => {
    expect(sql).toContain("t.tgenabled in ('O','A')");
    expect(sql).toContain("t.tgrelid = pg_catalog.to_regclass(v_guard.relation_name)");
    expect(sql).toContain("t.tgfoid = pg_catalog.to_regprocedure(v_guard.function_name)");
    expect(sql).toContain("from public, anon, authenticated, service_role;");
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("ASSISTED_ORDER_QUOTE_REISSUE_PREDECESSOR_REQUIRED");
  });
  it("ships bounded aggregate-only read checks and actual-role disposable race/rollback proof", () => {
    for (const suffix of ["precheck", "postcheck"]) {
      const check = read(`supabase/verification/research_assisted_order_quote_history_reissue_${suffix}.sql`);
      expect(check).toContain("begin transaction read only;");
      expect(check).toContain("set local statement_timeout='15s';");
      expect(check).toContain("set local lock_timeout='5s';");
    }
    for (const fragment of ["v20.19.0", '"--network","none"', "wait_event_type='Lock'", "SYNTHETIC_REISSUE_INTERRUPTION",
      "acceptFirst", "issueFirst", "cancelFirst", "issueBeforeCancel", "observationRace", "verificationRace", "oldExpiredRow"]) {
      expect(proof).toContain(fragment);
    }
  });
});
