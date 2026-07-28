import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "suppliers.ts"), "utf8");

describe("supplier operations boundary", () => {
  it("uses RPC-only commands and reauthorizing read projections", () => {
    expect(source).toContain('.rpc("research_fulfillment_onboard_supplier"');
    expect(source).toMatch(/\.rpc\(\s*"research_fulfillment_assign_supplier_user"/);
    expect(source).toContain('.rpc("research_fulfillment_configure_offer"');
    expect(source).toContain('.rpc("research_fulfillment_record_settlement"');
    expect(source).toContain('"research_fulfillment_list_suppliers"');
    expect(source).toContain('"research_fulfillment_list_supplier_offers"');
    expect(source).toContain("p_actor_auth_user_id: actorId");
    expect(source).toContain("p_supplier_id: supplierId");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(source).not.toMatch(/\.from\("research_(fulfillment_suppliers|supplier_offers)"/);
  });

  it("requires verified commercial inputs before an offer becomes active", () => {
    expect(source).toContain('input.state === "active"');
    expect(source).toContain("Active offer requires an ISO currency.");
    expect(source).toContain("Active offer requires an approved settlement amount.");
    expect(source).toContain("Agreement reference");
  });

  it("stores financial amounts only as bounded integer cents", () => {
    expect(source).toContain("Number.isSafeInteger(input.amountCents)");
    expect(source).toContain("Settlement amount must be non-negative integer cents.");
  });
});
