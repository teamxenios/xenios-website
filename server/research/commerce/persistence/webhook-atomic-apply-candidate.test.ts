import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const candidateUrl = new URL(
  "../../../../supabase/candidates/20260828_research_commerce_webhook_atomic_apply.sql",
  import.meta.url,
);
const sql = readFileSync(candidateUrl, "utf8");
const normalized = sql.replace(/\r\n/g, "\n");
const functionStart = normalized.indexOf(
  "create function public.research_commerce_webhook_claim_and_apply_v1(",
);
const functionEnd = normalized.indexOf(
  "\ncomment on function public.research_commerce_webhook_claim_and_apply_v1(",
  functionStart,
);
const functionSql = normalized.slice(functionStart, functionEnd);

describe("the unapplied webhook atomic-apply SQL candidate", () => {
  it("is visibly unapplied and remains outside the protected migration ledger and DAG", () => {
    expect(normalized).toContain("STATUS: UNAPPLIED CANDIDATE");
    expect(normalized).toContain("NOT REGISTERED IN THE MIGRATION DAG/LEDGER");

    const ledger = readFileSync(new URL("../../../../supabase/MIGRATIONS.md", import.meta.url), "utf8");
    expect(ledger).not.toContain("20260828_research_commerce_webhook_atomic_apply");
    const appliedNames = readdirSync(
      new URL("../../../../supabase/migrations/", import.meta.url),
    );
    expect(appliedNames).not.toContain("20260828_research_commerce_webhook_atomic_apply.sql");
  });

  it("binds provider and event identity to the exact signed-payload digest", () => {
    expect(normalized).toContain("UNIQUE (provider_name, event_id)");
    expect(functionSql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(functionSql).toContain("p_provider_name || '|' || p_event_id");
    expect(functionSql).toMatch(
      /existing_event\.payload_sha256\s+is null\s+or existing_event\.payload_sha256 <> p_payload_sha256/,
    );
    expect(functionSql).toMatch(
      /from public\.research_provider_webhook_events e[\s\S]*?for update;/,
    );
  });

  it("locks the canonical order and keeps all effect writes in the one RPC transaction", () => {
    expect(functionSql).toMatch(/from public\.research_orders o[\s\S]*?for update;/);

    const effectStart = functionSql.indexOf("from_state := locked_order.state;");
    const effectSql = functionSql.slice(effectStart);
    const orderWrite = effectSql.indexOf("update public.research_orders");
    const shipmentWrite = effectSql.indexOf("update public.research_order_shipments");
    const stateFactWrite = effectSql.indexOf("insert into public.research_order_state_events");
    const inboxWrite = effectSql.indexOf("insert into public.research_provider_webhook_events");
    expect(effectStart).toBeGreaterThan(-1);
    expect(orderWrite).toBeGreaterThan(-1);
    expect(shipmentWrite).toBeGreaterThan(orderWrite);
    expect(stateFactWrite).toBeGreaterThan(shipmentWrite);
    expect(inboxWrite).toBeGreaterThan(stateFactWrite);
    expect(effectSql).not.toMatch(/\bcommit\b|\brollback\b/i);
  });

  it("uses a closed transition table and does not claim future-valid out-of-order events", () => {
    expect(functionSql).toContain("locked_order.state = 'checkout_pending'");
    expect(functionSql).toContain("p_target_state = 'payment_authorized'");
    expect(functionSql).toContain("locked_order.state = 'approved'");
    expect(functionSql).toContain("p_target_state = 'payment_captured'");
    expect(functionSql).toContain("locked_order.state = 'fulfilled'");
    expect(functionSql).toContain("p_target_state = 'delivered'");

    const retryableReturn = functionSql.indexOf(
      "jsonb_build_object('outcome', 'retryable')",
    );
    const retryableBranch = functionSql.lastIndexOf(
      "if not transition_allowed",
      retryableReturn,
    );
    const permanentAck = functionSql.indexOf(
      "p_order_id, 'acknowledged', p_received_at, capability",
    );
    expect(retryableReturn).toBeGreaterThan(-1);
    expect(retryableBranch).toBeGreaterThan(-1);
    expect(permanentAck).toBeGreaterThan(retryableReturn);
    expect(functionSql.slice(retryableBranch, retryableReturn)).not.toContain(
      "insert into public.research_provider_webhook_events",
    );
  });

  it("hardens the definer boundary, ACL, and exact five-key response attestation", () => {
    expect(functionSql).toContain("security definer\nset search_path = pg_catalog");
    for (const key of ["capability", "providerName", "eventId", "payloadSha256"]) {
      expect(functionSql).toContain(`'${key}'`);
    }
    expect(functionSql).toContain("pg_catalog.jsonb_build_object('outcome'");
    expect(normalized).toMatch(
      /revoke all on function public\.research_commerce_webhook_claim_and_apply_v1\([\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(normalized).toMatch(
      /grant execute on function public\.research_commerce_webhook_claim_and_apply_v1\([\s\S]*?to service_role;/,
    );
    expect(normalized).toContain(
      "grant select on table public.research_provider_webhook_events to service_role;",
    );
    expect(normalized).toContain("provider webhook inbox claims are immutable");
    expect(normalized).not.toContain("create or replace function");
    expect(normalized).not.toContain("drop trigger if exists");
    expect(normalized).toContain("same-name routine collision");
    expect(normalized).toContain("same-name trigger collision");
    expect(normalized).toContain("same-name constraint collision");
    expect(normalized).toContain("t.tgtype = 27");
    expect(normalized).toContain("atomic bundle constraint definition is not exact");
  });
});
