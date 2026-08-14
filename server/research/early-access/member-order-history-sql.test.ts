import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/pack02-candidates/20260813_roman_early_access_order_history.sql",
  "utf8",
);

describe("Roman legacy order-history SQL boundary", () => {
  it("uses the applied M62 member/customer authority and includes legitimate aliases", () => {
    expect(sql).toContain("research_early_access_legal_bindings");
    expect(sql).toContain("where b.member_id = p_member_id");
    expect(sql).toContain("unnest(b.alias_refs)");
    expect(sql).toContain("ambiguous Early Access customer ownership for member");
  });

  it("scopes list and detail inside SECURITY DEFINER routines", () => {
    expect(sql).toContain("research_early_access_customer_refs_for_member(p_member_id)");
    expect(sql).toContain("join public.research_early_access_placements p using (customer_ref)");
    expect(sql).toContain("where entry->>'orderNumber' = p_order_number");
    expect(sql.match(/security definer/g)).toHaveLength(3);
  });

  it("projects a member allowlist and never serializes private legacy records", () => {
    for (const key of [
      "'orderNumber'",
      "'placedAt'",
      "'lines'",
      "'totalCents'",
      "'currency'",
      "'paymentState'",
      "'fulfillmentState'",
      "'tracking'",
    ]) expect(sql).toContain(key);
    expect(sql).not.toMatch(/'supplier(Id|Sku|Packet|Reference)'/i);
    expect(sql).not.toMatch(/'customerRef'|'buyCost'|'margin'|'proof'|'sha256'/i);
    expect(sql).not.toContain("select p.record");
  });

  it("grants only service_role execution and performs no data mutation", () => {
    expect(sql.match(/grant execute on function/g)).toHaveLength(3);
    expect(sql).not.toMatch(/grant execute[\s\S]*to (anon|authenticated)/i);
    expect(sql).not.toMatch(/\b(insert into|update public|delete from|truncate)\b/i);
  });
});
