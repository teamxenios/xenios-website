import { describe, expect, it } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import { cartSelection, offering, variant } from "./test-fixtures";

describe("master offering action authority", () => {
  it("emits Add to Cart only for an exact Product Control binding and valid selection", () => {
    const product = offering();
    const presentation = product.variants[0];
    const selection = cartSelection();
    expect(resolveMasterOfferingAction(product, presentation, {
      binding: {
        offeringVariantId: presentation.id,
        productId: selection.productId,
        variantId: selection.variantId,
      },
      selection,
    })).toEqual({
      kind: "add_to_cart",
      label: "Add to Cart",
      productId: selection.productId,
      variantId: selection.variantId,
      // The selection's own SKU, echoed so the SKU-keyed cart can accept the
      // line the server authorized. Never derived from catalog data.
      sku: selection.sku,
      amount: { amountCents: 9900, currency: "USD" },
      evaluatedAt: selection.evaluatedAt,
    });
  });

  it("never emits Add to Cart for a provider-pathway row, however complete its commerce is", () => {
    // Care separation is a standing rule, not a flag-dependent one. This arm
    // used to check visibility and the binding only, and the purchase authority
    // behind it gates on Product Control facts, which carry no notion of the
    // care pathway. 244 of the 420 catalog variants are care_pathway, every one
    // of them bound to a Product Control identity with an active member price
    // and carrying the copy "Not available for direct purchase" — so all of
    // them would have offered Add to Cart the moment direct commerce was
    // enabled. It stayed invisible because the flag is off.
    const selection = cartSelection();
    const binding = (presentation: { id: string }) => ({
      offeringVariantId: presentation.id,
      productId: selection.productId,
      variantId: selection.variantId,
    });

    const careVariant = offering();
    const carePresentation = { ...careVariant.variants[0], displayState: "care_pathway" as const };
    expect(
      resolveMasterOfferingAction(careVariant, carePresentation, {
        binding: binding(carePresentation),
        selection,
      }).kind,
    ).not.toBe("add_to_cart");

    // The same, when it is the OFFERING that carries the pathway.
    const careOffering = { ...offering(), displayState: "care_pathway" as const };
    const presentation = careOffering.variants[0];
    expect(
      resolveMasterOfferingAction(careOffering, presentation, {
        binding: binding(presentation),
        selection,
      }).kind,
    ).not.toBe("add_to_cart");
  });

  it("keeps an Available Now planning row at Request Access when commerce is absent", () => {
    const product = offering();
    const action = resolveMasterOfferingAction(product, product.variants[0], {
      binding: null,
      selection: null,
    });
    expect(action.kind).toBe("request_access");
  });

  it("removing the Product Control binding immediately removes Add to Cart", () => {
    const product = offering();
    const presentation = product.variants[0];
    const selection = cartSelection();
    const bound = resolveMasterOfferingAction(product, presentation, {
      binding: {
        offeringVariantId: presentation.id,
        productId: selection.productId,
        variantId: selection.variantId,
      },
      selection,
    });
    const unbound = resolveMasterOfferingAction(product, presentation, {
      binding: null,
      selection,
    });
    expect(bound.kind).toBe("add_to_cart");
    expect(unbound.kind).toBe("request_access");
  });

  it("rejects mismatched identity, invalid amount, missing readiness, and ineligible inventory", () => {
    const product = offering();
    const presentation = product.variants[0];
    const base = cartSelection();
    const binding = {
      offeringVariantId: presentation.id,
      productId: base.productId,
      variantId: base.variantId,
    };
    const cases = [
      { ...base, productId: "other_product" },
      { ...base, price: { ...base.price, amountCents: 0 } },
      { ...base, canonicalReadiness: { ...base.canonicalReadiness, ready: false as true } },
      { ...base, inventoryEligibility: { ...base.inventoryEligibility, state: "unavailable" as "eligible" } },
    ];
    for (const selection of cases) {
      expect(resolveMasterOfferingAction(product, presentation, { binding, selection }).kind).not.toBe("add_to_cart");
    }
  });

  it("direct binding never bypasses exact current live product+variant activation", () => {
    const product = offering();
    const presentation = product.variants[0];
    const base = cartSelection();
    const binding = {
      offeringVariantId: presentation.id,
      productId: base.productId,
      variantId: base.variantId,
    };
    const resolve = (selection: unknown) =>
      resolveMasterOfferingAction(product, presentation, {
        binding,
        selection: selection as never,
      }).kind;

    const { activationAuthority: _missing, ...withoutAuthority } = base;
    expect(resolve(withoutAuthority)).not.toBe("add_to_cart");

    for (const state of [
      "held",
      "pending",
      "unavailable",
      "retired",
      "revoked",
      "stale",
      "ambiguous",
      "conflicting",
    ] as const) {
      expect(
        resolve({
          ...base,
          activationAuthority: {
            state,
            productId: base.productId,
            variantId: base.variantId,
            sku: base.sku,
          },
        }),
        state,
      ).not.toBe("add_to_cart");
    }

    const live = base.activationAuthority;
    expect(live?.state).toBe("live");
    if (live?.state !== "live") return;
    for (const activationAuthority of [
      { ...live, productId: "wrong-product" },
      { ...live, variantId: "wrong-variant" },
      { ...live, validThrough: base.evaluatedAt },
      { ...live, evaluatedAt: "2026-08-09T12:00:00.001Z" },
      { ...live, approvedByRole: "catalog_editor" as "founder" },
      { ...live, evidenceFingerprint: "sha256:not-a-digest" },
      { ...live, revokedAt: "2026-08-09T11:00:00.000Z" as unknown as null },
    ]) {
      expect(resolve({ ...base, activationAuthority })).not.toBe("add_to_cart");
    }
  });

  it("every non-live offering or variant state stays non-orderable despite perfect binding", () => {
    const selection = cartSelection();
    const nonLive = [
      "available_this_week",
      "request_access",
      "approval_required",
      "temporarily_unavailable",
      "coming_soon",
      "care_pathway",
      "planned",
      "unavailable",
    ] as const;
    for (const displayState of nonLive) {
      const product = offering({ variants: [variant({ displayState })] });
      const presentation = product.variants[0];
      const binding = {
        offeringVariantId: presentation.id,
        productId: selection.productId,
        variantId: selection.variantId,
      };
      expect(
        resolveMasterOfferingAction(product, presentation, { binding, selection }).kind,
        `variant:${displayState}`,
      ).not.toBe("add_to_cart");

      const nonLiveOffering = { ...offering(), displayState };
      const liveVariant = nonLiveOffering.variants[0];
      expect(
        resolveMasterOfferingAction(nonLiveOffering, liveVariant, {
          binding: { ...binding, offeringVariantId: liveVariant.id },
          selection,
        }).kind,
        `offering:${displayState}`,
      ).not.toBe("add_to_cart");
    }
  });

  it("resolves every noncommerce state to the closed customer action vocabulary", () => {
    const expectations = {
      available_now: "request_access",
      available_this_week: "notify_me",
      request_access: "request_access",
      approval_required: "apply",
      temporarily_unavailable: "notify_me",
      coming_soon: "join_waitlist",
      care_pathway: "explore_care",
      planned: "get_updates",
      unavailable: "none",
    } as const;
    for (const [displayState, kind] of Object.entries(expectations)) {
      const product = offering({ variants: [variant({ displayState: displayState as keyof typeof expectations })] });
      expect(resolveMasterOfferingAction(product, product.variants[0], {
        binding: null,
        selection: null,
      }).kind).toBe(kind);
    }
  });
});
