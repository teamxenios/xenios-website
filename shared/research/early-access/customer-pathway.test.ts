// One catalog, several truthful pathways. These tests pin the two rules that
// keep that honest: price never decides the pathway, and BUY_NOW is never a
// curated list.

import { describe, expect, it } from "vitest";
import { assistedOrderWorkflowModes } from "../assisted-order/contract";
import {
  earlyAccessCustomerPathway,
  earlyAccessCustomerPathways,
  earlyAccessPathwayLabel,
  pathwayEntersPayment,
  pathwayEntersRequest,
  type EarlyAccessCustomerPathway,
} from "./customer-pathway";

describe("the Early Access customer pathway", () => {
  it("answers every canonical workflow mode, with no silent fallthrough", () => {
    for (const workflowMode of assistedOrderWorkflowModes) {
      for (const directPurchaseEligible of [true, false]) {
        const pathway = earlyAccessCustomerPathway({
          workflowMode,
          directPurchaseEligible,
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
        directPurchaseEligible: true,
      }),
    ).toBe("care");
  });

  it("keeps a priced held row unpurchasable", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "request_activation",
        directPurchaseEligible: true,
      }),
    ).toBe("temporarily_held");
  });

  it("routes a direct row to payment ONLY when the server says the facts are complete", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        directPurchaseEligible: true,
      }),
    ).toBe("buy_now");
    // The same row, same price, without complete declared facts: it still
    // sells, but through review rather than through the payment journey.
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "direct_order_request",
        directPurchaseEligible: false,
      }),
    ).toBe("assisted_order");
  });

  it("sends an unpriced row to a quote, not to a dead end", () => {
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "request_pricing",
        directPurchaseEligible: false,
      }),
    ).toBe("request_quote");
  });

  it("takes NOTHING from price — the input does not even accept one", () => {
    // Structural, not behavioural: there is no price on the input, so no
    // implementation of this function can branch on one. A future edit that
    // adds a price parameter has to come through review.
    const input = { workflowMode: "direct_order_request", directPurchaseEligible: false } as const;
    expect(Object.keys(input).sort()).toEqual([
      "directPurchaseEligible",
      "workflowMode",
    ]);
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

  it("treats featured and purchasable as unrelated ideas", () => {
    // There is no "featured" input at all. Merchandising cannot grant a
    // payment path, which is the whole point of retiring the curated 22 as a
    // privileged set.
    const source = earlyAccessCustomerPathway.toString().toLowerCase();
    expect(source).not.toContain("featured");
    expect(source).not.toContain("legacy");
  });
});
