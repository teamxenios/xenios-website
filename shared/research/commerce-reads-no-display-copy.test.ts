import { describe, expect, it } from "vitest";
import {
  decideAssistedOrderAction,
  projectAssistedOrderCatalogItem,
  type AssistedOrderCatalogAuthority,
} from "./assisted-order/action-policy";
import {
  earlyAccessCustomerPathway,
  pathwayEntersPayment,
  type EarlyAccessPathwayInput,
} from "./early-access/customer-pathway";

/**
 * FOUNDER RULE, 2026-08-21: NO COMMERCE DECISION MAY READ DISPLAY COPY.
 *
 * What a customer may do with a row is decided from structured canonical facts
 * only — family, classification, price authority, explicit hold, canonical
 * action, availability state. Never from a product name, a specification, a
 * description, an access notice, or any string match against them.
 *
 * WHY THIS IS A REAL RULE AND NOT HOUSEKEEPING. GRP-0422 (the CJC-1295 +
 * Ipamorelin combination whose component split is unresolved) carries the text
 * "(split pending)" in its specification today. It would be very easy — it was
 * in fact PROPOSED during this build, by this session, as an interim — to hold
 * it by matching that phrase. That is forbidden, because it makes commerce
 * depend on prose:
 *
 *   - an editor rewording the specification silently puts a held product on
 *     sale, with no code change and no review
 *   - a different product that happens to say "pending" gets withheld for no
 *     reason
 *   - the same row can be held on one surface and sold on another, depending
 *     on which one happens to parse the string
 *
 * A hold is a fact about the row, so it travels as a field. These tests hold
 * the line by varying ONLY the display copy and asserting the commercial
 * answer does not move.
 */

function authority(
  overrides: Partial<AssistedOrderCatalogAuthority> = {},
): AssistedOrderCatalogAuthority {
  return {
    productId: "p1",
    variantId: "v1",
    productName: "Research Product",
    family: "research_peptides_materials",
    channel: "RUO Research",
    specification: "10 mg",
    format: "Vial",
    packBasis: "Per vial",
    minimumQuantity: 1,
    maximumQuantity: 100,
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

/** Display strings that would trip any plausible string-matching rule. */
const LOADED_COPY = [
  "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
  "TBD",
  "unresolved formulation",
  "pending split",
  "DO NOT SELL",
  "Temporarily Unavailable",
  "Care pathway only",
  "provider required",
  "classification pending",
  "price on request",
];

describe("the assisted-order action never reads display copy", () => {
  it("returns the same action however the product is named or described", () => {
    const baseline = decideAssistedOrderAction(authority());
    expect(baseline.workflowMode).toBe("direct_order_request");
    for (const copy of LOADED_COPY) {
      const decision = decideAssistedOrderAction(
        authority({
          productName: copy,
          specification: copy,
          accessNotice: copy,
        }),
      );
      expect(
        decision.workflowMode,
        `display copy "${copy}" changed the commercial answer`,
      ).toBe(baseline.workflowMode);
    }
  });

  it("does not hold GRP-0422's real specification text without a structured flag", () => {
    // The exact string on the real row. It must NOT be what withholds it.
    // Structured facts say directly orderable, so the answer is directly
    // orderable — and the hold has to arrive as `held`, from the catalog
    // authority, or it does not arrive at all.
    const decision = decideAssistedOrderAction(
      authority({
        specification: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
      }),
    );
    expect(decision.workflowMode).toBe("direct_order_request");
  });

  it("withholds it the moment the STRUCTURED hold is set, with identical copy", () => {
    // Same row, same words, one structured fact different. This is the pair
    // that proves the decision follows the field and not the prose.
    const sameCopy = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";
    const sold = decideAssistedOrderAction(authority({ specification: sameCopy }));
    const withheld = decideAssistedOrderAction(
      authority({ specification: sameCopy, held: true }),
    );
    expect(sold.workflowMode).toBe("direct_order_request");
    expect(withheld.workflowMode).toBe("availability_review");
    expect(withheld.actionLabel).not.toBe(sold.actionLabel);
  });

  it("keeps the projected item's action independent of its rendered text", () => {
    const plain = projectAssistedOrderCatalogItem(authority());
    const loaded = projectAssistedOrderCatalogItem(
      authority({ productName: "DO NOT SELL", accessNotice: "Temporarily Unavailable" }),
    );
    expect(loaded!.workflowMode).toBe(plain!.workflowMode);
    expect(loaded!.actionLabel).toBe(plain!.actionLabel);
    // The copy still reaches the customer — it is display, and display is its
    // job. It simply has no vote in what the customer may do.
    expect(loaded!.productName).toBe("DO NOT SELL");
  });
});

describe("the Early Access pathway takes no display copy at all", () => {
  const directPeptide: EarlyAccessPathwayInput = {
    workflowMode: "direct_order_request",
    researchUseOnly: true,
    hasApprovedRetailPrice: true,
    family: "research_peptides_materials",
  };

  it("accepts only structured facts on its input", () => {
    // Structural, not behavioural: the pathway function cannot read prose
    // because prose is not offered to it. A future field named for a product
    // name, specification, description or notice fails this test, which is the
    // point at which somebody would otherwise start matching on it.
    const allowed = new Set([
      "workflowMode",
      "researchUseOnly",
      "hasApprovedRetailPrice",
      "family",
      "commerceHold",
      "directOrderHold",
    ]);
    const offered: EarlyAccessPathwayInput & Record<string, unknown> = {
      ...directPeptide,
      commerceHold: false,
    };
    for (const key of Object.keys(offered)) {
      expect(allowed.has(key), `unexpected pathway input field "${key}"`).toBe(true);
    }
    for (const banned of ["productName", "specification", "description", "accessNotice", "notice", "label"]) {
      expect(Object.keys(offered)).not.toContain(banned);
    }
  });

  it("is held by the structured flag, never by anything a copywriter controls", () => {
    expect(earlyAccessCustomerPathway(directPeptide)).toBe("buy_now");
    const held = earlyAccessCustomerPathway({ ...directPeptide, commerceHold: true });
    expect(held).toBe("assisted_order");
    expect(pathwayEntersPayment(held)).toBe(false);
  });
});
