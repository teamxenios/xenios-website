// DOES THE REPAIR ACTUALLY REACH THE PERSON WHO CANNOT SEE A PRICE?
//
// The Early Access retail grant is handed out only to a viewer whose
// `earlyAccessSessionHash` is non-null. An adversarial review raised the right
// question about that: a cookieless visitor gets `earlyAccessSessionHash: null`
// from `createAssistedOrderViewerResolvers`, so such a visitor is NOT priced —
// and if that were the visitor looking at the live catalog, this whole repair
// would ship and change nothing a customer sees.
//
// It is not, and the reason is structural rather than incidental. In
// server/research/assisted-order/express.ts the customer resolver has exactly
// three outcomes, and each sets capabilities and pricing provenance TOGETHER:
//
//   member branch      capabilities = CUSTOMER_CAPABILITIES, pricingViewer set
//   identified EA      capabilities = CUSTOMER_CAPABILITIES, sessionHash set
//   anonymous fallback capabilities = EMPTY,                 sessionHash null
//
// The catalog door requires `assisted_orders:*`. So a viewer that can READ the
// catalog always falls in one of the first two branches, and both are priced.
// A viewer that is unpriced is, by the same construction, a viewer that cannot
// see the catalog at all — production answers it HTTP 403, verified live.
//
// THE INVARIANT: nobody can reach the catalog and be shown no price. That is
// the property the repair actually needs, and it is the one asserted here.
// If a future edit grants capabilities in a branch that sets no pricing
// provenance, this test fails and names it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { createAssistedOrderViewerResolvers } from "../assisted-order/express";
import { pricingViewerForCustomerViewer } from "./early-access-retail-pricing";
import { masterOfferingViewerForMember } from "./member-pricing-viewer";
import type { MemberRow } from "../member-auth";

const MEMBER_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "app-1",
  auth_user_id: "auth-1",
  email: "member@example.com",
  first_name: "Test",
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
} as unknown as MemberRow;

/** The catalog door's requirement, mirrored from the assisted-order service. */
const CATALOG_CAPABILITY = "assisted_orders:submit";

function resolvers(options: {
  member?: boolean;
  /** Whether the Early Access directory binds this session to a real customer. */
  identified?: boolean;
}) {
  return createAssistedOrderViewerResolvers({
    resolveMember: async () =>
      options.member
        ? {
            id: MEMBER_ROW.id,
            email: MEMBER_ROW.email,
            pricingViewer: masterOfferingViewerForMember(MEMBER_ROW, ""),
          }
        : null,
    earlyAccess: () => ({
      // The real directory returns null for a session that is not bound to an
      // APPROVED customer. That null is what produces the anonymous fallback.
      identity: {
        resolve: async () =>
          options.identified
            ? {
                customerRef: "eac_0123456789abcdef0123456789abcdef",
                displayName: "Early Access customer",
                boundBy: "verified_link" as const,
              }
            : null,
      },
      // Session standing is proven before the production resolver will trust
      // either the opaque session id or the customer-directory answer.
      resolveSession: async () => ({ authenticated: true }),
      readSessionId: () => "ea-session-1",
    }),
    earlyAccessBindings: () => null,
    adminEmail: () => "research@xeniostechnology.com",
  });
}

const withCookie = { headers: { cookie: "ea=1" } } as unknown as Request;

describe("the repair reaches everyone who can actually see the catalog", () => {
  it("prices an identified Early Access customer — the person in the live journey", async () => {
    // This is who the founder's customer IS at the catalog step: bound through
    // one of the four doors, approved, and NOT a member.
    const viewer = await resolvers({ identified: true }).customer(withCookie);
    expect(viewer.actorType).toBe("early_access_session");
    expect(viewer.earlyAccessSessionHash).not.toBeNull();
    expect(viewer.capabilities.has(CATALOG_CAPABILITY)).toBe(true);
    expect(pricingViewerForCustomerViewer(viewer)).toBeTruthy();
  });

  it("still prices an authenticated member from their own row, not the retail grant", async () => {
    const viewer = await resolvers({ member: true }).customer(withCookie);
    expect(viewer.actorType).toBe("member");
    const chosen = pricingViewerForCustomerViewer(viewer);
    expect(chosen).toBe(viewer.pricingViewer);
    expect(chosen?.email).toBe("member@example.com");
  });

  it("gives an unidentified visitor no price AND no catalog — never one without the other", async () => {
    const viewer = await resolvers({ identified: false }).customer(withCookie);
    expect(viewer.earlyAccessSessionHash).toBeNull();
    expect(pricingViewerForCustomerViewer(viewer)).toBeUndefined();
    // The half that makes the unpriced state harmless rather than a bug.
    expect(viewer.capabilities.has(CATALOG_CAPABILITY)).toBe(false);
    expect(viewer.capabilities.size).toBe(0);
  });

  it("THE INVARIANT: catalog access always implies a pricing grant", async () => {
    const cases = [
      ["identified Early Access customer", { identified: true }],
      ["authenticated member", { member: true }],
      ["unidentified visitor", { identified: false }],
      ["member and identified", { member: true, identified: true }],
    ] as const;

    let priced = 0;
    for (const [label, options] of cases) {
      const viewer = await resolvers(options).customer(withCookie);
      const canSeeCatalog = viewer.capabilities.has(CATALOG_CAPABILITY);
      const isPriced = pricingViewerForCustomerViewer(viewer) !== undefined;
      if (canSeeCatalog) priced += 1;
      expect(
        canSeeCatalog ? isPriced : true,
        `${label} can read the catalog but would be shown no price`,
      ).toBe(true);
    }
    // Guards the guard: at least one case must actually exercise the implication.
    expect(priced).toBeGreaterThanOrEqual(3);
  });

  it("keeps capabilities and pricing provenance welded together in the resolver source", () => {
    // The invariant above is a property of how express.ts is WRITTEN: every
    // branch that hands out CUSTOMER_CAPABILITIES also establishes pricing
    // provenance. A future branch that grants capabilities without either a
    // pricingViewer or a session hash would break the invariant for a viewer
    // shape this test does not enumerate, so the source is checked directly.
    const source = readFileSync(
      path.resolve(__dirname, "..", "assisted-order", "express.ts"),
      "utf8",
    );
    const customerBody = source.slice(
      source.indexOf("async customer("),
      source.indexOf("async admin("),
    );
    expect(customerBody.length).toBeGreaterThan(200);

    // Each viewer this resolver returns, as its own object literal.
    const literals = customerBody
      .split("return Object.freeze({")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("})")));
    expect(literals.length).toBeGreaterThanOrEqual(3);

    const offenders: string[] = [];
    for (const literal of literals) {
      const grantsCatalog = literal.includes("capabilities: CUSTOMER_CAPABILITIES");
      if (!grantsCatalog) continue;
      const establishesProvenance =
        /pricingViewer\s*:/.test(literal) ||
        /earlyAccessSessionHash:\s*createHash/.test(literal);
      if (!establishesProvenance) {
        offenders.push(literal.slice(0, 120).replace(/\s+/g, " "));
      }
    }
    expect(
      offenders,
      "a customer branch grants catalog capabilities without establishing pricing provenance",
    ).toEqual([]);
  });
});
