// One catalog, several truthful pathways. These tests pin the two rules that
// keep that honest: price never decides the pathway, and BUY_NOW is never a
// curated list.

import { describe, expect, it } from "vitest";
import { assistedOrderWorkflowModes } from "../assisted-order/contract";
import {
  DIRECT_PURCHASE_FAMILIES,
  earlyAccessCustomerPathway,
  hasDirectOrderHold,
  earlyAccessCustomerPathways,
  earlyAccessPathwayLabel,
  pathwayEntersPayment,
  pathwayEntersRequest,
  type EarlyAccessCustomerPathway,
} from "./customer-pathway";

describe("the Early Access customer pathway", () => {
  it("answers every canonical workflow mode, with no silent fallthrough", () => {
    for (const workflowMode of assistedOrderWorkflowModes) {
      for (const researchUseOnly of [true, false]) {
        const pathway = earlyAccessCustomerPathway({
          workflowMode,
          researchUseOnly,
          hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
        });
        expect(earlyAccessCustomerPathways).toContain(pathway);
      }
    }
  });

  it("keeps a priced Care row on Care, however eligible it looks", () => {
    // 242 of the 420 shipped rows are exactly this: real retail price, and
    // never a direct sale. This is the assertion that stops a future
    // "it has a price, let them buy it" refactor.
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "provider_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      }),
    ).toBe("care");
  });

  it("lets a classification-pending row be REQUESTED, never bought", () => {
    // All 32 of these are real, priced products whose intended-use
    // classification is unfinished. The customer may ask; nothing here may
    // relabel them RUO to make them purchasable.
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "request_activation",
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      }),
    ).toBe("assisted_order");
    expect(pathwayEntersPayment("assisted_order")).toBe(false);
  });

  it("keeps an availability-review row out of every commercial path", () => {
    const pathway = earlyAccessCustomerPathway({
      workflowMode: "availability_review",
      researchUseOnly: true,
      hasApprovedRetailPrice: true,
      family: "research_peptides_materials",
    });
    expect(pathway).toBe("temporarily_held");
    expect(pathwayEntersPayment(pathway)).toBe(false);
    expect(pathwayEntersRequest(pathway)).toBe(false);
  });

  it("does not let a price alone buy a customer anything", () => {
    // The same approved price on four different pathways. Only one of them
    // reaches payment, and it is not the one with the biggest number.
    for (const workflowMode of [
      "provider_request",
      "request_activation",
      "availability_review",
    ] as const) {
      expect(
        pathwayEntersPayment(
          earlyAccessCustomerPathway({
            workflowMode,
            researchUseOnly: true,
            hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
          }),
        ),
      ).toBe(false);
    }
  });

  it("sends a confirmed RUO row WITHOUT a price to review, not to checkout", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: false,
        family: "research_peptides_materials",
      }),
    ).toBe("assisted_order");
  });

  it("never promotes an unconfirmed classification, however well priced", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: false,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      }),
    ).toBe("assisted_order");
  });

  it("routes a direct row to payment ONLY when the server says the facts are complete", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      }),
    ).toBe("buy_now");
    // The same row, same price, without complete declared facts: it still
    // sells, but through review rather than through the payment journey.
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: false,
        family: "research_peptides_materials",
      }),
    ).toBe("assisted_order");
  });

  it("sends an unpriced row to a quote, not to a dead end", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "request_pricing",
        researchUseOnly: true,
        hasApprovedRetailPrice: false,
        family: "research_peptides_materials",
      }),
    ).toBe("request_quote");
  });

  it("takes no fulfilment readiness into account at all", () => {
    // Placing an order and shipping one are different questions. Supplier
    // assignment, inventory and lot/COA are downstream operational states of
    // an order that has already been placed, and must never be a reason to
    // hide the buy action. A future edit that reintroduces them has to come
    // through review rather than sliding in as a field.
    const source = earlyAccessCustomerPathway.toString().toLowerCase();
    for (const readiness of [
      "supplier",
      "inventory",
      "stock",
      "lot",
      "coa",
      "fulfil",
      "fulfill",
      "readiness",
    ]) {
      expect(source).not.toContain(readiness);
    }
  });

  it("lets only buy_now reach payment", () => {
    const paying = earlyAccessCustomerPathways.filter(pathwayEntersPayment);
    expect(paying).toEqual(["buy_now"]);
    // Care, held and unavailable must never enter the money path.
    for (const pathway of ["care", "temporarily_held", "not_available"] as const) {
      expect(pathwayEntersPayment(pathway)).toBe(false);
      expect(pathwayEntersRequest(pathway)).toBe(false);
    }
  });

  it("lets exactly the reviewable pathways place a request", () => {
    expect(earlyAccessCustomerPathways.filter(pathwayEntersRequest)).toEqual([
      "assisted_order",
      "request_quote",
    ]);
  });

  it("gives every pathway one customer-facing label, and never says $0 or 'unknown'", () => {
    const labels = new Map<EarlyAccessCustomerPathway, string>();
    for (const pathway of earlyAccessCustomerPathways) {
      const label = earlyAccessPathwayLabel(pathway);
      expect(label.trim().length).toBeGreaterThan(0);
      expect(label.toLowerCase()).not.toContain("unknown");
      expect(label).not.toContain("$0");
      labels.set(pathway, label);
    }
    // No two pathways may share a label; a customer must be able to tell a
    // held row from a Care row from a purchasable one.
    expect(new Set(labels.values()).size).toBe(earlyAccessCustomerPathways.length);
    expect(earlyAccessPathwayLabel("care")).toBe("Continue through Care");
  });

  it("refuses direct purchase to a family that has not been approved for it", () => {
    // Research Capsules satisfy every generic condition — confirmed RUO, an
    // approved retail price, a direct workflow mode — and are still NOT
    // approved for direct purchase. 13 live rows are exactly this case, and a
    // generic rule would have quietly started selling them.
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_capsules",
      }),
    ).toBe("assisted_order");
    // ...and every other family in the shipped catalog, for the same reason.
    for (const family of [
      "supplements",
      "topicals_regenerative",
      "research_supplies",
      "shipping_and_fulfillment",
      "clinical_formulations_503a",
    ]) {
      expect(
        pathwayEntersPayment(
          earlyAccessCustomerPathway({
            workflowMode: "direct_order_request",
            researchUseOnly: true,
            hasApprovedRetailPrice: true,
            family,
          }),
        ),
      ).toBe(false);
    }
    // The approved set is exactly one family, by decision, not by accident.
    expect(DIRECT_PURCHASE_FAMILIES).toEqual(["research_peptides_materials"]);
  });

  it("treats featured and purchasable as unrelated ideas", () => {
    // There is no "featured" input at all. Merchandising cannot grant a
    // payment path, which is the whole point of retiring the curated 22 as a
    // privileged set.
    const source = earlyAccessCustomerPathway.toString().toLowerCase();
    expect(source).not.toContain("featured");
    expect(source).not.toContain("legacy");
  });
});

describe("the explicit hold, the fourth canonical fact", () => {
  const directPeptide = {
    workflowMode: "direct_order_request",
    researchUseOnly: true,
    hasApprovedRetailPrice: true,
    family: "research_peptides_materials",
  } as const;

  it("buys when nothing is held", () => {
    expect(earlyAccessCustomerPathway(directPeptide)).toBe("buy_now");
    expect(earlyAccessCustomerPathway({ ...directPeptide, directOrderHold: null })).toBe("buy_now");
  });

  it("withholds the one launch row whose composition is unresolved", () => {
    // CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending): approved
    // family, confirmed RUO, approved price. The first three facts alone would
    // sell it. The hold is the only thing standing between the customer and a
    // product Xenios cannot describe.
    const pathway = earlyAccessCustomerPathway({
      ...directPeptide,
      directOrderHold: "composition_unresolved",
    });
    expect(pathway).toBe("assisted_order");
    expect(pathwayEntersPayment(pathway)).toBe(false);
  });

  it("still lets the customer REQUEST a held row", () => {
    // A hold is not a refusal. The row stays visible and requestable; it just
    // does not take money.
    const pathway = earlyAccessCustomerPathway({
      ...directPeptide,
      directOrderHold: "composition_unresolved",
    });
    expect(pathwayEntersRequest(pathway)).toBe(true);
  });

  it("clears itself with no code change when the catalog stops reporting a reason", () => {
    // The whole point of a canonical hold over a SKU denylist: resolving the
    // split makes the row purchasable without editing this file.
    expect(earlyAccessCustomerPathway({ ...directPeptide, directOrderHold: "composition_unresolved" })).toBe("assisted_order");
    expect(earlyAccessCustomerPathway({ ...directPeptide, directOrderHold: undefined })).toBe("buy_now");
  });

  it("never withholds a product because of a blank catalog column", () => {
    // Empty or whitespace text is absence of a hold, not a hold. A blank
    // column must not quietly pull 111 products off sale.
    for (const blank of ["", "   ", "	"]) {
      expect(hasDirectOrderHold({ directOrderHold: blank })).toBe(false);
      expect(earlyAccessCustomerPathway({ ...directPeptide, directOrderHold: blank })).toBe("buy_now");
    }
    expect(hasDirectOrderHold({ directOrderHold: null })).toBe(false);
    expect(hasDirectOrderHold({ directOrderHold: undefined })).toBe(false);
    expect(hasDirectOrderHold({ directOrderHold: "composition_unresolved" })).toBe(true);
  });

  it("cannot promote a Care or pending row just because it carries no hold", () => {
    // The hold only ever SUBTRACTS. It is checked inside the direct branch, so
    // an absent hold can never lift a row out of Care or classification review.
    for (const workflowMode of ["provider_request", "request_activation", "availability_review", "request_pricing"] as const) {
      const pathway = earlyAccessCustomerPathway({ ...directPeptide, workflowMode, directOrderHold: null });
      expect(pathway).not.toBe("buy_now");
      expect(pathwayEntersPayment(pathway)).toBe(false);
    }
  });
});
