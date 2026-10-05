import { describe, expect, it, vi } from "vitest";
import type { CreateSubscriptionRequest } from "../../../client/src/research/adapters/commerce";
import type { CatalogProduct, ProvenancedFact } from "@shared/research/catalog";
import type { SubscriptionActionRequest } from "@shared/research/commerce-api";
import {
  createInMemorySubscriptionRepository,
  createSubscriptionService,
  MAX_SUBSCRIPTION_QUANTITY,
  type CreateSubscriptionInput,
  type SubscriptionServiceDeps,
} from "./subscriptions";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const MEMBER = "synthetic-customer";
const OTHER_MEMBER = "other-synthetic-customer";
const SUBSCRIPTION = "synthetic-product-subscription";

function confirmed<T>(value: T): ProvenancedFact<T> {
  return {
    value,
    confirmation: "confirmed",
    source: { kind: "supplier_document", reference: "SYNTHETIC-ONLY" },
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    sku: "SYNTHETIC-VARIANT-1",
    slug: "synthetic-product",
    displayName: "Synthetic product variant",
    lane: "research_material",
    laneDecision: "decided",
    nameAliases: [],
    availability: "in_stock",
    commerceApproval: "approved",
    fulfillmentOwner: "mitch",
    facts: {
      composition: confirmed("Synthetic composition"),
      strength: confirmed("Synthetic strength"),
      format: confirmed("Synthetic format"),
      priceCents: confirmed(1234),
      shelfLife: confirmed("Synthetic shelf life"),
      storage: confirmed("Synthetic storage"),
      coa: confirmed("Synthetic document"),
    },
    guideState: "guide_published",
    qualityDocumentState: "approved",
    storageDataState: "approved",
    shippingProfileState: "approved",
    goalMappings: [],
    relatedGuideSlugs: [],
    prohibitedClaims: [],
    subscriptionEligible: true,
    lastReviewed: "2026-10-05",
    openSupplierQuestions: [],
    ...overrides,
  };
}

// The browser contract carries the exact SKU and observed version, never a
// payment authorization or an active state. These values are synthetic only.
const REQUEST = {
  sku: "SYNTHETIC-VARIANT-1",
  quantity: 2,
  frequencyDays: 60,
  priceVersion: "synthetic-price-version-1",
} satisfies CreateSubscriptionRequest;

function fixture(overrides: Partial<SubscriptionServiceDeps> = {}) {
  const repository = createInMemorySubscriptionRepository();
  const save = vi.spyOn(repository, "save");
  const commitTransition = vi.spyOn(repository, "commitTransition");
  const retrieveStatus = vi.fn(async () => ({
    ok: false as const,
    code: "DISABLED" as const,
    message: "Synthetic test has no payment provider.",
    retryable: false,
  }));
  const isCurrentLiveActivation = vi.fn(() => true);
  const deps: SubscriptionServiceDeps = {
    repository,
    catalog: new Map([[REQUEST.sku, product()]]),
    lots: [],
    commerceEnabled: true,
    quantumCommerceEnabled: false,
    isMembershipActive: () => true,
    hasEffectiveAgreement: () => true,
    requiredAgreementKeys: ["research_use_only"],
    payment: { retrieveStatus },
    resolveRenewalPaymentReference: () => null,
    isCurrentLiveActivation,
    // Deliberately omitted: production's unavailable durable persistence seam.
    newId: () => SUBSCRIPTION,
    ...overrides,
  };
  return {
    deps, repository, save, commitTransition, retrieveStatus,
    isCurrentLiveActivation,
    service: createSubscriptionService(deps),
  };
}

describe("synthetic product subscription intent boundary", () => {
  it.each([undefined, false])(
    "refuses otherwise valid browser requests when durable persistence is %s",
    async (purchaseExpansionPersistenceAvailable) => {
      const f = fixture({ purchaseExpansionPersistenceAvailable });
      for (const frequencyDays of [30, 60, 90] as const) {
        for (const quantity of [1, MAX_SUBSCRIPTION_QUANTITY]) {
          expect(await f.service.create(MEMBER, { ...REQUEST, quantity, frequencyDays }, NOW))
            .toMatchObject({ ok: false, code: "capability_disabled" });
        }
      }
      expect(f.save).not.toHaveBeenCalled();
      expect(f.commitTransition).not.toHaveBeenCalled();
      expect(await f.service.listForMember(MEMBER)).toEqual([]);
      expect(f.retrieveStatus).not.toHaveBeenCalled();
    },
  );

  it("keeps a test-only accepted intent pending through attempted customer activation and renewal", async () => {
    const f = fixture({ purchaseExpansionPersistenceAvailable: true });
    const created = await f.service.create(MEMBER, REQUEST, NOW);
    expect(created).toEqual({
      ok: true,
      subscription: {
        subscriptionId: SUBSCRIPTION,
        version: 1,
        sku: REQUEST.sku,
        displayName: "Synthetic product variant",
        state: "pending",
        frequencyDays: REQUEST.frequencyDays,
        quantity: REQUEST.quantity,
        nextChargeAt: null,
        nextShipmentAt: null,
      },
    });
    expect(f.isCurrentLiveActivation).toHaveBeenCalledWith(REQUEST.sku, NOW);
    const stored = await f.repository.get(SUBSCRIPTION);
    expect(stored).toMatchObject({
      memberId: MEMBER,
      priceVersion: REQUEST.priceVersion,
      state: "pending",
      paymentProviderReference: null,
      shippingAddressRef: null,
      nextRenewalAt: null,
      nextShipmentAt: null,
    });

    expect(await f.service.apply(MEMBER, SUBSCRIPTION, {
      action: "activate",
    } as unknown as SubscriptionActionRequest, NOW))
      .toMatchObject({ ok: false, code: "subscription_action_invalid" });
    expect(await f.service.activate(SUBSCRIPTION, "member", NOW, "fabricated-browser-reference"))
      .toMatchObject({ ok: false, code: "subscription_action_invalid" });
    expect(await f.service.evaluateRenewal(SUBSCRIPTION, NOW)).toMatchObject({
      ok: false,
      refusals: expect.arrayContaining([
        "subscription_action_invalid", "renewal_not_due", "payment_disabled",
      ]),
    });
    expect(await f.repository.get(SUBSCRIPTION)).toEqual(stored);
    expect(await f.repository.listEvents(SUBSCRIPTION)).toEqual([]);
    expect(f.commitTransition).not.toHaveBeenCalled();
    expect(f.retrieveStatus).not.toHaveBeenCalled();
  });

  it("preserves a prior pending intent when persistence is unavailable and refuses fabricated references", async () => {
    const f = fixture({ purchaseExpansionPersistenceAvailable: true });
    await f.service.create(MEMBER, REQUEST, NOW);
    const stored = await f.repository.get(SUBSCRIPTION);
    const unavailable = createSubscriptionService({
      ...f.deps,
      purchaseExpansionPersistenceAvailable: undefined,
    });
    expect(await unavailable.create(MEMBER, {
      ...REQUEST, paymentProviderReference: "fabricated-browser-reference",
    }, NOW)).toMatchObject({ ok: false, code: "capability_disabled" });
    expect(await unavailable.activate(SUBSCRIPTION, "system", NOW, "fabricated-browser-reference"))
      .toMatchObject({ ok: false, code: "capability_disabled" });
    expect(await unavailable.listForMember(MEMBER)).toMatchObject([{ state: "pending" }]);
    expect(await f.repository.get(SUBSCRIPTION)).toEqual(stored);
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.commitTransition).not.toHaveBeenCalled();
    expect(f.retrieveStatus).not.toHaveBeenCalled();
  });

  it("isolates the pending intent from another member while allowing its owner to cancel", async () => {
    const f = fixture({ purchaseExpansionPersistenceAvailable: true });
    await f.service.create(MEMBER, REQUEST, NOW);
    const stored = await f.repository.get(SUBSCRIPTION);
    expect(await f.service.listForMember(OTHER_MEMBER)).toEqual([]);
    expect(await f.service.apply(OTHER_MEMBER, SUBSCRIPTION, { action: "cancel" }, NOW))
      .toMatchObject({ ok: false, code: "subscription_not_found" });
    expect(await f.repository.get(SUBSCRIPTION)).toEqual(stored);
    expect(f.commitTransition).not.toHaveBeenCalled();

    const unavailable = createSubscriptionService({
      ...f.deps, purchaseExpansionPersistenceAvailable: false,
    });
    expect(await unavailable.apply(MEMBER, SUBSCRIPTION, { action: "cancel" }, NOW))
      .toMatchObject({ ok: true, subscription: {
        state: "cancelled", nextChargeAt: null, nextShipmentAt: null,
      } });
    expect(await f.repository.listEvents(SUBSCRIPTION)).toMatchObject([
      { action: "cancel", actorType: "member", fromState: "pending", toState: "cancelled" },
    ]);
    expect(f.retrieveStatus).not.toHaveBeenCalled();
  });

  it.each([
    { name: "commerce disabled", overrides: { commerceEnabled: false }, code: "commerce_disabled" },
    { name: "exact activation no longer live", overrides: { isCurrentLiveActivation: () => false }, code: "product_not_purchasable" },
    { name: "subscription ineligible", overrides: { catalog: new Map([[REQUEST.sku, product({ subscriptionEligible: false })]]) }, code: "subscription_action_invalid" },
  ])("refuses $name before saving an intent", async ({ overrides, code }) => {
    const f = fixture({ purchaseExpansionPersistenceAvailable: true, ...overrides });
    expect(await f.service.create(MEMBER, REQUEST, NOW)).toMatchObject({ ok: false, code });
    expect(f.save).not.toHaveBeenCalled();
    expect(f.retrieveStatus).not.toHaveBeenCalled();
  });

  it.each([
    { quantity: 0, frequencyDays: 30, code: "quantity_invalid" },
    { quantity: MAX_SUBSCRIPTION_QUANTITY + 1, frequencyDays: 30, code: "quantity_invalid" },
    { quantity: 1.5, frequencyDays: 30, code: "quantity_invalid" },
    { quantity: 1, frequencyDays: 45, code: "subscription_action_invalid" },
  ])("refuses quantity $quantity / frequency $frequencyDays without saving", async ({ quantity, frequencyDays, code }) => {
    const f = fixture({ purchaseExpansionPersistenceAvailable: true });
    const input = { ...REQUEST, quantity, frequencyDays } as CreateSubscriptionInput;
    expect(await f.service.create(MEMBER, input, NOW)).toMatchObject({ ok: false, code });
    expect(f.save).not.toHaveBeenCalled();
    expect(f.retrieveStatus).not.toHaveBeenCalled();
  });
});
