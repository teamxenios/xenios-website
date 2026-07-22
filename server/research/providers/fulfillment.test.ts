import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledMitchProvider,
  MITCH_ALLOWED_PAYLOAD_KEYS,
  MitchFulfillmentProvider,
  TestMitchProvider,
  buildMitchPayload,
  resolveFulfillmentProvider,
  type InternalFulfillmentRequest,
} from "./fulfillment";

/**
 * A request deliberately loaded with internal data that must never cross the
 * boundary. Every sensitive field carries a distinctive marker string so a leak is
 * detectable by scanning the serialized payload.
 */
function loadedRequest(overrides: Partial<InternalFulfillmentRequest> = {}): InternalFulfillmentRequest {
  return {
    fulfillmentOrderId: "FF-1",
    memberId: "MEMBER-SECRET-ID",
    recipientName: "A Member",
    shippingAddress: {
      line1: "1 Example Street",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
      country: "US",
    },
    recipientPhone: "+15555550123",
    carrierRequiresPhone: false,
    shippingService: "standard",
    handlingProfile: "ambient",
    lines: [{ sku: "P001", quantity: 1 }],

    memberHealthGoals: ["LEAK-HEALTH-GOAL"],
    assessmentSummary: "LEAK-ASSESSMENT",
    blueprintReference: "LEAK-BLUEPRINT",
    trackerSummary: "LEAK-TRACKER",
    referralCode: "LEAK-REFERRAL",
    previousOrderIds: ["LEAK-PRIOR-ORDER"],
    internalNotes: "LEAK-NOTES",
    ...overrides,
  };
}

describe("Mitch payload data minimization", () => {
  it("emits only the allowlisted keys", () => {
    const payload = buildMitchPayload(loadedRequest());
    expect(Object.keys(payload).sort()).toEqual(
      MITCH_ALLOWED_PAYLOAD_KEYS.filter((k) => k !== "recipientPhone").slice().sort(),
    );
  });

  // The load-bearing privacy test.
  it("never transmits health, assessment, Blueprint, tracker, referral, or order history", () => {
    const serialized = JSON.stringify(buildMitchPayload(loadedRequest()));
    for (const marker of [
      "LEAK-HEALTH-GOAL",
      "LEAK-ASSESSMENT",
      "LEAK-BLUEPRINT",
      "LEAK-TRACKER",
      "LEAK-REFERRAL",
      "LEAK-PRIOR-ORDER",
      "LEAK-NOTES",
      "MEMBER-SECRET-ID",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("does not leak a field added upstream later", () => {
    // Simulates a future developer adding a sensitive field to the internal type.
    const withFutureField = {
      ...loadedRequest(),
      futureSensitiveField: "LEAK-FUTURE",
    } as InternalFulfillmentRequest;
    const serialized = JSON.stringify(buildMitchPayload(withFutureField));
    expect(serialized).not.toContain("LEAK-FUTURE");
  });

  it("withholds the phone number unless the carrier requires it", () => {
    const withheld = buildMitchPayload(loadedRequest({ carrierRequiresPhone: false }));
    expect(withheld.recipientPhone).toBeUndefined();

    const included = buildMitchPayload(loadedRequest({ carrierRequiresPhone: true }));
    expect(included.recipientPhone).toBe("+15555550123");
  });

  it("omits the phone entirely when none is held, even if the carrier requires one", () => {
    const payload = buildMitchPayload(loadedRequest({ carrierRequiresPhone: true, recipientPhone: undefined }));
    expect(payload.recipientPhone).toBeUndefined();
  });

  it("carries the shipping fields the partner genuinely needs", () => {
    const payload = buildMitchPayload(loadedRequest());
    expect(payload.fulfillmentOrderId).toBe("FF-1");
    expect(payload.shippingAddress.city).toBe("Houston");
    expect(payload.lines).toEqual([{ sku: "P001", quantity: 1 }]);
  });

  it("includes line2 only when present", () => {
    expect(buildMitchPayload(loadedRequest()).shippingAddress.line2).toBeUndefined();
    const withLine2 = loadedRequest();
    withLine2.shippingAddress.line2 = "Apt 4";
    expect(buildMitchPayload(withLine2).shippingAddress.line2).toBe("Apt 4");
  });
});

describe("DisabledMitchProvider", () => {
  it("refuses every operation without throwing", async () => {
    const p = new DisabledMitchProvider();
    for (const r of [await p.submit(), await p.fetchStatus(), await p.verifyInboundWebhook()]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("DISABLED");
    }
  });
});

describe("TestMitchProvider", () => {
  it("submits a valid order and records the minimized payload", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest());
    expect(r.ok).toBe(true);
    expect(p.submitted).toHaveLength(1);
    expect(JSON.stringify(p.submitted[0])).not.toContain("LEAK-BLUEPRINT");
  });

  it("rejects an empty order", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest({ lines: [] }));
    expect(r.ok).toBe(false);
  });

  // Storage handling is a safety decision, not a default.
  it("refuses to ship when the handling profile is not confirmed", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest({ handlingProfile: "not_confirmed" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("not confirmed");
    expect(p.submitted).toHaveLength(0);
  });

  it("rejects an inbound webhook with a bad signature or malformed body", async () => {
    const p = new TestMitchProvider();
    const body = JSON.stringify({ fulfillmentOrderId: "FF-1", status: "shipped" });
    expect((await p.verifyInboundWebhook(body, undefined)).ok).toBe(false);
    expect((await p.verifyInboundWebhook("{bad", "test-signature")).ok).toBe(false);
  });

  it("accepts a well formed signed status update", async () => {
    const p = new TestMitchProvider();
    const body = JSON.stringify({ fulfillmentOrderId: "FF-1", status: "shipped", trackingNumber: "T1" });
    const r = await p.verifyInboundWebhook(body, "test-signature");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.trackingNumber).toBe("T1");
  });
});

describe("MitchFulfillmentProvider shell", () => {
  it("refuses rather than faking a submission", async () => {
    const r = await new MitchFulfillmentProvider().submit();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("declares credential names only, never values", () => {
    expect(MitchFulfillmentProvider.requiredEnvironmentVariables).toContain("MITCH_API_KEY");
  });

  it("defaults to the manual export transport", () => {
    expect(new MitchFulfillmentProvider().transportMode).toBe("manual_export");
  });
});

describe("resolveFulfillmentProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("defaults to disabled", () => {
    expect(resolveFulfillmentProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when the flag is off even if a provider is named", () => {
    expect(resolveFulfillmentProvider({ MITCH_PROVIDER: "mitch" } as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("refuses the test provider in production", () => {
    const p = resolveFulfillmentProvider({
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the real adapter with the configured transport mode", () => {
    const p = resolveFulfillmentProvider({
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "mitch",
      MITCH_TRANSPORT_MODE: "sftp",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("mitch");
    expect(p.transportMode).toBe("sftp");
  });
});

describe("TestMitchProvider production guard", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("refuses to construct in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new TestMitchProvider()).toThrow(/not available in production/);
  });
});
