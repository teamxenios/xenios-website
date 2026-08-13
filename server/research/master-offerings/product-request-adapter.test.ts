import { describe, expect, it } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import {
  demandIntentForAction,
  masterOfferingDemandHref,
  toExistingMasterOfferingProductRequest,
} from "./product-request-adapter";
import { offering, variant } from "./test-fixtures";

describe("master offering existing product-request adapter", () => {
  it("maps every non-commerce demand CTA into the existing request vocabulary", () => {
    const expectations = {
      available_now: "request_access",
      available_this_week: "notify_me",
      request_access: "request_access",
      approval_required: "apply",
      temporarily_unavailable: "notify_me",
      coming_soon: "join_waitlist",
      planned: "get_updates",
    } as const;
    for (const [displayState, intent] of Object.entries(expectations)) {
      const product = offering({
        variants: [variant({ displayState: displayState as keyof typeof expectations })],
      });
      const action = resolveMasterOfferingAction(product, product.variants[0], {
        binding: null,
        selection: null,
      });
      expect(demandIntentForAction(action)).toBe(intent);
    }
  });

  it("prefills the existing durable request without a purchase quantity", () => {
    const product = offering();
    const result = toExistingMasterOfferingProductRequest({
      offering: product,
      variant: product.variants[0],
      intent: "request_access",
      idempotencyKey: "catalog-request-1",
      contactConsent: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.desiredQuantity).toBeNull();
    expect(result.request.productName).toBe("BPC-157");
    expect(result.request.interestTiming).toBe("researching");
  });

  it("carries safe offering, variant, and intent attribution in the member URL", () => {
    const product = offering();
    const href = masterOfferingDemandHref({
      offering: product,
      variant: product.variants[0],
      intent: "join_waitlist",
    });
    expect(href).toContain("/research/member/product-requests/new?");
    expect(href).toContain("offering=mo_test_product");
    expect(href).toContain("variant=mov_test_variant");
    expect(href).toContain("intent=join_waitlist");
  });
});
