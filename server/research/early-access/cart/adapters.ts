import { decideEarlyAccessRelease, type EarlyAccessReleaseLedger } from "../release/founder-release";
import { resolveFounderHeldUnits } from "../release/founder-first-release-seed";
import { buildEarlyAccessStorefront } from "../release/storefront-view";
import type { EarlyAccessCatalogSource } from "../release/release-routes";
import {
  EARLY_ACCESS_PROMOTIONS,
  earlyAccessPromotionDiscountCents,
  earlyAccessPromotionFor,
} from "../commerce/promotion";
import type {
  EarlyAccessAgreementGate,
  EarlyAccessShippingPolicy,
  EarlyAccessSupplierDirectory,
} from "../routes/ports";
import type {
  CartCatalogUnit,
  CartCustomer,
  CartReleaseDecision,
  CartSupplierRoute,
  EarlyAccessCartAgreementPort,
  EarlyAccessCartCatalogPort,
  EarlyAccessCartReleasePort,
  EarlyAccessCartShippingPort,
  EarlyAccessCartSupplierPort,
} from "./ports";

/**
 * The cart's ports, bound to the seams Early Access already uses.
 *
 * THE POINT OF THIS FILE IS THAT THERE IS NO SECOND RUNTIME. A cart is a new
 * shape of request, not a new set of facts, so every answer it needs is taken
 * from the module that already owns that answer:
 *
 *   what may be sold  -> buildEarlyAccessStorefront, the SAME projection the
 *                        customer's catalogue route renders
 *   at what price     -> decideEarlyAccessRelease, the founder release bridge
 *   with what discount-> the versioned promotion table
 *   by which supplier -> the mounted EarlyAccessSupplierDirectory
 *   to which address  -> the mounted EarlyAccessShippingPolicy
 *   for whom          -> the mounted agreement gate
 *
 * If any of these were re-implemented here, the cart could disagree with the
 * shelf the customer just looked at, and a disagreement about price or
 * availability between two server paths is indistinguishable to a customer
 * from being lied to.
 */

/**
 * The catalogue, projected exactly as the customer's catalogue route projects
 * it: same scope, same derived founder-held units, same release ledger, same
 * instant. A unit the shelf shows as purchasable is purchasable here, and a
 * unit it holds is held here, by construction rather than by agreement.
 */
export class StorefrontCartCatalog implements EarlyAccessCartCatalogPort {
  constructor(
    private readonly deps: Readonly<{
      catalog: EarlyAccessCatalogSource;
      releases: EarlyAccessReleaseLedger;
    }>,
  ) {}

  async units(nowMs: number, customer: CartCustomer): Promise<readonly CartCatalogUnit[]> {
    // The SAME customer context the single-order path passes, so the cart
    // projects under the identical audience the storefront showed this
    // customer, never an anonymous one.
    const projection = await this.deps.catalog.load(new Date(nowMs), {
      earlyAccessCustomer: { customerRef: customer.customerRef },
    });
    const releases = await this.deps.releases.all();
    const storefront = buildEarlyAccessStorefront({
      projection,
      releases,
      scope: "released_units",
      founderHeldUnits: resolveFounderHeldUnits(projection.rows),
    });

    // `supplierReady` is not on the storefront unit, because it is an
    // operational fact rather than a customer-facing one. It is read from the
    // projection row the storefront was built from, keyed by the same exact
    // unit, so the two cannot drift apart.
    const rowByUnit = new Map(
      projection.rows.map((row) => [`${row.productId}\u0000${row.variantId}`, row]),
    );

    return Object.freeze(
      storefront.units.map((unit) => {
        const row = rowByUnit.get(`${unit.productId}\u0000${unit.variantId}`);
        return Object.freeze({
          productId: unit.productId,
          variantId: unit.variantId,
          displayName: unit.displayName,
          strength: unit.strength ?? "",
          sku: unit.sku,
          purchasable: unit.purchasable,
          availability: unit.availability,
          priceCents: unit.priceCents,
          currency: unit.currency,
          quantityLimit: unit.quantityLimit,
          // Absent means NOT ready. A missing row cannot read as a supplier we
          // have, which is the direction that refuses a sale rather than
          // promising a box nobody ships.
          supplierReady: row?.supplierReady === true,
        });
      }),
    );
  }
}

/**
 * Price and promotion for one line, from the founder release bridge and the
 * versioned promotion table.
 *
 * The discount is computed by `earlyAccessPromotionDiscountCents` in the same
 * integer arithmetic the single-product order uses, from a promotion resolved
 * by QUANTITY ALONE. A cart line therefore cannot name its own discount, and
 * three units in a cart are discounted exactly as three units bought singly.
 */
export class FounderReleaseCartPricing implements EarlyAccessCartReleasePort {
  constructor(
    private readonly deps: Readonly<{
      catalog: EarlyAccessCatalogSource;
      releases: EarlyAccessReleaseLedger;
    }>,
  ) {}

  async decide(
    input: Readonly<{ unit: CartCatalogUnit; quantity: number; nowMs: number; customer: CartCustomer }>,
  ): Promise<CartReleaseDecision> {
    // THE CUSTOMER'S OWN AUDIENCE, not an anonymous one.
    //
    // This used to load the projection with `{}`. On a hand-made fixture
    // catalogue that is invisible, because the fixture answers the same way to
    // everyone. On the REAL Product Control projection the audience is derived
    // from the caller, and an empty context authorizes no audience at all, so
    // every unit came back AUDIENCE_NOT_PERMITTED and every cart line was
    // refused PRODUCT_HELD.
    //
    // The effect on a customer: the catalogue offered 18 purchasable units and
    // the cart refused every one of them as held, which reads as being lied to
    // by the same server that had just made the offer. Found in a real browser
    // against the real catalogue, then pinned by cart-shelf-agreement.test.ts.
    //
    // Same context the storefront and the catalogue route project under, so
    // price and availability are decided for the person actually buying.
    const projection = await this.deps.catalog.load(new Date(input.nowMs), {
      earlyAccessCustomer: { customerRef: input.customer.customerRef },
    });
    const matches = projection.rows.filter(
      (row) =>
        row.productId === input.unit.productId && row.variantId === input.unit.variantId,
    );
    // One row, or nothing. An ambiguous unit answers exactly like an absent
    // one, so a duplicate row cannot be probed for.
    if (matches.length !== 1) {
      return Object.freeze({ released: false as const, code: "PRODUCT_NOT_FOUND" as const });
    }

    const releases = await this.deps.releases.all();
    const decision = decideEarlyAccessRelease({
      row: matches[0]!,
      releases,
      now: input.nowMs,
    });
    if (!decision.released) {
      return Object.freeze({ released: false as const, code: holdToLineFailure(decision.hold) });
    }

    // THE FOUNDER RELEASE IS A QUANTITY AUTHORITY, NOT ONLY A PRICE SOURCE.
    //
    // Product Control deliberately projects `quantityLimit: null` today. The
    // quote service therefore cannot enforce the founder's durable ceiling
    // from the catalogue unit alone. This comparison keeps the effective cap
    // at the strictest of all three authorities:
    //
    //   global band (normalizeCartItems)
    //   Product Control, when declared (quote-service)
    //   founder release (here)
    //
    // It is especially important before M66: the direct application and the
    // accepted production release both stop at 20. A separate request intake
    // may route a quantity beyond explicit durable authority to an order
    // request, but none of those values reaches here.
    if (input.quantity > decision.approvedQuantityLimit) {
      return Object.freeze({ released: false as const, code: "QUANTITY_INVALID" as const });
    }

    const promotion = earlyAccessPromotionFor(input.quantity, EARLY_ACCESS_PROMOTIONS);
    if (promotion === null) {
      // The round offers no rule for this quantity, which is a quantity
      // problem and is reported as one.
      return Object.freeze({ released: false as const, code: "QUANTITY_INVALID" as const });
    }
    const subtotalCents = decision.priceCents * input.quantity;
    const discountCents = earlyAccessPromotionDiscountCents(
      subtotalCents,
      promotion.discountBasisPoints,
    );

    return Object.freeze({
      released: true as const,
      priceCents: decision.priceCents,
      currency: decision.currency as "USD",
      promotion: Object.freeze({
        promotionId: promotion.promotionId,
        version: promotion.promotionVersion,
        label: promotion.label,
        discountCents,
      }),
    });
  }
}

/**
 * The founder-release hold vocabulary, mapped to the cart's line vocabulary.
 *
 * Typed against the hold union with no default branch, exactly as the
 * single-order route's `holdFailure` is, so a hold added to the bridge later
 * is a compile error here rather than a line that quietly sells.
 */
function holdToLineFailure(
  hold: Extract<ReturnType<typeof decideEarlyAccessRelease>, { released: false }>["hold"],
): "PRODUCT_HELD" | "RELEASE_REQUIRED" | "RELEASE_STALE" | "RELEASE_REVOKED" {
  switch (hold) {
    case "NO_FOUNDER_RELEASE":
      return "RELEASE_REQUIRED";
    case "RELEASE_REVOKED":
      return "RELEASE_REVOKED";
    case "RELEASE_STALE":
      return "RELEASE_STALE";
    case "RELEASE_EXPIRED":
      return "RELEASE_STALE";
    case "NONWAIVABLE_BLOCKER":
      return "PRODUCT_HELD";
    case "BLOCKERS_NOT_WAIVED":
      return "PRODUCT_HELD";
  }
}

/** The mounted supplier directory, unchanged. The cart adds no route of its own. */
export class DirectoryCartSuppliers implements EarlyAccessCartSupplierPort {
  constructor(private readonly suppliers: EarlyAccessSupplierDirectory) {}

  async forUnit(productId: string, variantId: string): Promise<CartSupplierRoute | null> {
    const assignment = await this.suppliers.forUnit(productId, variantId);
    if (assignment === null) return null;
    return Object.freeze({
      supplierId: assignment.supplierId,
      supplierSku: assignment.supplierSku,
    });
  }
}

/**
 * The mounted shipping policy, plus ONE order-level shipping amount.
 *
 * Zero for the pilot, and zero deliberately: the founder has approved no
 * shipping price, and inventing one would be the browser's arithmetic problem
 * moved server-side. It is a single order-level figure rather than a per-line
 * one, so a five-line cart is never charged five times for one parcel.
 */
export class PolicyCartShipping implements EarlyAccessCartShippingPort {
  constructor(private readonly shipping: EarlyAccessShippingPolicy) {}

  async serves(destination: { country: string; region: string; postalCode: string }): Promise<boolean> {
    return this.shipping.serves(destination as never);
  }

  async quote(): Promise<Readonly<{ currency: "USD"; shippingCents: number }>> {
    return Object.freeze({ currency: "USD" as const, shippingCents: 0 });
  }
}

/** The mounted agreement gate, unchanged: no cart quotes without the policy on file. */
export class GateCartAgreements implements EarlyAccessCartAgreementPort {
  constructor(private readonly agreements: EarlyAccessAgreementGate) {}

  async accepted(customerRef: string): Promise<boolean> {
    return this.agreements.accepted(customerRef);
  }
}
