/**
 * The KRIS_VOLUME_PARTNER buyer-scoped price provider.
 *
 * This is the composition of four records that already exist, and NOTHING
 * new: the M62 legal binding (customer handle -> canonical member), the B2B
 * buyer bridge (member -> one active relationship -> one active
 * KRIS_VOLUME_PARTNER entitlement), the reviewed Kris legacy bindings
 * (canonical unit -> Kris artifact row), and the accepted Kris artifact's
 * KRIS_VOLUME_PARTNER overlay (artifact row -> partner price). No table is
 * added, no price is stored twice, and the founder release ledger is not
 * consulted or changed here: releasing remains the ledger's job, and this
 * provider only answers what the ENTITLED buyer pays for a unit the ledger
 * has already released.
 *
 * PROVENANCE, NOT TRUST. The entitlement row was pinned at claim time to the
 * accepted catalog artifact (version = the artifact schema version, effective
 * instant = its generatedAt). This provider re-derives both from the runtime
 * artifact through the SAME `resolveKrisVolumePartnerPricingAuthority` the
 * claim used, and refuses to price when either disagrees: a hot-swapped or
 * regenerated artifact silently changes nobody's charge, it closes the
 * wholesale door until the entitlement is re-pinned.
 *
 * Every failure path returns null, which every caller treats as "the shared
 * ledger price stands". This module can therefore close the wholesale price,
 * or restore the public one; it cannot invent a number.
 */

import {
  resolveB2BBuyerPricingForMember,
  type B2BBuyerBridgeDeps,
  type B2BBuyerPricingForMember,
} from "./b2b-buyer-bridge";
import {
  ACCEPTED_KRIS_VOLUME_PARTNER_CATALOG_SHA,
} from "./b2b-sponsored-claim";
import { resolveKrisVolumePartnerPricingAuthority } from "./b2b-pricing-authority";
import type { KrisLegacyBindingRecord } from "../kris-launch-a/legacy-order-production";
import type {
  BuyerPriceSheet,
  BuyerScopedPricing,
  BuyerScopedUnitPrice,
} from "../early-access/commerce/buyer-scoped-pricing";

/** The customer handle -> member resolution seam (the M62 directory). */
export interface KrisPriceSheetBindingLookup {
  memberForCustomer(customerRef: string): Promise<{ memberId: string } | null>;
}

export interface KrisBuyerScopedPricingDeps {
  readonly bindings: KrisPriceSheetBindingLookup;
  readonly bridge: Pick<B2BBuyerBridgeDeps, "now" | "listRelationshipsForMember">;
  readonly krisBindings: readonly KrisLegacyBindingRecord[];
  /** The raw parsed Kris artifact JSON, exactly as committed. */
  readonly artifact: unknown;
  readonly warn?: (message: string) => void;
}

function instantsEqual(a: string, b: string): boolean {
  const parsedA = Date.parse(a);
  const parsedB = Date.parse(b);
  return Number.isFinite(parsedA) && Number.isFinite(parsedB) && parsedA === parsedB;
}

type OverlayEntry = { state?: unknown; amountCents?: unknown; currency?: unknown };

/**
 * Build the unit -> partner price map once. Only a `priced` overlay entry
 * with a safe positive integer amount and a non-empty currency prices a
 * bound unit; anything else leaves the unit unpriced here, which keeps
 * price-pending rows (they are `pending` in the overlay) permanently out of
 * this sheet no matter what the ledger says.
 */
function buildUnitPriceMap(
  krisBindings: readonly KrisLegacyBindingRecord[],
  overlay: Record<string, OverlayEntry>,
): ReadonlyMap<string, BuyerScopedUnitPrice> {
  const byUnit = new Map<string, BuyerScopedUnitPrice>();
  for (const binding of krisBindings) {
    const entry = overlay[binding.krisId];
    if (entry === undefined || entry.state !== "priced") continue;
    const amountCents = entry.amountCents;
    const currency = entry.currency;
    if (!Number.isSafeInteger(amountCents) || (amountCents as number) <= 0) continue;
    if (typeof currency !== "string" || currency.trim() === "") continue;
    byUnit.set(
      `${binding.productId}::${binding.variantId}`,
      Object.freeze({ amountCents: amountCents as number, currency }),
    );
  }
  return byUnit;
}

/**
 * Create the provider. Artifact validation happens ONCE here; an artifact
 * that fails the accepted schema/count/profile pinning yields a provider
 * that answers null for everyone (and says why, once, through `warn`).
 */
export function createKrisBuyerScopedPricing(
  deps: KrisBuyerScopedPricingDeps,
): BuyerScopedPricing {
  const warn = deps.warn ?? ((message: string) => {
    // eslint-disable-next-line no-console
    console.warn(`[kris-buyer-pricing] ${message}`);
  });

  const authority = resolveKrisVolumePartnerPricingAuthority(
    deps.artifact,
    ACCEPTED_KRIS_VOLUME_PARTNER_CATALOG_SHA,
  );
  if (authority === null) {
    warn(
      "the runtime Kris artifact failed accepted-catalog validation; buyer-scoped pricing stays closed",
    );
    return { forCustomer: async () => null };
  }

  const overlay =
    (deps.artifact as { priceOverlays?: { KRIS_VOLUME_PARTNER?: Record<string, OverlayEntry> } })
      .priceOverlays?.KRIS_VOLUME_PARTNER ?? {};
  const priceByUnit = buildUnitPriceMap(deps.krisBindings, overlay);
  if (priceByUnit.size === 0) {
    warn("no reviewed binding maps to a priced overlay row; buyer-scoped pricing stays closed");
    return { forCustomer: async () => null };
  }

  return {
    async forCustomer(customerRef: string): Promise<BuyerPriceSheet | null> {
      const member = await deps.bindings.memberForCustomer(customerRef);
      if (member === null) return null;

      const pricing: B2BBuyerPricingForMember | null =
        await resolveB2BBuyerPricingForMember(deps.bridge, member.memberId);
      if (pricing === null) return null;
      if (pricing.profileKey !== "KRIS_VOLUME_PARTNER") return null;
      if (pricing.profileVersion !== authority.profileVersion) return null;
      if (!instantsEqual(pricing.profileEffectiveAt, authority.profileEffectiveAt)) return null;

      return Object.freeze({
        profileKey: pricing.profileKey,
        entitlementId: pricing.entitlementId,
        priceFor(productId: string, variantId: string): BuyerScopedUnitPrice | null {
          return priceByUnit.get(`${productId}::${variantId}`) ?? null;
        },
      });
    },
  };
}
