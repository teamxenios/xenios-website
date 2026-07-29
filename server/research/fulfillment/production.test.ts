import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "production.ts"), "utf8");

describe("production fulfillment persistence boundary", () => {
  it("uses reviewed command RPCs for every mutation", () => {
    expect(source).toContain('.rpc("research_fulfillment_assign"');
    expect(source).toContain('.rpc("research_fulfillment_transition"');
    expect(source).not.toContain('.rpc("research_fulfillment_prepare_order"');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it("reauthorizes supplier PII reads inside the reviewed fixed-path RPC", () => {
    expect(source).toContain('"research_fulfillment_list_assignments"');
    expect(source).toContain("p_actor_auth_user_id: query.actor.actorId");
    expect(source).toContain("p_supplier_scope_id:");
    expect(source).not.toMatch(/\.from\("research_fulfillment_/);
  });

  it("constructs the minimum-necessary projection explicitly", () => {
    expect(source).not.toContain("member_email");
    expect(source).not.toContain("assessment");
    expect(source).not.toContain("health");
    expect(source).not.toMatch(/return\s+\{\s*\.\.\.row/);
  });

  it("returns a truthful paid-order dependency instead of fake assignment state", () => {
    expect(source).toContain("fulfillmentOrderId: null");
    expect(source).toContain("ready: false");
    expect(source).toContain('reason: "PAID_ORDER_BOUNDARY_REQUIRED"');
  });
});
