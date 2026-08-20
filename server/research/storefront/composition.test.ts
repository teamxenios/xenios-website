import { describe, expect, it } from "vitest";
import { pricingIdentityFromViewer } from "../master-offerings/member-pricing-viewer";
import { toPublicStorefrontPage } from "./projection";

/**
 * The VISITOR COMPOSITION's one load-bearing property, proven here rather
 * than asserted in a document.
 *
 * `docs/research-launch/INTEGRATION-LANE-STOREFRONT.md` tells the composition
 * root to serve the storefront from the existing master-offerings composition
 * with a viewer that carries NO PRICING GRANT. The safety of the entire
 * public surface rests on that, and prose drifts from wiring silently.
 *
 * WHAT THIS FILE PROVES, and what it deliberately leaves to its owner:
 *
 *   Here: the exact viewer literal the packet tells the composition root to
 *   pass resolves to a null pricing identity, through the real derivation
 *   (`pricingIdentityFromViewer`) rather than a restatement of it. If someone
 *   later changes the packet's viewer, or that derivation starts inventing an
 *   audience, this fails.
 *
 *   NOT here: that a null identity produces on-request prices. That is the
 *   master-offerings price authority's own invariant, tested in its own lane
 *   (`price-authority.test.ts`, and `member-pricing-viewer.ts`'s contract note
 *   "an absent viewer is a null identity, so the price authority fails closed
 *   to Price on request instead of throwing — never a fabricated audience,
 *   never $0"). Re-proving it here would mean importing that lane, which the
 *   repository's own boundary test forbids for anything but the composition
 *   root, and duplicating a guarantee whose owner already holds it.
 */

/** Exactly the viewer literal the packet's `serviceForVisitor` passes. */
const VISITOR = { audience: "member" as const, email: "" };

describe("public storefront visitor composition", () => {
  it("resolves a null pricing identity for the packet's visitor viewer", () => {
    expect(pricingIdentityFromViewer(VISITOR)).toBeNull();
  });

  it("resolves null for every shape a credential-less visitor could arrive as", () => {
    for (const viewer of [
      VISITOR,
      { audience: "member" as const, email: "" },
      { audience: "admin" as const, email: "" },
      {},
      null,
      undefined,
    ]) {
      expect(pricingIdentityFromViewer(viewer)).toBeNull();
    }
  });

  it("pins what a grant WOULD do, so the difference stays visible", () => {
    // Defense in depth. The packet's serviceForVisitor constructs the viewer
    // literal itself and never derives it from a request, so no browser can
    // supply a grant. This makes the consequence explicit, so that if anyone
    // later routes a request-derived value into that seat, the reviewer can
    // see exactly what it would buy them.
    expect(
      pricingIdentityFromViewer({
        ...VISITOR,
        pricingGrant: { sourceVersion: "smuggled" },
      }),
    ).not.toBeNull();
  });

  it("projects an empty catalog page without inventing a product or a price", () => {
    const projected = toPublicStorefrontPage({
      ok: true,
      page: 1,
      pageSize: 24,
      total: 0,
      totalPages: 0,
      sort: "relevance",
      products: [],
      facets: { families: [], states: [], categories: [] },
    });
    expect(projected.products).toEqual([]);
    expect(projected.total).toBe(0);
    // An empty catalog must read as empty, never as free.
    expect(JSON.stringify(projected)).not.toContain("amountCents");
  });
});
