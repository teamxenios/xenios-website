/**
 * ADVERSARIAL COMPOSITION-SEAM SECURITY SUITE — peptide launch.
 *
 * Author: claude-fable-s10-release-security (Lane 7: adversarial security /
 * composition). Base integration head 6d9eb58. No production mutation; pure
 * unit assertions over the two customer-action authorities.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE PEPTIDE-ACCEPTANCE SUITE.
 * `shared/research/launch/peptide-launch-acceptance.test.ts` (claude-fable-s3)
 * proves the peptide SET reconciles at the DATA layer (141/112/29/111/1).
 * This suite proves the RUNTIME ACTION SEAM: that the two functions a live
 * surface actually calls to decide "may this buyer purchase?" can never widen
 * a non-purchasable canonical state into BUY_NOW — the composition-seam failure
 * mode that has repeatedly bitten this codebase between individually-correct
 * modules.
 *
 * TWO AUTHORITIES EXIST TODAY:
 *   - LIVE:     shared/research/launch/customer-action.ts
 *              (consumed by server/research/storefront/projection.ts and the
 *               storefront/master-offering cards)
 *   - UNMOUNTED: shared/research/early-access/customer-pathway.ts (s3)
 * They DISAGREE on the label for a classification-pending row
 * (NOT_AVAILABLE vs assisted_order) — a launch-consistency finding handed to
 * the lead. They MUST agree on the one fact that moves money: neither ever
 * yields a purchasable action for a pending / Care / held / unpriced row. That
 * agreement is asserted below.
 */

import { describe, it, expect } from "vitest";

import {
  customerActionFromAssistedOrderDecision,
  customerActionFromMasterOfferingAction,
} from "./customer-action";
import { earlyAccessCustomerPathway } from "../early-access/customer-pathway";
import type { AssistedOrderWorkflowMode } from "../assisted-order/contract";
import type { MasterOfferingAction } from "../master-offerings/contract";

const NON_DIRECT_MODES: readonly AssistedOrderWorkflowMode[] = [
  "request_pricing",
  "provider_request",
  "availability_review",
  "request_activation",
];

describe("live customer-action authority: BUY_NOW is earned, never assumed", () => {
  it("only direct_order_request WITH server-enabled direct commerce becomes BUY_NOW", () => {
    expect(
      customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode: "direct_order_request" },
        { directCommerceEnabled: true },
      ),
    ).toBe("BUY_NOW");
  });

  it("direct_order_request WITHOUT server-enabled direct commerce falls back to ASSISTED_ORDER", () => {
    // This is the exact mechanism the CJC composition-block must use: a variant
    // whose composition is unresolved must arrive here with
    // directCommerceEnabled=false, and the live authority then downgrades it.
    expect(
      customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode: "direct_order_request" },
        { directCommerceEnabled: false },
      ),
    ).toBe("ASSISTED_ORDER");
  });

  it.each(NON_DIRECT_MODES)(
    "workflowMode %s can never be BUY_NOW, even with direct commerce forced on",
    (workflowMode) => {
      const action = customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode },
        { directCommerceEnabled: true },
      );
      expect(action).not.toBe("BUY_NOW");
    },
  );

  it("classification-pending (request_activation) resolves to NOT_AVAILABLE in the live authority", () => {
    expect(
      customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode: "request_activation" },
        { directCommerceEnabled: true },
      ),
    ).toBe("NOT_AVAILABLE");
  });

  it("an invisible decision is NOT_AVAILABLE regardless of workflow mode", () => {
    expect(
      customerActionFromAssistedOrderDecision(
        { visible: false, workflowMode: "direct_order_request" },
        { directCommerceEnabled: true },
      ),
    ).toBe("NOT_AVAILABLE");
  });
});

describe("live customer-action authority: a purchase needs a real, present price", () => {
  const addToCart = (amountCents: number): MasterOfferingAction => ({
    kind: "add_to_cart",
    label: "Add to Cart",
    productId: "p-1",
    variantId: "v-1",
    sku: "SKU-1",
    amount: { amountCents, currency: "USD" },
    evaluatedAt: "2026-08-21T00:00:00.000Z",
  });

  it("add_to_cart with a usable price AND a priced view becomes BUY_NOW", () => {
    expect(
      customerActionFromMasterOfferingAction(addToCart(9900), { state: "priced" }),
    ).toBe("BUY_NOW");
  });

  it("add_to_cart whose price view says on_request fails closed to REQUEST_QUOTE", () => {
    // A resolved 'purchase' displayed as "Price on request" is a contradiction;
    // the buyer may ask, but no Buy button is shown for a price that isn't there.
    expect(
      customerActionFromMasterOfferingAction(addToCart(9900), { state: "on_request" }),
    ).toBe("REQUEST_QUOTE");
  });

  it("add_to_cart with a zero amount is never a purchase", () => {
    expect(
      customerActionFromMasterOfferingAction(addToCart(0), { state: "priced" }),
    ).not.toBe("BUY_NOW");
  });

  it("Care and request kinds are never a purchase", () => {
    expect(
      customerActionFromMasterOfferingAction({ kind: "explore_care", label: "Explore Care", href: "/care" }),
    ).toBe("CARE");
    expect(
      customerActionFromMasterOfferingAction({ kind: "apply", label: "Apply", href: "/apply" }, { state: "priced" }),
    ).not.toBe("BUY_NOW");
  });
});

describe("cross-authority money-safety agreement (the composition seam)", () => {
  // The two BUY_NOW authorities disagree on the LABEL for a pending row, but
  // both must refuse to make it purchasable. This is the invariant that keeps a
  // classification-pending peptide (29 rows) and Care (503A) out of checkout no
  // matter which authority a surface happens to call.
  const purchasableStates = new Set(["BUY_NOW", "buy_now"]);

  it.each(NON_DIRECT_MODES)(
    "%s is non-purchasable in BOTH the live and the unmounted authority",
    (workflowMode) => {
      const live = customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode },
        { directCommerceEnabled: true },
      );
      const pathway = earlyAccessCustomerPathway({
        workflowMode,
        // Force the facts that would earn a direct purchase if the mode allowed
        // it — proving the mode gate, not a missing price, is what refuses.
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      });
      expect(purchasableStates.has(live)).toBe(false);
      expect(purchasableStates.has(pathway)).toBe(false);
    },
  );

  it("provider_request is Care on both sides and never a sale", () => {
    expect(
      customerActionFromAssistedOrderDecision(
        { visible: true, workflowMode: "provider_request" },
        { directCommerceEnabled: true },
      ),
    ).toBe("CARE");
    expect(
      earlyAccessCustomerPathway({
        workflowMode: "provider_request",
        researchUseOnly: true,
        hasApprovedRetailPrice: true,
        family: "research_peptides_materials",
      }),
    ).toBe("care");
  });
});

describe("FINDING 1 — the composition-blocked CJC row must not sell itself", () => {
  // CJC-1295 WITH DAC + IPAMORELIN carries every fact that earns a direct sale:
  // family research_peptides_materials, confirmed RUO, an approved retail price.
  // NEITHER authority has a composition-resolved gate, so the only correct place
  // to stop it is the server's per-variant directCommerceEnabled decision (the
  // Product Control selection). This pins that mechanism: with the block in
  // place (directCommerceEnabled=false) the LIVE authority downgrades the row,
  // and the moment the composition split is resolved the same code sells it with
  // no list to edit.
  const cjcDirectOrder = { visible: true, workflowMode: "direct_order_request" } as const;

  it("blocked composition => directCommerceEnabled false => ASSISTED_ORDER (the customer may still request it)", () => {
    expect(
      customerActionFromAssistedOrderDecision(cjcDirectOrder, { directCommerceEnabled: false }),
    ).toBe("ASSISTED_ORDER");
  });

  it("REGRESSION GUARD: family+RUO+price are NOT sufficient — only directCommerceEnabled flips BUY_NOW", () => {
    // If a future change ever makes the live authority derive BUY_NOW from the
    // canonical facts alone (ignoring directCommerceEnabled), this asserts the
    // gate is still the single lever, so the composition-block cannot be bypassed.
    const withoutDirect = customerActionFromAssistedOrderDecision(cjcDirectOrder, {
      directCommerceEnabled: false,
    });
    const withDirect = customerActionFromAssistedOrderDecision(cjcDirectOrder, {
      directCommerceEnabled: true,
    });
    expect(withoutDirect).not.toBe("BUY_NOW");
    expect(withDirect).toBe("BUY_NOW");
  });
});
