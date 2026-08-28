import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const candidateUrl = new URL(
  "../../../../supabase/candidates/20260828_research_commerce_refund_command.sql",
  import.meta.url,
);
const sql = readFileSync(candidateUrl, "utf8").replace(/\r\n/g, "\n");
const functionStart = sql.indexOf("create function public.research_commerce_refund_command_v1(");
const functionEnd = sql.indexOf(
  "\ncomment on function public.research_commerce_refund_command_v1(",
  functionStart,
);
const functionSql = sql.slice(functionStart, functionEnd);

describe("the unapplied durable refund command SQL candidate", () => {
  it("is visibly unapplied and outside the protected migration DAG/ledger", () => {
    expect(sql).toContain("STATUS: UNAPPLIED CANDIDATE");
    expect(sql).toContain("NOT REGISTERED IN THE MIGRATION DAG/LEDGER");
    expect(
      readFileSync(new URL("../../../../supabase/MIGRATIONS.md", import.meta.url), "utf8"),
    ).not.toContain("20260828_research_commerce_refund_command");
    expect(readdirSync(new URL("../../../../supabase/migrations/", import.meta.url))).not.toContain(
      "20260828_research_commerce_refund_command.sql",
    );
  });

  it("persists one claim/order/member-bound provider key before provider permission", () => {
    expect(sql).toContain("unique (claim_id, client_idempotency_key)");
    expect(sql).toContain("provider_idempotency_key text not null unique");
    expect(functionSql).toContain("locked_claim.id::text || '|' || locked_order.id::text");
    expect(functionSql).toContain("|| locked_claim.member_id::text || '|' || p_client_idempotency_key");
    const intentInsert = functionSql.indexOf("insert into public.research_refund_commands");
    const executionClaim = functionSql.indexOf("set state = 'provider_in_flight'");
    expect(intentInsert).toBeGreaterThan(-1);
    expect(executionClaim).toBeGreaterThan(intentInsert);
  });

  it("locks both financial authority rows and serializes every active order command", () => {
    expect(functionSql).toMatch(/from public\.research_claims c[\s\S]*?for update;/);
    expect(functionSql).toMatch(/from public\.research_orders o[\s\S]*?for update;/);
    expect(sql).toContain("create unique index research_refund_commands_one_active_per_order_idx");
    expect(sql).toContain("'reconciliation_required'");
    expect(functionSql).toContain("pg_catalog.pg_advisory_xact_lock");
  });

  it("models ambiguous outcomes without publishing domain success", () => {
    expect(sql).toContain("'provider_in_flight'");
    expect(sql).toContain("'provider_retryable'");
    expect(sql).toContain("'reconciliation_required'");
    expect(sql).toContain("'terminal_refused'");
    const stale = functionSql.indexOf("failure_code = 'STALE_DOMAIN_SNAPSHOT'");
    const orderWrite = functionSql.indexOf("update public.research_orders", stale);
    expect(stale).toBeGreaterThan(-1);
    expect(orderWrite).toBeGreaterThan(stale);
    expect(functionSql.slice(stale, orderWrite)).toContain("'reconciliation_required'");
    expect(functionSql).toContain(
      "p_action = 'complete' and locked_command.state = 'reconciliation_required'",
    );
    expect(sql).toContain("research_refund_commands_provider_proof_unique_idx");
  });

  it("publishes order, event, refund ledger, claim, and command in one RPC transaction", () => {
    const publish = functionSql.indexOf("update public.research_orders");
    const event = functionSql.indexOf("insert into public.research_order_state_events", publish);
    const ledger = functionSql.indexOf("insert into public.research_refund_keys", event);
    const claim = functionSql.indexOf("update public.research_claims", ledger);
    const command = functionSql.indexOf("update public.research_refund_commands", claim);
    expect(publish).toBeGreaterThan(-1);
    expect(event).toBeGreaterThan(publish);
    expect(ledger).toBeGreaterThan(event);
    expect(claim).toBeGreaterThan(ledger);
    expect(command).toBeGreaterThan(claim);
    expect(functionSql.slice(publish)).not.toMatch(/\bcommit\b|\brollback\b/i);
  });

  it("hardens the definer/ACL boundary and exact capability envelope", () => {
    expect(functionSql).toContain("security definer\nset search_path = pg_catalog");
    expect(sql).toContain("'research_commerce_refund_command/v1'");
    expect(sql).toContain("'capability'");
    expect(sql).toContain("'action'");
    expect(sql).toContain("'outcome'");
    expect(sql).toContain("'command'");
    expect(sql).toMatch(
      /revoke all on function public\.research_commerce_refund_command_v1\([\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.research_commerce_refund_command_v1\([\s\S]*?to service_role;/,
    );
    expect(sql).toContain("grant select on table public.research_refund_commands to service_role;");
    expect(sql).toContain("grant select on table public.research_refund_keys to service_role;");
    expect(sql).not.toContain("create or replace function");
    expect(sql).toContain("same-name relation collision");
    expect(sql).toContain("same-name routine collision");
  });
});
