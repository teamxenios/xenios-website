import { describe, expect, it } from "vitest";
import {
  decideAssistedOrderAction,
  projectAssistedOrderCatalogItem,
  quantityIsAllowed,
  type AssistedOrderCatalogAuthority,
} from "./action-policy";

function authority(
  overrides: Partial<AssistedOrderCatalogAuthority> = {},
): AssistedOrderCatalogAuthority {
  return {
    productId: "p1",
    variantId: "v1",
    productName: "Product",
    family: "Family",
    channel: "RUO Research",
    specification: "10 mg",
    format: "Vial",
    packBasis: "Per vial",
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    unitPriceCents: 2500,
    currency: "USD",
    catalogVersion: "v1",
    priceVersion: "p1",
    visible: true,
    directEligible: true,
    providerWorkflowRequired: false,
    classificationPending: false,
    pricePending: false,
    held: false,
    outOfStock: false,
    researchUseOnly: true,
    accessNotice: "Research Use Only",
    ...overrides,
  };
}

describe("assisted order action policy", () => {
  it("separates visibility from direct eligibility", () => {
    expect(
      decideAssistedOrderAction(
        authority({ directEligible: false, providerWorkflowRequired: true }),
      ),
    ).toMatchObject({ visible: true, workflowMode: "provider_request" });
  });

  it("makes missing price requestable and never zero", () => {
    const item = projectAssistedOrderCatalogItem(
      authority({ unitPriceCents: null, priceVersion: null, pricePending: true }),
    );
    expect(item).toMatchObject({
      workflowMode: "request_pricing",
      unitPriceCents: null,
      actionLabel: "Request pricing",
    });
  });

  it("keeps classification pending visible", () => {
    expect(
      decideAssistedOrderAction(
        authority({ directEligible: false, classificationPending: true }),
      ),
    ).toMatchObject({
      visible: true,
      workflowMode: "request_activation",
      actionLabel: "Request Order",
    });
  });

  it("routes a Care product to the provider pathway even when priced and direct-eligible", () => {
    // Pathway precedes price and eligibility: no flag combination may present
    // a Care product as directly orderable in the research request path.
    expect(
      decideAssistedOrderAction(
        authority({
          providerWorkflowRequired: true,
          directEligible: true,
          unitPriceCents: 9900,
        }),
      ),
    ).toMatchObject({
      workflowMode: "provider_request",
      actionLabel: "Continue through Care",
    });
  });

  it("never presents a held or out-of-stock product as orderable", () => {
    for (const overrides of [{ held: true }, { outOfStock: true }] as const) {
      const decision = decideAssistedOrderAction(
        authority({ ...overrides, directEligible: true, unitPriceCents: 2500 }),
      );
      expect(decision.workflowMode).toBe("availability_review");
      expect(decision.actionLabel).not.toBe("Add to order request");
    }
  });

  it("honors MOQ, increment and maximum", () => {
    const item = projectAssistedOrderCatalogItem(
      authority({ minimumQuantity: 10, maximumQuantity: 100, quantityIncrement: 10 }),
    );
    expect(quantityIsAllowed(item!, 10)).toBe(true);
    expect(quantityIsAllowed(item!, 20)).toBe(true);
    expect(quantityIsAllowed(item!, 11)).toBe(false);
    expect(quantityIsAllowed(item!, 110)).toBe(false);
  });
});
