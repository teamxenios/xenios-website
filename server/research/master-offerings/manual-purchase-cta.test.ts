import { describe, expect, it } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import {
  demandIntentForAction,
  toExistingMasterOfferingProductRequest,
} from "./product-request-adapter";
import { cartSelection, offering, variant } from "./test-fixtures";
import {
  MASTER_OFFERINGS_MANUAL_PURCHASE_ENV_VAR,
  masterOfferingsManualPurchaseRequests,
} from "./visibility-policy";

const NO_COMMERCE = { binding: null, selection: null };
const ON = { manualEarlyAccessPurchase: true };

describe("manual Early Access purchase CTA", () => {
  it("stays off unless the capability is switched on", () => {
    const action = resolveMasterOfferingAction(
      offering(),
      variant({ displayState: "available_now" }),
      NO_COMMERCE,
    );
    expect(action.kind).toBe("request_access");
  });

  it("offers the manual purchase on an available variant with no cart authority", () => {
    const action = resolveMasterOfferingAction(
      offering(),
      variant({ displayState: "available_now" }),
      NO_COMMERCE,
      undefined,
      ON,
    );
    expect(action.kind).toBe("request_early_access_purchase");
    expect(action.label).toBe("Request Early Access Purchase");
  });

  it("never shadows a real Add to Cart", () => {
    const action = resolveMasterOfferingAction(
      offering(),
      variant({ displayState: "available_now" }),
      {
        binding: {
          offeringVariantId: "mov_test_variant",
          productId: "pc_product_1",
          variantId: "pc_variant_1",
        },
        selection: cartSelection(),
      },
      undefined,
      ON,
    );
    expect(action.kind).toBe("add_to_cart");
  });

  it("never appears on a planning, waitlist, care, or unavailable variant", () => {
    const states = [
      ["coming_soon", "join_waitlist"],
      ["planned", "get_updates"],
      ["care_pathway", "explore_care"],
      ["approval_required", "apply"],
      ["temporarily_unavailable", "notify_me"],
      ["request_access", "request_access"],
      ["unavailable", "none"],
    ] as const;
    for (const [displayState, expected] of states) {
      const action = resolveMasterOfferingAction(
        offering(),
        variant({ displayState }),
        NO_COMMERCE,
        undefined,
        ON,
      );
      expect(action.kind).toBe(expected);
    }
  });

  it("never appears on an admin-only offering or variant", () => {
    expect(
      resolveMasterOfferingAction(
        offering({ visibility: "admin_only" }),
        variant({ displayState: "available_now" }),
        NO_COMMERCE,
        undefined,
        ON,
      ).kind,
    ).toBe("request_access");
    expect(
      resolveMasterOfferingAction(
        offering(),
        variant({ displayState: "available_now", visibility: "admin_only" }),
        NO_COMMERCE,
        undefined,
        ON,
      ).kind,
    ).toBe("request_access");
  });

  it("routes into the existing product-request domain with no quantity or price", () => {
    const action = resolveMasterOfferingAction(
      offering(),
      variant({ displayState: "available_now" }),
      NO_COMMERCE,
      undefined,
      ON,
    );
    const intent = demandIntentForAction(action);
    expect(intent).toBe("early_access_purchase");
    const handoff = toExistingMasterOfferingProductRequest({
      offering: offering(),
      variant: variant(),
      intent: "early_access_purchase",
      idempotencyKey: "idem-1",
      contactConsent: true,
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.request.interestTiming).toBe("asap");
    expect(handoff.request.desiredQuantity).toBeNull();
    expect(handoff.request.description).toContain(
      "Manual Early Access purchase request",
    );
    expect(JSON.stringify(handoff)).not.toContain("amountCents");
  });
});

describe("manual purchase environment flag", () => {
  it("fails closed for anything other than an exact true", () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(
        masterOfferingsManualPurchaseRequests({
          [MASTER_OFFERINGS_MANUAL_PURCHASE_ENV_VAR]: value,
        }),
      ).toBe(false);
    }
    expect(
      masterOfferingsManualPurchaseRequests({
        [MASTER_OFFERINGS_MANUAL_PURCHASE_ENV_VAR]: "true",
      }),
    ).toBe(true);
  });
});
