import { describe, expect, it } from "vitest";

import {
  SupabaseEarlyAccessAuditSink,
  SupabaseEarlyAccessReleaseLedger,
} from "./records";
import type { EarlyAccessPersistenceCall } from "./executor";

const validDraft = {
  releaseId: "rel-1",
  productId: "prod-1",
  variantId: "var-1",
  productVersion: "a".repeat(64),
  status: "approved",
  approvedPriceCents: 29900,
  currency: "USD",
  waivedBlockers: [],
  approvedQuantityLimit: 3,
  expiresAt: null,
  actor: "Samuel Boadu",
  reason: "Founder approved this unit for the private early access portal.",
  recordedAt: "2026-08-04T00:00:00.000Z",
};

describe("SupabaseEarlyAccessAuditSink", () => {
  it("passes the whole event through to the audit RPC", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const sink = new SupabaseEarlyAccessAuditSink(async (call) => {
      calls.push(call);
      return null;
    });
    const event = {
      event: "early_access.order.placed",
      orderNumber: "XEA-1",
      actor: "customer eac_x",
      at: "2026-08-04T00:00:00.000Z",
      detail: { payable: 29900 },
    };
    await sink.record(event);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("research_early_access_record_audit");
    expect(calls[0]?.args.p_event).toEqual(event);
  });
});

describe("SupabaseEarlyAccessReleaseLedger", () => {
  it("validates with the DOMAIN validator before any database call", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const ledger = new SupabaseEarlyAccessReleaseLedger(async (call) => {
      calls.push(call);
      return "appended";
    });
    const refused = await ledger.append({ ...validDraft, currency: "EUR" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("CURRENCY_UNSUPPORTED");
    // The invalid draft never reached the database.
    expect(calls).toHaveLength(0);
  });

  it("appends a valid draft and returns the validated release", async () => {
    const ledger = new SupabaseEarlyAccessReleaseLedger(async () => "appended");
    const appended = await ledger.append(validDraft);
    expect(appended.ok).toBe(true);
    if (appended.ok) {
      expect(appended.release.releaseId).toBe("rel-1");
      expect(appended.release.portal).toBe("private_early_access");
    }
  });

  it("maps the database duplicate answer onto DUPLICATE_RELEASE_ID", async () => {
    const ledger = new SupabaseEarlyAccessReleaseLedger(async () => "duplicate");
    const refused = await ledger.append(validDraft);
    expect(refused).toEqual({ ok: false, code: "DUPLICATE_RELEASE_ID" });
  });

  it("history and all return the stored records oldest first", async () => {
    const stored = [
      { ...validDraft, releaseId: "rel-1" },
      { ...validDraft, releaseId: "rel-2", status: "revoked" },
    ];
    const ledger = new SupabaseEarlyAccessReleaseLedger(async (call) => {
      if (call.fn === "research_early_access_releases_for_unit") {
        expect(call.args.p_product_id).toBe("prod-1");
        expect(call.args.p_variant_id).toBe("var-1");
        return stored;
      }
      if (call.fn === "research_early_access_releases_all") return stored;
      throw new Error(`unscripted: ${call.fn}`);
    });
    const history = await ledger.history("prod-1", "var-1");
    expect(history.map((entry) => entry.releaseId)).toEqual(["rel-1", "rel-2"]);
    const all = await ledger.all();
    expect(all).toHaveLength(2);
    expect(Object.isFrozen(all)).toBe(true);
  });
});
