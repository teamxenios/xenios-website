// The ONE derivation of a master-offerings viewer-with-grant from an
// authenticated member row, and of a pricing request identity from that
// viewer. Both the v2 catalog doors and the assisted-order bridge must price
// through these two functions so they can never disagree about who is asking:
// a second copy of this derivation is exactly how the bridge shipped without
// its pricing viewer (Phase Zero defect B, 2026-08-18 recovery packet).
//
// Nothing here reads the request. The audience, the grant, and the identity
// come only from the server-resolved member row; a browser-supplied audience,
// tier, sourceVersion, or evaluatedAt has no path into these values.

import { memberAudienceSourceVersion } from "../catalog/member-catalog-service";
import type { MemberRow } from "../member-auth";
import type { MasterOfferingCatalogViewer } from "./routes";
import type { CustomerPriceAudience } from "@shared/research/pricing";
import type { MasterOfferingRequestIdentity } from "./composition";

/**
 * The catalog viewer plus the pricing grant derived from the SAME member row
 * the guard authenticated. Structural extra field: the catalog lane treats the
 * viewer as opaque and hands it back to `pricingIdentityFromViewer` unchanged.
 */
export type MasterOfferingViewerWithGrant = MasterOfferingCatalogViewer & {
  /**
   * The pricing grant. `audience` is optional and defaults to "member" so every
   * existing member caller behaves exactly as before; the Early Access retail
   * authority sets it explicitly rather than relying on that default, so the
   * audience a price resolves against is always visible at the call site.
   */
  pricingGrant?: { sourceVersion: string; audience?: CustomerPriceAudience };
};

/**
 * Build the viewer-with-grant for one authenticated member row. `adminEmail`
 * is the configured admin identity (may be empty); the audience is "admin"
 * only on an exact normalized match, never from anything the browser sent.
 */
export function masterOfferingViewerForMember(
  member: MemberRow,
  adminEmail: string,
): MasterOfferingViewerWithGrant {
  const normalizedAdmin = adminEmail.toLowerCase().trim();
  const email = (member.email || "").toLowerCase().trim();
  const audience: MasterOfferingCatalogViewer["audience"] =
    normalizedAdmin !== "" && email === normalizedAdmin ? "admin" : "member";
  return {
    audience,
    email,
    pricingGrant: { sourceVersion: memberAudienceSourceVersion(member) },
  };
}

/**
 * The pricing request identity for a viewer, or null when the viewer carries
 * no grant. Null-safe by contract: an absent viewer (an Early Access session
 * without a member row, an anonymous probe) is a null identity, so the price
 * authority fails closed to "Price on request" instead of throwing — never a
 * fabricated audience, never $0.
 */
export function pricingIdentityFromViewer(
  viewer: unknown,
): MasterOfferingRequestIdentity | null {
  const grant = (viewer as MasterOfferingViewerWithGrant | null | undefined)
    ?.pricingGrant;
  if (!grant) return null;
  return {
    audience: grant.audience ?? "member",
    sourceVersion: grant.sourceVersion,
    evaluatedAt: new Date().toISOString(),
    currency: "USD",
  };
}
