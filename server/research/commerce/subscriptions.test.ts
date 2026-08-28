import { describe, expect, it, vi } from "vitest";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { ProviderResult } from "@shared/research/capability";
import type { SubscriptionActionRequest } from "@shared/research/commerce-api";
import type { InventoryLot } from "../inventory/lots";
import {
  createInMemorySubscriptionRepository,
  createSubscriptionService,
  MAX_SUBSCRIPTION_QUANTITY,
  type CreateSubscriptionInput,
  type SubscriptionRecord,
  type SubscriptionRepository,
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
      return { ok: true, value: { status: "authorized" } };
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
    resolveRenewalPaymentReference: () => "pi_renewal_authority_1",
    isCurrentLiveActivation: () => true,
    purchaseExpansionPersistenceAvailable: true,
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

function persistedRecord(quantity: number): SubscriptionRecord {
  return {
    subscriptionId: "persisted-subscription",
    memberId: MEMBER,
    sku: "P001",
    quantity,
    frequencyDays: 30,
    state: "active",
    nextRenewalAt: "2026-08-19T00:00:00.000Z",
    nextShipmentAt: "2026-08-19T00:00:00.000Z",
    paymentProviderReference: "pm_ref_1",
    priceVersion: "2026-07",
    shippingAddressRef: "addr_1",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    cancelledAt: null,
    version: 1,
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

  it("accepts 1, 20, 21, 49, and 50 as ordinary subscription quantities", async () => {
    const d = deps();
    const service = createSubscriptionService(d);
    for (const quantity of [1, 20, 21, 49, MAX_SUBSCRIPTION_QUANTITY]) {
      const result = await service.create(MEMBER, createInput({ quantity }), NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.subscription.quantity).toBe(quantity);
      expect((await d.repository.get(result.subscription.subscriptionId))?.quantity).toBe(quantity);
    }
  });

  it("refuses a non-integer, zero, or over-ceiling quantity", async () => {
    const service = createSubscriptionService(deps());
    for (const quantity of [0, -1, 1.5, MAX_SUBSCRIPTION_QUANTITY + 1]) {
      const result = await service.create(MEMBER, createInput({ quantity }), NOW);
      expect(result).toMatchObject({ ok: false, code: "quantity_invalid" });
    }
  });

  it("accepts Q50 when stock and every non-quantity gate authorize it", async () => {
    const service = createSubscriptionService(deps({
      lots: [lot({ quantityAvailable: 50 })],
    }));
    const result = await service.create(MEMBER, createInput({ quantity: 50 }), NOW);
    expect(result).toMatchObject({ ok: true, subscription: { quantity: 50 } });
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
  it("quarantines invalid persisted quantities from list, mutation, and renewal", async () => {
    for (const quantity of [
      MAX_SUBSCRIPTION_QUANTITY + 1,
      1.5,
      0,
      -1,
      Number.NaN,
      "2" as unknown as number,
    ]) {
      const invalid = persistedRecord(quantity);
      const save = vi.fn<SubscriptionRepository["save"]>(async () => {});
      const appendEvent = vi.fn<SubscriptionRepository["appendEvent"]>(async () => {});
      const membership = vi.fn(async () => true);
      const agreement = vi.fn(async () => true);
      const payment = { retrieveStatus: vi.fn(usablePayment().retrieveStatus) };
      const repository: SubscriptionRepository = {
        replayTransition: async () => null,
        commitTransition: async () => ({ ok: false, code: "invalid_input" }),
        get: async () => ({ ...invalid }),
        save,
        listByMember: async () => [{ ...invalid }],
        appendEvent,
        listEvents: async () => [],
      };
      const service = createSubscriptionService(deps({
        repository,
        isMembershipActive: membership,
        hasEffectiveAgreement: agreement,
        payment,
      }));

      expect(await service.listForMember(MEMBER)).toEqual([]);
      expect(await service.apply(MEMBER, invalid.subscriptionId, { action: "pause" }, NOW))
        .toMatchObject({ ok: false, code: "subscription_not_found" });
      expect(await service.evaluateRenewal(invalid.subscriptionId, new Date(invalid.nextRenewalAt!)))
        .toMatchObject({ ok: false, refusals: ["subscription_not_found"] });
      expect(save).not.toHaveBeenCalled();
      expect(appendEvent).not.toHaveBeenCalled();
      expect(membership).not.toHaveBeenCalled();
      expect(agreement).not.toHaveBeenCalled();
      expect(payment.retrieveStatus).not.toHaveBeenCalled();
    }
  });

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
  it.each([
    ["resume", { action: "resume" }],
    ["quantity smuggled onto pause", { action: "pause", quantity: 3 }],
    ["frequency smuggled onto cancel", { action: "cancel", frequencyDays: 60 }],
    ["earlier reschedule", { action: "reschedule", rescheduleTo: "2026-08-01T00:00:00.000Z" }],
  ] as const)("refuses %s without currentness-bound persistence and appends nothing", async (_label, command) => {
    const repository = createInMemorySubscriptionRepository();
    const d = deps({ repository, purchaseExpansionPersistenceAvailable: true });
    const id = await activeSubscription(d);
    if (command.action === "resume") {
      expect((await createSubscriptionService(d).apply(MEMBER, id, { action: "pause" }, NOW)).ok).toBe(true);
    }
    const service = createSubscriptionService({
      ...d,
      purchaseExpansionPersistenceAvailable: false,
      isCurrentLiveActivation: () => false,
    });
    const before = await repository.get(id);
    const eventsBefore = await repository.listEvents(id);

    expect(await service.apply(MEMBER, id, command as SubscriptionActionRequest, NOW)).toMatchObject({
      ok: false,
      code: "capability_disabled",
    });
    expect(await repository.get(id)).toEqual(before);
    expect(await repository.listEvents(id)).toEqual(eventsBefore);
  });

  it("refuses a resume when exact product+variant authority was revoked", async () => {
    const repository = createInMemorySubscriptionRepository();
    const d = deps({ repository });
    const id = await activeSubscription(d);
    const service = createSubscriptionService({ ...d, isCurrentLiveActivation: () => false });
    expect((await service.apply(MEMBER, id, { action: "pause" }, NOW)).ok).toBe(true);
    const before = await repository.get(id);
    const eventsBefore = await repository.listEvents(id);

    expect(await service.apply(MEMBER, id, { action: "resume" }, NOW)).toMatchObject({
      ok: false,
      code: "product_not_purchasable",
    });
    expect(await repository.get(id)).toEqual(before);
    expect(await repository.listEvents(id)).toEqual(eventsBefore);
  });

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
      { action: "skip", quantity: MAX_SUBSCRIPTION_QUANTITY, frequencyDays: 60 },
      NOW,
    );
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.subscription.quantity).toBe(MAX_SUBSCRIPTION_QUANTITY);
    expect(skipped.subscription.frequencyDays).toBe(60);
    // The push uses the NEW frequency: +30d schedule plus 60 days.
    expect(skipped.subscription.nextChargeAt).toBe("2026-10-18T00:00:00.000Z");
  });

  it("refuses an invalid quantity or frequency without touching the record", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);

    for (const quantity of [0, MAX_SUBSCRIPTION_QUANTITY + 1]) {
      const badQuantity = await service.apply(MEMBER, id, { action: "skip", quantity }, NOW);
      expect(badQuantity).toMatchObject({ ok: false, code: "quantity_invalid" });
    }

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

  it("atomically replays concurrent and sequential identical member commands once", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    const command: SubscriptionActionRequest = {
      action: "pause",
      expectedVersion: 2,
      idempotencyKey: "subscription-pause-command-0001",
    };

    const [first, second] = await Promise.all([
      service.apply(MEMBER, id, command, NOW),
      service.apply(MEMBER, id, command, NOW),
    ]);
    expect(first).toMatchObject({ ok: true, subscription: { state: "paused", version: 3 } });
    expect(second).toEqual(first);
    expect(await service.apply(MEMBER, id, command, NOW)).toEqual(first);
    expect((await d.repository.listEvents(id)).map((entry) => entry.action))
      .toEqual(["activate", "pause"]);
  });

  it("distinguishes a stale command from same-key payload mismatch", async () => {
    const d = deps();
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    const key = "subscription-pause-command-0002";
    expect(await service.apply(MEMBER, id, {
      action: "pause",
      quantity: 20,
      expectedVersion: 2,
      idempotencyKey: key,
    }, NOW)).toMatchObject({ ok: true, subscription: { quantity: 20, version: 3 } });

    expect(await service.apply(MEMBER, id, {
      action: "pause",
      quantity: 21,
      expectedVersion: 2,
      idempotencyKey: key,
    }, NOW)).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(await service.apply(MEMBER, id, {
      action: "pause",
      quantity: 20,
      expectedVersion: 2,
      idempotencyKey: "subscription-pause-command-0003",
    }, NOW)).toMatchObject({ ok: false, code: "subscription_stale_version" });
    expect((await d.repository.listEvents(id)).map((entry) => entry.action))
      .toEqual(["activate", "pause"]);
  });

  it("leaves state and history untouched when the atomic commit fails", async () => {
    const inner = createInMemorySubscriptionRepository();
    let fail = false;
    const repository: SubscriptionRepository = {
      ...inner,
      async commitTransition(command) {
        if (fail) {
          fail = false;
          return { ok: false, code: "dependency_unavailable" };
        }
        return inner.commitTransition(command);
      },
    };
    const d = deps({ repository });
    const id = await activeSubscription(d);
    const service = createSubscriptionService(d);
    fail = true;
    const command: SubscriptionActionRequest = {
      action: "pause",
      expectedVersion: 2,
      idempotencyKey: "subscription-pause-command-0004",
    };
    expect(await service.apply(MEMBER, id, command, NOW))
      .toMatchObject({ ok: false, code: "subscription_action_invalid" });
    expect(await repository.get(id)).toMatchObject({ state: "active", version: 2 });
    expect((await repository.listEvents(id)).map((entry) => entry.action)).toEqual(["activate"]);
    expect(await service.apply(MEMBER, id, command, NOW))
      .toMatchObject({ ok: true, subscription: { state: "paused", version: 3 } });
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

  it("refuses renewal when exact product+variant authority is no longer current/live", async () => {
    const d = deps({ isCurrentLiveActivation: () => false });
    const id = await activeSubscription({ ...d, isCurrentLiveActivation: () => true });
    const service = createSubscriptionService(d);

    const decision = await service.evaluateRenewal(id, DUE);

    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.refusals).toContain("product_not_purchasable");
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

  it("resolves and probes the exact authoritative renewal payment reference", async () => {
    const resolved: Array<[string, string]> = [];
    const probed: string[] = [];
    const d = deps({
      resolveRenewalPaymentReference(subscriptionId, memberId) {
        resolved.push([subscriptionId, memberId]);
        return "pi_exact_renewal_authority";
      },
      payment: {
        async retrieveStatus(providerReference) {
          probed.push(providerReference);
          return { ok: true, value: { status: "authorized" } };
        },
      },
    });
    const id = await activeSubscription(d);

    const decision = await createSubscriptionService(d).evaluateRenewal(id, DUE);

    expect(decision.ok).toBe(true);
    expect(resolved).toEqual([[id, MEMBER]]);
    expect(probed).toEqual(["pi_exact_renewal_authority"]);
    expect(probed).not.toContain("pm_ref_1");
    expect(probed).not.toContain("");
  });

  it.each([null, "", " ", " pi_padded "])(
    "refuses an unavailable or malformed authoritative payment reference (%j) without probing",
    async (providerReference) => {
      let probes = 0;
      const d = deps({
        resolveRenewalPaymentReference: () => providerReference,
        payment: {
          async retrieveStatus() {
            probes += 1;
            return { ok: true, value: { status: "authorized" } };
          },
        },
      });
      const id = await activeSubscription(d);

      const decision = await createSubscriptionService(d).evaluateRenewal(id, DUE);

      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.refusals).toContain("payment_disabled");
      expect(probes).toBe(0);
    },
  );

  it.each(["DISABLED", "MISCONFIGURED", "REJECTED", "RETRYABLE", "PERMANENT_FAILURE"] as const)(
    "fails closed on provider failure %s",
    async (code) => {
      const d = deps({
        payment: {
          async retrieveStatus() {
            return { ok: false as const, code, message: "hostile provider failure", retryable: code === "RETRYABLE" };
          },
        },
      });
      const id = await activeSubscription(d);

      const decision = await createSubscriptionService(d).evaluateRenewal(id, DUE);

      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.refusals).toContain("payment_disabled");
    },
  );

  it.each(["captured", "pending", "processing", "cancelled", "usable", "accepted", "future_status"])(
    "fails closed on non-allowlisted provider status %s",
    async (status) => {
      const d = deps({
        payment: {
          async retrieveStatus() {
            return { ok: true as const, value: { status } };
          },
        },
      });
      const id = await activeSubscription(d);

      const decision = await createSubscriptionService(d).evaluateRenewal(id, DUE);

      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.refusals).toContain("payment_disabled");
    },
  );

  it("fails closed when renewal payment authority or the provider throws", async () => {
    const throwingOverrides: Partial<SubscriptionServiceDeps>[] = [
      {
        resolveRenewalPaymentReference: () => {
          throw new Error("authority unavailable");
        },
      },
      {
        payment: {
          async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
            throw new Error("provider unavailable");
          },
        },
      },
    ];
    for (const overrides of throwingOverrides) {
      const d = deps(overrides);
      const id = await activeSubscription(d);
      const decision = await createSubscriptionService(d).evaluateRenewal(id, DUE);
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.refusals).toContain("payment_disabled");
    }
  });

  it.each([null, "not-a-date"])(
    "refuses skip with missing or malformed stored schedule (%j) without a write",
    async (nextRenewalAt) => {
      const seeded = { ...persistedRecord(1), nextRenewalAt, nextShipmentAt: nextRenewalAt };
      const repository = createInMemorySubscriptionRepository([seeded]);
      const service = createSubscriptionService(deps({ repository }));
      const before = await repository.get(seeded.subscriptionId);
      const eventsBefore = await repository.listEvents(seeded.subscriptionId);

      const result = await service.apply(MEMBER, seeded.subscriptionId, { action: "skip" }, NOW);

      expect(result).toMatchObject({ ok: false, code: "subscription_action_invalid" });
      expect(await repository.get(seeded.subscriptionId)).toEqual(before);
      expect(await repository.listEvents(seeded.subscriptionId)).toEqual(eventsBefore);
    },
  );

  it("advances a deeply stale schedule from asOf so skip cannot remain immediately due", async () => {
    const seeded = {
      ...persistedRecord(1),
      nextRenewalAt: "2026-01-01T00:00:00.000Z",
      nextShipmentAt: "2026-01-01T00:00:00.000Z",
    };
    const repository = createInMemorySubscriptionRepository([seeded]);
    const service = createSubscriptionService(deps({ repository }));

    const result = await service.apply(MEMBER, seeded.subscriptionId, { action: "skip" }, NOW);

    expect(result).toMatchObject({
      ok: true,
      subscription: { nextChargeAt: "2026-08-19T00:00:00.000Z" },
    });
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
