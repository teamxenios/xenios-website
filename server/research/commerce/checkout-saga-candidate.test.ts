import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const candidatePath = resolve(
  process.cwd(),
  "supabase/candidates/20260828_research_commerce_checkout_atomic_saga.sql",
);
const attestationPath = resolve(
  process.cwd(),
  "supabase/candidates/20260828_research_commerce_checkout_atomic_saga.attestation.json",
);
const source = readFileSync(candidatePath, "utf8");
const attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as {
  status: string;
  baseCommit: string;
  candidate: { path: string; sha256: string };
  migrationDagEntry: boolean;
  productionLedgerEntry: boolean;
  optIn: { environmentVariable: string; requiredValue: string; default: string };
  postgresHarness: { imageId: string; result: string };
};

describe("unapplied checkout atomicity candidate", () => {
  it("is explicitly outside the migration DAG and pinned to the reviewed base", () => {
    expect(candidatePath.replaceAll("\\", "/")).toContain("/supabase/candidates/");
    expect(source).toContain("BASE ATTESTATION: ace92fd65ab46213aa5899a1591d4c565099fd0f");
    expect(source).toContain("STATUS: UNAPPLIED");
    expect(source).toContain("RESEARCH_CHECKOUT_ATOMIC_SAGA_ENABLED=true");
  });

  it("claims before the provider boundary and keeps complete/compensate atomic", () => {
    const begin = source.indexOf("create function public.research_checkout_command_begin_v1");
    const cartLock = source.indexOf("research-checkout-cart:", begin);
    const claim = source.indexOf("research_checkout_activation_intent_claim_v1", begin);
    const insert = source.indexOf("insert into public.research_checkout_commands", begin);
    expect(begin).toBeGreaterThan(-1);
    expect(cartLock).toBeGreaterThan(begin);
    expect(claim).toBeGreaterThan(cartLock);
    expect(claim).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(claim);
    expect(source).toContain("research_checkout_commands_cart_snapshot_unique");
    expect(source).toContain("research-checkout-cart:");
    expect(source).toContain("research_checkout_activation_intent_consume_v1");
    expect(source).toContain("research_finalize_inventory_reservations");
    expect(source).toContain("research_checkout_activation_intent_cancel_v1");
    expect(source).toContain("research_release_inventory_reservations");
    expect(source).toContain("research_checkout_store_credit_spend_guard_v1");
  });

  it("publishes only service-role RPCs and no client table mutation authority", () => {
    for (const table of [
      "research_checkout_commands",
      "research_checkout_credit_holds",
      "research_checkout_credit_spends",
      "research_checkout_command_events",
    ]) {
      expect(source).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
    }
    expect(source).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table[^;]+authenticated/i);
  });

  it("has a deterministic byte digest for the companion attestation", () => {
    expect(createHash("sha256").update(source, "utf8").digest("hex")).toBe(
      attestation.candidate.sha256,
    );
    expect(attestation).toMatchObject({
      status: "unapplied",
      baseCommit: "ace92fd65ab46213aa5899a1591d4c565099fd0f",
      candidate: {
        path: "supabase/candidates/20260828_research_commerce_checkout_atomic_saga.sql",
      },
      migrationDagEntry: false,
      productionLedgerEntry: false,
      optIn: {
        environmentVariable: "RESEARCH_CHECKOUT_ATOMIC_SAGA_ENABLED",
        requiredValue: "true",
        default: "off",
      },
      postgresHarness: {
        imageId: "sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20",
        result: "passed",
      },
    });
  });
});
