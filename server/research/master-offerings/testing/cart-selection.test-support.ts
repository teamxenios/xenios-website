import type { AuthoritativeCartProductSelection } from "../../commerce/cart-product-selection";
import { canonicalProductVariantActivationFingerprint } from "../../product-activation/authority-repository";
import { resolveActivationAuthorityFromTestRows } from "../../product-activation/testing/authority.test-support";

/** Build a cart selection whose activation seal comes from the real async resolver. */
export async function cartSelection(
  overrides: Partial<AuthoritativeCartProductSelection> = {},
): Promise<AuthoritativeCartProductSelection> {
  const productId = overrides.productId ?? "pc_product_1";
  const variantId = overrides.variantId ?? "pc_variant_1";
  const sku = overrides.sku ?? "XEN-BPC-10";
  const evaluatedAt = overrides.evaluatedAt ?? "2026-08-09T12:00:00.000Z";
  const unsigned = {
    schemaVersion: 1 as const,
    ledgerRevision: 9,
    productState: "live" as const,
    variantState: "live" as const,
    productId,
    variantId,
    sku,
    approvalId: "11111111-1111-4111-8111-111111111111",
    approvedByActorId: "22222222-2222-4222-8222-222222222222",
    approvedByRole: "founder" as const,
    approvedAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: "2026-08-08T00:00:00.000Z",
    validFrom: "2026-08-08T12:00:00.000Z",
    validThrough: "2026-09-01T00:00:00.000Z",
    revokedAt: null,
  };
  const row = {
    ...unsigned,
    evidenceFingerprint:
      canonicalProductVariantActivationFingerprint(unsigned),
  };
  const activationAuthority = await resolveActivationAuthorityFromTestRows(
    [row],
    { productId, variantId, sku, evaluatedAt },
  );
  if (activationAuthority.state !== "live") {
    throw new Error("test fixture activation must resolve live");
  }
  return {
    productId,
    variantId,
    sku,
    audience: "member",
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "audience-v1",
      evaluatedAt: "2026-08-09T12:00:00.000Z",
    },
    price: {
      id: "price_1",
      amountCents: 9900,
      currency: "USD",
      effectiveAt: "2026-08-09T00:00:00.000Z",
      expiresAt: null,
      version: 1,
    },
    media: {
      id: "media_1",
      kind: "primary_image",
      altText: "BPC-157 vial",
    },
    canonicalReadiness: {
      ready: true,
      verifiedInputCount: 4,
      inputVersions: [{ id: "input_1", version: 1 }],
      domainVersions: [{ domain: "commerce", version: 1 }],
    },
    inventoryEligibility: {
      productId,
      variantId,
      state: "eligible",
      sourceVersion: "inventory-v1",
      evaluatedAt: "2026-08-09T12:00:00.000Z",
    },
    activationAuthority,
    evaluatedAt,
    ...overrides,
  };
}
