import { describe, expect, it } from "vitest";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { ProviderResult } from "@shared/research/capability";
import type { SubscriptionActionRequest } from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";
import {
  createInMemorySubscriptionRepository,
  createSubscriptionService,
  MAX_SUBSCRIPTION_QUANTITY,
  type CreateSubscriptionInput,
  type SubscriptionServiceDeps,
} from "./subscriptions";

const NOW = new Date("2026-07-20T00:00:00Z");
const MEMBER = "member-1";
const OTHER = "member-2";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "TEST-DOC" },
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const base: CatalogProduct = {
    sku: "P001",
    slug: "p001",
    displayName: "Product One",
    lane: "research_material",
    laneDecision: "decided",
    nameAliases: [],
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "mitch",
    facts: {
      composition: confirmed("composition on file"),
      strength: confirmed("strength on file"),
      format: confirmed("format on file"),
      priceCents: confirmed(9900),
      shelfLife: confirmed("shelf life on file"),
      storage: confirmed("storage on file"),
      coa: confirmed("coa on file"),
    },
    guideState: "guide_published",
    qualityDocumentState: "approved",
    storageDataState: "approved",
    shippingProfileState: "approved",
    goalMappings: [],
    relatedGuideSlugs: [],
    prohibitedClaims: [],
    subscriptionEligible: true,
    lastReviewed: "2026-07-01",
    openSupplierQuestions: [],
  };
  return { ...base, ...overrides };
}

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-1",
    sku: "P001",
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 10,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-01-01",
    retestDate: null,
    shelfLifeSource: "supplier_document",
    documents: {
      coaOnFile: true,
      identityConfirmed: true,
      purityConfirmed: true,
      sterilityConfirmed: true,
      endotoxinConfirmed: true,
    },
    excursion: "none",
    recalled: false,
    ...overrides,
  };
}

function usablePayment(): SubscriptionServiceDeps["payment"] {
  return {
    async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
      return { ok: true, value: { status: "usable" } };
    },
  };
}

function disabledPayment(): SubscriptionServiceDeps["payment"] {
  return {
    async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
      return { ok: false, code: "DISABLED", message: "payments are not enabled", retryable: false };
    },
  };
}

function deps(overrides: Partial<SubscriptionServiceDeps> = {}): SubscriptionServiceDeps {
  let seq = 0;
  const base: SubscriptionServiceDeps = {
    repository: createInMemorySubscriptionRepository(),
    catalog: new Map([["P001", product()]]),
    lots: [lot()],
    commerceEnabled: true,
    quantumCommerceEnabled: false,
    isMembershipActive: () => true,
    hasEffectiveAgreement: () => true,
    requiredAgreementKeys: ["research_use_only"],
    payment: usablePayment(),
    newId: () => `sub_${++seq}`,
  };
  return { ...base, ...overrides };
}

function createInput(overrides: Partial<CreateSubscriptionInput> = {}): CreateSubscriptionInput {
  return {
    sku: "P001",
    quantity: 2,
    frequencyDays: 30,
    paymentProviderReference: "pm_ref_1",
    priceVersion: "2026-07",
    shippingAddressRef: "addr_1",
    ...overrides,
  };
}

/** Creates and activates a subscription, returning its id. */
async function activeSubscription(d: SubscriptionServiceDeps): Promise<string> {
  const service = createSubscriptionService(d);
  const created = await service.create(MEMBER, createInput(), NOW);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("create failed in fixture");
  const activated = await service.activate(created.subscription.subscriptionId, "system", NOW);
  expect(activated.ok).toBe(true);
  return created.subscription.subscriptionId;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

describe("create", () => {
  it("records a pending subscription with the full field set", async () => {
    const d = deps();
    const service = createSubscriptionService(d);

    const result = await service.create(MEMBER, createInput(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subscription.state).toBe("pending");
    expect(result.subscription.sku).toBe("P001");
    expect(result.subscription.displayName).toBe("Product One");
    expect(result.subscription.frequencyDays).toBe(30);
    expect(result.subscription.quantity).toBe(2);
    expect(result.subscription.nextChargeAt).toBeNull();

    const stored = await d.repository.get(result.subscription.subscriptionId);
    expect(stored).not.toBeNull();
    expect(stored!.memberId).toBe(MEMBER);
    expect(stored!.paymentProviderReference).toBe("pm_ref_1");
    expect(stored!.priceVersion).toBe("2026-07");
    expect(stored!.shippingAddressRef).toBe("addr_1");
    expect(stored!.cancelledAt).toBeNull();
  });

  it("holds nullable references as null when they are not supplied", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    const result = await service.create(
      MEMBER,
      createInput({ paymentProviderReference: undefined, shippingAddressRef: undefined }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await d.repository.get(result.subscription.subscriptionId);
    expect(stored!.paymentProviderReference).toBeNull();
    expect(stored!.shippingAddressRef).toBeNull();
  });

  it("refuses an unknown SKU", async () => {
    const service = createSubscriptionService(deps());
    const result = await service.create(MEMBER, createInput({ sku: "NOPE" }), NOW);
    expect(result).toMatchObject({ ok: false, code: "product_not_found" });
  });

  it("refuses when product commerce is disabled", async () => {
    const service = createSubscriptionService(deps({ commerceEnabled: false }));
    const result = await service.create(MEMBER, createInput(), NOW);
    expect(result).toMatchObject({ ok: false, code: "commerce_disabled" });
  });

  it("refuses a non-integer, zero, or over-ceiling quantity", async () => {
    const service = createSubscriptionService(deps());
    for (const quantity of [0, -1, 1.5, MAX_SUBSCRIPTION_QUANTITY + 1]) {
      const result = await service.create(MEMBER, createInput({ quantity }), NOW);
      expect(result).toMatchObject({ ok: false, code: "quantity_invalid" });
    }
  });

  it("refuses a frequency outside 30, 60, 90", async () => {
    const service = createSubscriptionService(deps());
    const result = await service.create(
      MEMBER,
      createInput({ frequencyDays: 45 as unknown as 30 }),
      NOW,
    );
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });

  it("refuses a product that is not subscription eligible", async () => {
    const catalog = new Map([["P001", product({ subscriptionEligible: false })]]);
    const service = createSubscriptionService(deps({ catalog }));
    const result = await service.create(MEMBER, createInput(), NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

describe("ownership", () => {
  it("answers subscription_not_found for another member's subscription", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const result = await service.apply(OTHER, id, { action: "cancel" }, NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_not_found" });

    // And the record is untouched.
    const stored = await d.repository.get(id);
    expect(stored!.state).toBe("active");
  });

  it("lists only the member's own subscriptions", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    await service.create(MEMBER, createInput(), NOW);
    await service.create(OTHER, createInput(), NOW);

    const mine = await service.listForMember(MEMBER);
    expect(mine).toHaveLength(1);
    const theirs = await service.listForMember(OTHER);
    expect(theirs).toHaveLength(1);
    expect(mine[0].subscriptionId).not.toBe(theirs[0].subscriptionId);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

describe("activation", () => {
  it("moves pending to active with a schedule one frequency out", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    const created = await service.create(MEMBER, createInput(), NOW);
    if (!created.ok) throw new Error("create failed");

    const activated = await service.activate(created.subscription.subscriptionId, "system", NOW, "pm_live");
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.subscription.state).toBe("active");
    expect(activated.subscription.nextChargeAt).toBe("2026-08-19T00:00:00.000Z");
    expect(activated.subscription.nextShipmentAt).toBe("2026-08-19T00:00:00.000Z");

    const stored = await d.repository.get(created.subscription.subscriptionId);
    expect(stored!.paymentProviderReference).toBe("pm_live");
  });

  it("refuses activation by a member actor", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    const created = await service.create(MEMBER, createInput(), NOW);
    if (!created.ok) throw new Error("create failed");

    const result = await service.activate(created.subscription.subscriptionId, "member", NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });
});

describe("member actions", () => {
  it("pauses an active subscription and resumes it with a fresh schedule", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const paused = await service.apply(MEMBER, id, { action: "pause" }, NOW);
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.subscription.state).toBe("paused");

    const later = new Date("2026-10-01T00:00:00Z");
    const resumed = await service.apply(MEMBER, id, { action: "resume" }, later);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.subscription.state).toBe("active");
    // The old schedule had passed, so it is recomputed one frequency from now.
    expect(resumed.subscription.nextChargeAt).toBe("2026-10-31T00:00:00.000Z");
  });

  it("keeps a still-future schedule on resume rather than recomputing it", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    await service.apply(MEMBER, id, { action: "pause" }, NOW);

    const beforeRenewal = new Date("2026-07-25T00:00:00Z");
    const resumed = await service.apply(MEMBER, id, { action: "resume" }, beforeRenewal);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.subscription.nextChargeAt).toBe("2026-08-19T00:00:00.000Z");
  });

  it("skips one cycle by pushing the renewal exactly one frequency", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const skipped = await service.apply(MEMBER, id, { action: "skip" }, NOW);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.subscription.state).toBe("skip_scheduled");
    // Activated at NOW put the renewal at +30d; the skip pushes it to +60d.
    expect(skipped.subscription.nextChargeAt).toBe("2026-09-18T00:00:00.000Z");
  });

  it("reschedules to an explicit future date", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const target = "2026-09-01T00:00:00.000Z";
    const rescheduled = await service.apply(
      MEMBER,
      id,
      { action: "reschedule", rescheduleTo: target },
      NOW,
    );
    expect(rescheduled.ok).toBe(true);
    if (!rescheduled.ok) return;
    expect(rescheduled.subscription.state).toBe("rescheduled");
    expect(rescheduled.subscription.nextChargeAt).toBe(target);
  });

  it("refuses a reschedule with a missing, invalid, or past target", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    for (const rescheduleTo of [undefined, "not-a-date", "2026-01-01T00:00:00Z"]) {
      const result = await service.apply(MEMBER, id, { action: "reschedule", rescheduleTo }, NOW);
      expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
    }
  });

  it("cancels with schedule cleared and the cancellation instant recorded", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const cancelled = await service.apply(MEMBER, id, { action: "cancel" }, NOW);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.subscription.state).toBe("cancelled");
    expect(cancelled.subscription.nextChargeAt).toBeNull();
    expect(cancelled.subscription.nextShipmentAt).toBeNull();

    const stored = await d.repository.get(id);
    expect(stored!.cancelledAt).toBe(NOW.toISOString());
  });

  it("refuses any action on a cancelled subscription (terminal state)", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    await service.apply(MEMBER, id, { action: "cancel" }, NOW);

    const result = await service.apply(MEMBER, id, { action: "resume" }, NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });

  it("refuses an unknown action string from the wire", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const req = { action: "upgrade" } as unknown as SubscriptionActionRequest;
    const result = await service.apply(MEMBER, id, req, NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });

  it("refuses an illegal transition (skip while paused)", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    await service.apply(MEMBER, id, { action: "pause" }, NOW);

    const result = await service.apply(MEMBER, id, { action: "skip" }, NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });

  it("applies a valid quantity and frequency update alongside an action", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const skipped = await service.apply(
      MEMBER,
      id,
      { action: "skip", quantity: 3, frequencyDays: 60 },
      NOW,
    );
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.subscription.quantity).toBe(3);
    expect(skipped.subscription.frequencyDays).toBe(60);
    // The push uses the NEW frequency: +30d schedule plus 60 days.
    expect(skipped.subscription.nextChargeAt).toBe("2026-10-18T00:00:00.000Z");
  });

  it("refuses an invalid quantity or frequency without touching the record", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const badQuantity = await service.apply(MEMBER, id, { action: "skip", quantity: 0 }, NOW);
    expect(badQuantity).toMatchObject({ ok: false, code: "quantity_invalid" });

    const badFrequency = await service.apply(
      MEMBER,
      id,
      { action: "skip", frequencyDays: 45 as unknown as 30 },
      NOW,
    );
    expect(badFrequency).toMatchObject({ ok: false, code: "subscription_action_invalid" });

    const stored = await d.repository.get(id);
    expect(stored!.state).toBe("active");
    expect(stored!.quantity).toBe(2);
  });
});

describe("payment failure and retry", () => {
  it("moves active into the payment_issue retry state and back", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const failed = await service.recordPaymentFailure(id, "provider_webhook", NOW);
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.subscription.state).toBe("payment_issue");

    const later = new Date("2026-09-01T00:00:00Z");
    const resolved = await service.resolvePaymentIssue(id, "system", later);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.subscription.state).toBe("active");
    expect(resolved.subscription.nextChargeAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("refuses a payment failure reported by a member actor", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    const result = await service.recordPaymentFailure(id, "member", NOW);
    expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
  });
});

// ---------------------------------------------------------------------------
// The append-only event trail
// ---------------------------------------------------------------------------

describe("state events", () => {
  it("appends one event per applied change and never rewrites history", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    await service.apply(MEMBER, id, { action: "pause" }, NOW);
    await service.apply(MEMBER, id, { action: "resume" }, new Date("2026-07-21T00:00:00Z"));
    await service.apply(MEMBER, id, { action: "cancel" }, new Date("2026-07-22T00:00:00Z"));

    const events = await d.repository.listEvents(id);
    expect(events.map((e) => e.action)).toEqual(["activate", "pause", "resume", "cancel"]);
    expect(events.map((e) => [e.fromState, e.toState])).toEqual([
      ["pending", "active"],
      ["active", "paused"],
      ["paused", "active"],
      ["active", "cancelled"],
    ]);
    expect(events[0].actorType).toBe("system");
    expect(events[1].actorType).toBe("member");
  });

  it("appends nothing for a refused action", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    const before = (await d.repository.listEvents(id)).length;

    await service.apply(MEMBER, id, { action: "resume" }, NOW); // illegal from active
    await service.apply(OTHER, id, { action: "cancel" }, NOW); // wrong owner

    expect(await d.repository.listEvents(id)).toHaveLength(before);
  });
});

// ---------------------------------------------------------------------------
// The renewal gate. Every refusal, one by one, then together.
// ---------------------------------------------------------------------------

describe("evaluateRenewal", () => {
  // activeSubscription activates at NOW with a 30-day frequency, so the
  // schedule falls due exactly here. Gates that expect an ok decision must
  // evaluate at (or after) the due instant; the refusal tests evaluate at NOW,
  // where renewal_not_due simply joins the accumulated refusals.
  const DUE = new Date("2026-08-19T00:00:00Z");

  it("passes a clean active subscription whose renewal is due", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const decision = await service.evaluateRenewal(id, DUE);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.subscription.subscriptionId).toBe(id);
  });

  it("refuses a renewal that is not due yet, so the same cycle cannot be approved early or twice", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    // One day before the schedule: refused outright.
    const early = await service.evaluateRenewal(id, new Date("2026-08-18T00:00:00Z"));
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.refusals).toEqual(["renewal_not_due"]);

    // At the due instant: approved.
    expect((await service.evaluateRenewal(id, DUE)).ok).toBe(true);
  });

  it("refuses an unknown subscription", async () => {
    const service = createSubscriptionService(deps());
    const decision = await service.evaluateRenewal("missing", NOW);
    expect(decision).toMatchObject({ ok: false, refusals: ["subscription_not_found"] });
  });

  it("refuses a subscription that is not active", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    await service.apply(MEMBER, id, { action: "pause" }, NOW);

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("subscription_action_invalid");
  });

  it("refuses when the membership is inactive", async () => {
    const d = deps({ isMembershipActive: () => false });
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("membership_inactive");
  });

  it("refuses when the commerce flag is off", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    // The flag turns off after activation, as a deactivation would in production.
    const service = createSubscriptionService({ ...d, commerceEnabled: false });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("commerce_disabled");
  });

  it("refuses when the SKU has left the catalog", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService({ ...d, catalog: new Map() });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("product_not_found");
  });

  it("refuses when the SKU is no longer purchase eligible", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const revoked = new Map([
      ["P001", product({ commerceApproval: "blocked_pending_written_approval" })],
    ]);
    const service = createSubscriptionService({ ...d, catalog: revoked });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("product_not_purchasable");
  });

  it("refuses when the SKU is no longer subscription eligible", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const revoked = new Map([["P001", product({ subscriptionEligible: false })]]);
    const service = createSubscriptionService({ ...d, catalog: revoked });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("subscription_action_invalid");
  });

  it("refuses when no allocatable lot can cover the quantity", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService({ ...d, lots: [] });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("insufficient_stock");
  });

  it("names the missing COA when the only lot lacks one", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const noCoa = lot({ documents: { ...lot().documents, coaOnFile: false } });
    const service = createSubscriptionService({ ...d, lots: [noCoa] });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("insufficient_stock");
    expect(decision.refusals).toContain("coa_missing");
  });

  it("names the expired lot when the only lot has expired", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const expired = lot({ expiryDate: "2026-07-01" });
    const service = createSubscriptionService({ ...d, lots: [expired] });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("insufficient_stock");
    expect(decision.refusals).toContain("lot_expired");
  });

  it("names the recalled lot when the only lot is recalled", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const recalled = lot({ recalled: true });
    const service = createSubscriptionService({ ...d, lots: [recalled] });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("insufficient_stock");
    expect(decision.refusals).toContain("lot_recalled");
  });

  it("does not surface lot refusals while a clean lot can cover the quantity", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const bad = lot({ lotId: "LOT-BAD", recalled: true });
    const service = createSubscriptionService({ ...d, lots: [lot(), bad] });

    const decision = await service.evaluateRenewal(id, DUE);
    expect(decision.ok).toBe(true);
  });

  it("refuses when the payment provider is unavailable", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService({ ...d, payment: disabledPayment() });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("payment_disabled");
  });

  it("refuses when a required agreement is not effective", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService({ ...d, hasEffectiveAgreement: () => false });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toContain("agreement_required");
  });

  it("accumulates every refusal rather than stopping at the first", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService({
      ...d,
      commerceEnabled: false,
      lots: [],
      payment: disabledPayment(),
      isMembershipActive: () => false,
      hasEffectiveAgreement: () => false,
    });

    const decision = await service.evaluateRenewal(id, NOW);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.refusals).toEqual(
      expect.arrayContaining([
        "membership_inactive",
        "commerce_disabled",
        "insufficient_stock",
        "payment_disabled",
        "agreement_required",
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// In-memory repository behavior
// ---------------------------------------------------------------------------

describe("createInMemorySubscriptionRepository", () => {
  it("does not let a caller mutate stored state through a returned reference", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    const created = await service.create(MEMBER, createInput(), NOW);
    if (!created.ok) throw new Error("create failed");

    const loaded = await d.repository.get(created.subscription.subscriptionId);
    loaded!.quantity = 999;
    const reloaded = await d.repository.get(created.subscription.subscriptionId);
    expect(reloaded!.quantity).toBe(2);
  });
});
