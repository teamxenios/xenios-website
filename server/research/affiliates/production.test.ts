import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "production.ts"), "utf8");
const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260728020000_research_affiliate_professional_operations.sql",
  ),
  "utf8",
);

describe("affiliate production boundary", () => {
  it("uses only reviewed RPCs for mutation", () => {
    for (const rpc of [
      "research_affiliate_configure_partner",
      "research_affiliate_create_link",
      "research_affiliate_record_attribution",
      "research_affiliate_record_commission",
      "research_affiliate_publish_statement",
    ]) expect(source).toContain(`.rpc("${rpc}"`);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(source).toContain("p_order_id: input.orderId");
    expect(source).toContain("p_supersedes_statement_id");
    expect(source).toContain("p_payout_provider");
    expect(source).toContain("p_payout_reference");
    expect(source).toContain("Paid commission evidence requires payout provider and reference.");
    expect(source).not.toContain("p_amount_cents");
    expect(source).not.toContain("p_revenue_cents");
  });

  it("scopes link and statement reads to the exact partner", () => {
    expect(source.match(/\.eq\("partner_id", partnerId\)/g)).toHaveLength(2);
  });

  it("does not expose customer PII in partner projections", () => {
    expect(source).not.toContain("customer_email");
    expect(source).not.toContain("member_id");
    expect(source).not.toContain("shipping_address");
    expect(source).not.toContain("health");
  });

  it("pins Lawrence, payout, and statement-lineage invariants in PostgreSQL", () => {
    expect(migration).toContain("research_lawrence_one_current_idx");
    expect(migration).toContain("research_lawrence_supersession_guard");
    expect(migration).toContain("configured commission hold period has not elapsed");
    expect(migration).toContain("configured payout threshold has not been met");
    expect(migration).toContain("paid commission requires immutable payout evidence");
    expect(migration).toContain("attribution.occurred_at::date between p_period_start and p_period_end");
    expect(migration).toContain("attribution already belongs to an active statement lineage");
  });
});
