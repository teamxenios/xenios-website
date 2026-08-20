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
