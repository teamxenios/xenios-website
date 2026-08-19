import { describe, expect, it } from "vitest";
import {
  decideAssistedOrderAction,
  type AssistedOrderCatalogAuthority,
} from "../assisted-order/action-policy";
import type { MasterOfferingAction } from "../master-offerings/contract";
import {
  CUSTOMER_ACTIONS,
  CUSTOMER_ACTION_LABELS,
  customerActionFromAssistedOrderDecision,
  customerActionFromMasterOfferingAction,
  isCustomerAction,
} from "./customer-action";

function authority(
  overrides: Partial<AssistedOrderCatalogAuthority> = {},
): AssistedOrderCatalogAuthority {
  return {
    productId: "pc_product_1",
    variantId: "pc_variant_1",
    productName: "BPC-157",
    family: "research_vials",
    channel: "general",
    specification: "10 mg vial",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 50,
    quantityIncrement: 1,
    unitPriceCents: 9900,
    currency: "USD",
    catalogVersion: "catalog-v1",
    priceVersion: "price-v1",
    visible: true,
    directEligible: true,
    providerWorkflowRequired: false,
    classificationPending: false,
    pricePending: false,
    held: false,
    outOfStock: false,
    researchUseOnly: true,
    accessNotice: null,
    ...overrides,
  };
}

const ADD_TO_CART: Extract<MasterOfferingAction, { kind: "add_to_cart" }> = {
  kind: "add_to_cart",
  label: "Add to Cart",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-19T12:00:00.000Z",
};

describe("the closed customer-action vocabulary", () => {
  it("has exactly the six founder actions, each with one label", () => {
    expect(CUSTOMER_ACTIONS).toEqual([
      "BUY_NOW",
      "REQUEST_QUOTE",
      "ASSISTED_ORDER",
      "CARE",
      "TEMPORARILY_HELD",
      "NOT_AVAILABLE",
    ]);
    for (const action of CUSTOMER_ACTIONS) {
      expect(isCustomerAction(action)).toBe(true);
      expect(CUSTOMER_ACTION_LABELS[action].trim().length).toBeGreaterThan(0);
    }
    expect(isCustomerAction("PURCHASE")).toBe(false);
    expect(isCustomerAction("")).toBe(false);
    expect(isCustomerAction(null)).toBe(false);
  });
});

describe("assisted-order decisions translate into the six actions", () => {
  it("maps every mode exactly once, with direct commerce deciding only BUY_NOW", () => {
    const expectations: ReadonlyArray<
      [Parameters<typeof customerActionFromAssistedOrderDecision>[0], boolean, string]
    > = [
      [{ visible: true, workflowMode: "direct_order_request" }, true, "BUY_NOW"],
      [{ visible: true, workflowMode: "direct_order_request" }, false, "ASSISTED_ORDER"],
      [{ visible: true, workflowMode: "request_pricing" }, true, "REQUEST_QUOTE"],
      [{ visible: true, workflowMode: "request_pricing" }, false, "REQUEST_QUOTE"],
      [{ visible: true, workflowMode: "provider_request" }, true, "CARE"],
      [{ visible: true, workflowMode: "provider_request" }, false, "CARE"],
      [{ visible: true, workflowMode: "availability_review" }, true, "TEMPORARILY_HELD"],
      [{ visible: true, workflowMode: "availability_review" }, false, "TEMPORARILY_HELD"],
      [{ visible: true, workflowMode: "request_activation" }, true, "NOT_AVAILABLE"],
      [{ visible: true, workflowMode: "request_activation" }, false, "NOT_AVAILABLE"],
      // Invisible is NOT_AVAILABLE no matter what the mode claims, and no
      // matter whether direct commerce is on.
      [{ visible: false, workflowMode: "direct_order_request" }, true, "NOT_AVAILABLE"],
      [{ visible: false, workflowMode: "availability_review" }, true, "NOT_AVAILABLE"],
    ];
    for (const [decision, directCommerceEnabled, expected] of expectations) {
      expect(
        customerActionFromAssistedOrderDecision(decision, {
          directCommerceEnabled,
        }),
      ).toBe(expected);
    }
  });

  it("never buys a held or out-of-stock row, even with direct commerce enabled", () => {
    for (const overrides of [
      { held: true },
      { outOfStock: true },
      { held: true, outOfStock: true },
    ]) {
      const decision = decideAssistedOrderAction(authority(overrides));
      expect(
        customerActionFromAssistedOrderDecision(decision, {
          directCommerceEnabled: true,
        }),
      ).toBe("TEMPORARILY_HELD");
    }
  });

  it("never turns a missing or pending price into BUY_NOW", () => {
    for (const overrides of [
      { unitPriceCents: null },
      { pricePending: true },
      { unitPriceCents: null, pricePending: true },
    ]) {
      const decision = decideAssistedOrderAction(authority(overrides));
      expect(
        customerActionFromAssistedOrderDecision(decision, {
          directCommerceEnabled: true,
        }),
      ).toBe("REQUEST_QUOTE");
    }
  });

  it("keeps a provider-review row CARE, never BUY_NOW, whatever else is true", () => {
    const decision = decideAssistedOrderAction(
      authority({ providerWorkflowRequired: true, directEligible: true }),
    );
    for (const directCommerceEnabled of [true, false]) {
      expect(
        customerActionFromAssistedOrderDecision(decision, {
          directCommerceEnabled,
        }),
      ).toBe("CARE");
    }
  });

  it("always answers a member of the closed vocabulary", () => {
    const modes = [
      "direct_order_request",
      "provider_request",
      "request_pricing",
      "request_activation",
      "availability_review",
    ] as const;
    for (const workflowMode of modes) {
      for (const visible of [true, false]) {
        for (const directCommerceEnabled of [true, false]) {
          expect(
            isCustomerAction(
              customerActionFromAssistedOrderDecision(
                { visible, workflowMode },
                { directCommerceEnabled },
              ),
            ),
          ).toBe(true);
        }
      }
    }
  });
});

describe("master-offerings actions translate into the six actions", () => {
  it("maps every action kind exactly once", () => {
    const href = { href: "/research/member/product-requests/new" };
    const expectations: ReadonlyArray<[MasterOfferingAction, string]> = [
      [ADD_TO_CART, "BUY_NOW"],
      [{ kind: "request_access", label: "Request Access", ...href }, "ASSISTED_ORDER"],
      [
        {
          kind: "request_early_access_purchase",
          label: "Request Early Access Purchase",
          ...href,
        },
        "ASSISTED_ORDER",
      ],
      [{ kind: "apply", label: "Apply", ...href }, "ASSISTED_ORDER"],
      [{ kind: "notify_me", label: "Notify Me", ...href }, "TEMPORARILY_HELD"],
      [{ kind: "join_waitlist", label: "Join Waitlist", ...href }, "TEMPORARILY_HELD"],
      [
        {
          kind: "explore_care",
          label: "Explore Care",
          href: "/research/member/metabolic-care",
        },
        "CARE",
      ],
      [{ kind: "get_updates", label: "Get Updates", ...href }, "NOT_AVAILABLE"],
      [{ kind: "none", label: null, href: null }, "NOT_AVAILABLE"],
    ];
    for (const [action, expected] of expectations) {
      expect(customerActionFromMasterOfferingAction(action)).toBe(expected);
      expect(isCustomerAction(customerActionFromMasterOfferingAction(action))).toBe(
        true,
      );
    }
  });

  it("never lets a missing or malformed price produce BUY_NOW", () => {
    for (const amountCents of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        customerActionFromMasterOfferingAction({
          ...ADD_TO_CART,
          amount: { amountCents, currency: "USD" },
        }),
      ).toBe("REQUEST_QUOTE");
    }
    expect(
      customerActionFromMasterOfferingAction({
        ...ADD_TO_CART,
        amount: { amountCents: 9900, currency: " " },
      }),
    ).toBe("REQUEST_QUOTE");
    // A resolved purchase whose displayed price says "on request" is a
    // contradiction, and a contradiction fails closed rather than selling.
    expect(
      customerActionFromMasterOfferingAction(ADD_TO_CART, {
        state: "on_request",
      }),
    ).toBe("REQUEST_QUOTE");
    expect(
      customerActionFromMasterOfferingAction(ADD_TO_CART, { state: "priced" }),
    ).toBe("BUY_NOW");
  });

  it("shows the on-request state for a request action without a price", () => {
    expect(
      customerActionFromMasterOfferingAction(
        {
          kind: "request_access",
          label: "Request Access",
          href: "/research/member/product-requests/new",
        },
        { state: "on_request" },
      ),
    ).toBe("REQUEST_QUOTE");
  });

  it("never both buys and cares: care stays CARE at every price state", () => {
    const care: MasterOfferingAction = {
      kind: "explore_care",
      label: "Explore Care",
      href: "/research/member/metabolic-care",
    };
    for (const price of [undefined, { state: "priced" as const }, { state: "on_request" as const }]) {
      expect(customerActionFromMasterOfferingAction(care, price)).toBe("CARE");
    }
  });

  it("never buys a held state: notify and waitlist stay TEMPORARILY_HELD", () => {
    for (const kind of ["notify_me", "join_waitlist"] as const) {
      const action = {
        kind,
        label: kind === "notify_me" ? "Notify Me" : "Join Waitlist",
        href: "/x",
      } as MasterOfferingAction;
      for (const price of [undefined, { state: "priced" as const }]) {
        expect(customerActionFromMasterOfferingAction(action, price)).not.toBe(
          "BUY_NOW",
        );
      }
    }
  });
});
