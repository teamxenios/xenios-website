/**
 * Private Early Access: the REAL declared-facts reader. Server only. The only
 * I/O is the inventory reader's own.
 *
 * WHAT THIS FILE IS
 *
 * `product-control-source.ts` reads identity, content, variants, prices, and
 * media from Product Control. Six of the facts an Early Access sale needs do
 * not live on a Product Control product record, and the adapter shipped with
 * every one of them absent, so every unit projected held. This file supplies
 * the ones that DO have a real source, from the systems that already own them:
 *
 *   fulfilment      research_inventory_lots plus the research_lot_is_allocatable
 *                   RPC, through the member catalog's own exported reader. The
 *                   member catalog and Early Access therefore get one answer to
 *                   "may this lot be allocated", not two.
 *   documentation   the lot COA presentation from that same allocatable read,
 *                   so the two can never disagree about the same lots.
 *   supplier        the founder's recorded per-lane fulfilment owner
 *                   (catalog/legacy-adapter.ts), joined on the Product Control
 *                   product's own lane.
 *   audience        the member catalog's own memberAudience derivation, applied
 *                   to the member row the server-side guard already
 *                   authenticated for THIS request.
 *   offer state     the shared private-lane offer state machine
 *                   (@shared/research/catalog/offer-readiness), fed from the
 *                   real Product Control record, the real resolved price, and
 *                   the real lot documentation.
 *   disputes        the founder-locked canonical record
 *                   (products-diagnostics/variant-canonical-record.ts), which
 *                   is an INDEPENDENT second record of the same unit.
 *
 * WHAT IS STILL ABSENT, AND STAYS ABSENT
 *
 * The per-order quantity ceiling and the variant-bound image have no store in
 * this repository. Both resolve to null here, which blocks, and both are
 * blockers a founder release may bridge by supplying the missing fact itself.
 * They are named in `EARLY_ACCESS_UNSOURCED_FACTS`.
 *
 * THE RULE
 *
 * Nothing in this file invents a fact. Every value either comes from a system
 * of record or is the value that holds the unit. A read that FAILS throws, and
 * the caller turns that into an operational error, because "we could not look"
 * and "there is nothing there" are different answers and a customer must never
 * be shown the second when the first is true.
 */

import type {
  AdminProductDetail,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type {
  CartAudienceEligibility,
  CartInventoryEligibility,
} from "@shared/research/cart-product-selection";
import { isVerifiedEarlyAccessCustomer } from "../routes/ports";
import { supplierConfirmedFulfillmentFact } from "../ops/supplier-confirmation";
import type { UnitHoldReader } from "../ops/unit-holds";
import type { EarlyAccessHoldBlocker } from "./eligibility";
import type { ProductAvailability, ProductLane } from "@shared/research/catalog";
import {
  resolvePrivateLaneOfferMode,
  type CoaEvidenceState,
  type OfferAvailabilityMode,
  type OfferLane,
} from "@shared/research/catalog/offer-readiness";
import { normalizePriceCurrency } from "@shared/research/pricing";
import type { MemberRow } from "../../member-auth";
import { fulfillmentOwnerForLane } from "../../catalog/legacy-adapter";
import {
  memberAudience,
  type VariantInventoryFactsReader,
} from "../../catalog/member-catalog-service";
import { decideProductControlPrice } from "../../products-diagnostics/product-control-price-resolver";
import { readVariantCanonicalRecord } from "../../products-diagnostics/variant-canonical-record";
import type {
  EarlyAccessDisputeState,
  EarlyAccessVariantFacts,
} from "./eligibility";
// Types only. A value import from product-control-source.ts would close a
// module cycle, because that file constructs this reader in its production
// wiring; a type import is erased and cannot.
import type {
  EarlyAccessCatalogContext,
  EarlyAccessDeclaredFactsReader,
  EarlyAccessDeclaredProductFacts,
} from "./product-control-source";

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

/**
 * The server-authorized audience for one request, or null when none was
 * authorized.
 *
 * It is a seam rather than a member row so a caller with no member concept (the
 * founder review screen) supplies null explicitly and the unit stays held,
 * instead of a null member row being read as "audience does not apply".
 */
export interface EarlyAccessAudienceSource {
  authorize(
    context: EarlyAccessCatalogContext,
    evaluatedAt: string,
  ): CartAudienceEligibility | null;
}

/**
 * The one audience derivation Early Access uses.
 *
 * It delegates to the member catalog's exported `memberAudience`, so the
 * sourceVersion an Early Access row was authorized under is byte-identical to
 * the one the member catalog and the pricing adapter produce for the same
 * member. A request with no authenticated member yields null, which blocks.
 */
export const MEMBER_ROW_AUDIENCE_SOURCE: EarlyAccessAudienceSource = {
  authorize(context, evaluatedAt) {
    const member: MemberRow | null | undefined = context.member;
    if (member === null || member === undefined) return null;
    return memberAudience(member, evaluatedAt);
  },
};

/**
 * THE customer audience for Private Early Access, and the default.
 *
 * It reads ONLY `context.earlyAccessCustomer`: the customer the identity
 * directory resolved from the session's verified binding, which exists only
 * for an APPROVED customer. Everything else is null and blocks:
 *
 *   - a password-only session (portal access is not identity),
 *   - an unapproved, suspended, or revoked customer (the directory refuses),
 *   - a signed-in member who never became an Early Access customer (member is
 *     a different audience and is deliberately NOT read here, so a member row
 *     can never silently substitute for Early Access approval),
 *   - anything the browser claims about who it is (context is server-built).
 *
 * AND, since the verified-link gate, a customer bound only by EMAIL ENTRY.
 * That binding is an address typed under a password every invited person
 * holds, so it names a customer without proving anyone is them. Authorizing
 * the PRIVATE_EARLY_ACCESS audience from it would put this customer's prices
 * and purchase controls in front of whoever typed their address. The
 * projection therefore has no audience, every unit reports
 * AUDIENCE_NOT_PERMITTED, and nothing carries a price.
 *
 * THIS IS THE CATALOGUE GATE. Deleting the verified check below is the
 * disposable mutation the email-entry isolation tests exist to catch.
 *
 * The provenance names the exact customer, so a projection is attributable to
 * the person it was authorized for.
 */
export const EARLY_ACCESS_CUSTOMER_AUDIENCE_SOURCE: EarlyAccessAudienceSource = {
  authorize(context, evaluatedAt) {
    const customer = context.earlyAccessCustomer ?? null;
    if (customer === null) return null;
    if (!isVerifiedEarlyAccessCustomer(customer)) return null;
    const reference = customer.customerRef?.trim() ?? "";
    if (reference.length === 0) return null;
    return {
      audience: "private_early_access",
      state: "authorized",
      sourceVersion: `early_access_customer:${reference}`,
      evaluatedAt,
    };
  },
};

/**
 * The audience a FOUNDER REVIEW is evaluated under. Never a customer's.
 *
 * A founder deciding whether a unit may be released is not a member, and has no
 * member row to derive an audience from. Projecting their review with no
 * audience at all would report AUDIENCE_NOT_PERMITTED on every unit, which is
 * true of the reviewer and says nothing about the unit, and would make every
 * unit permanently unreleasable for a reason the founder cannot act on.
 *
 * So the review is evaluated under an audience the ADMIN GUARD authorized: a
 * named human, authenticated server-side, asking what a member could be sold.
 * Three properties keep that from becoming a way to sell anything:
 *
 *   1. It is only ever constructed by the founder review and founder release
 *      routes, both behind the admin guard. The customer catalog route resolves
 *      its audience from the customer's own member row and never from this.
 *   2. It changes no unit-level check. `audiencePermitted` still requires
 *      `variant.memberEligible`, so a variant that is not member-eligible is
 *      still refused, which is the only audience question about the UNIT.
 *   3. The resolved amount does not depend on which authorized member audience
 *      asked, so the release fingerprint a founder approves against is the same
 *      one a real member's projection produces. A review taken any other way
 *      would produce approvals that go stale the instant a customer looked.
 *
 * A source built with this reads ONLY `context.reviewActor` and a source built
 * with `MEMBER_ROW_AUDIENCE_SOURCE` reads ONLY `context.member`, so a review
 * actor that somehow reached a customer context authorizes nothing there, and a
 * member row that reached a review context authorizes nothing here.
 */
export const REVIEW_AUDIENCE_SOURCE: EarlyAccessAudienceSource = {
  authorize(context, evaluatedAt) {
    const actor = context.reviewActor?.trim() ?? "";
    // A blank actor is not a named human, and a review with no named human
    // behind it authorizes nothing.
    if (actor.length === 0) return null;
    // The review asks what a PRIVATE_EARLY_ACCESS customer could be sold,
    // because that is the only audience Early Access sells to. Evaluating the
    // review under any other audience would approve releases whose
    // fingerprints no real customer projection ever reproduces.
    return {
      audience: "private_early_access",
      state: "authorized",
      sourceVersion: `founder_review:${actor}`,
      evaluatedAt,
    };
  },
};

// ---------------------------------------------------------------------------
// Offer state
// ---------------------------------------------------------------------------

/** Lanes the shared offer state machine serves. Anything else is not offerable. */
const OFFER_LANES_BY_PRODUCT_LANE: Readonly<Partial<Record<ProductLane, OfferLane>>> = {
  supplement: "supplement",
  research_material: "research_material",
  quantum: "quantum",
};

/** Product Control availability states that can transact at all. */
const TRANSACTING_AVAILABILITY: ReadonlySet<ProductAvailability> =
  new Set<ProductAvailability>(["in_stock", "low_stock"]);

/**
 * The lab-evidence state for one exact unit, from the lot COA presentation and
 * the product's own quality document state.
 *
 * `ON_FILE` needs BOTH: a verified lot certificate and an approved product
 * quality document. Either one alone leaves a gap the offer state machine
 * treats as pending, which is the direction that holds the unit.
 */
export function coaEvidenceFor(
  qualityDocumentState: AdminProductDetail["qualityDocumentState"],
  lotCoaState: "verified" | "required" | "not_applicable" | null,
): CoaEvidenceState {
  if (lotCoaState === null) return "PENDING_LAB_DOCUMENTATION";
  if (lotCoaState === "not_applicable") return "NOT_APPLICABLE";
  if (lotCoaState === "required") return "NOT_ON_FILE";
  return qualityDocumentState === "approved" ? "ON_FILE" : "PENDING_LAB_DOCUMENTATION";
}

/**
 * The resolved offer mode for one exact unit.
 *
 * Every input is a real Product Control or inventory fact. `unavailable` is set
 * by any of the states that mean this unit may not transact at all, including a
 * recorded regulatory hold, so a held compound resolves to `UNAVAILABLE`
 * exactly as `resolveVariantAvailability` resolves it in the founder-locked
 * catalog. The private-lane entry point pins direct checkout off.
 */
export function resolveEarlyAccessOfferState(input: {
  readonly product: AdminProductDetail;
  readonly variant: AdminProductVariant;
  readonly approvedAmountCents: number | null;
  readonly coaEvidence: CoaEvidenceState;
  readonly regulatoryHold: boolean;
}): OfferAvailabilityMode {
  const lane = OFFER_LANES_BY_PRODUCT_LANE[input.product.lane];
  if (lane === undefined) {
    // The lane is not one the offer state machine serves, so there is no
    // truthful offer to make. Named rather than defaulted, because a lane added
    // upstream must land here as UNAVAILABLE rather than as an unhandled case.
    return "UNAVAILABLE";
  }
  const unavailable =
    input.regulatoryHold ||
    input.product.status !== "published" ||
    !input.product.active ||
    input.product.visibility === "hidden" ||
    input.product.commerceApproval !== "approved" ||
    !TRANSACTING_AVAILABILITY.has(input.product.availability) ||
    input.variant.status !== "approved" ||
    !input.variant.active;
  return resolvePrivateLaneOfferMode({
    lane,
    approvedMemberAmountCents: input.approvedAmountCents,
    supplierSkuCode: input.variant.catalogNumber,
    internalVariantSku: input.variant.sku,
    coaEvidence: input.coaEvidence,
    unavailable,
  });
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

/**
 * The one question the fulfillment projection asks the supplier-confirmation
 * store. Satisfied by `SupplierConfirmationStore.liveForUnit`; kept structural
 * here so this reader depends on the question, not the store.
 */
export interface SupplierConfirmationLiveReader {
  liveForUnit(
    productId: string,
    variantId: string,
    now: string,
  ): Promise<import("../ops/supplier-confirmation").SupplierConfirmation | null>;
}

export interface ProductControlDeclaredFactsDependencies {
  readonly inventory: VariantInventoryFactsReader;
  /** Defaults to the member-row derivation. Injected so a test needs no member. */
  readonly audience?: EarlyAccessAudienceSource;
  /** The settlement currency. Resolved once by the catalog source and passed in. */
  readonly currency: string;
  /**
   * SUPPLIER_CONFIRMED_ON_DEMAND. When allocatable inventory does not make a
   * unit fulfillable, a LIVE supplier confirmation for the EXACT unit does:
   * Samuel manually confirms supply with the supplier, records it as an
   * expiring named-human commitment, and the fulfillment fact carries that
   * confirmation's provenance. Expiry returns the unit to held automatically,
   * exactly like a stale founder release, because liveness is derived from
   * the clock at every read. Absent (the default), fulfillment remains
   * inventory-only and every lot-less unit truthfully blocks.
   */
  readonly supplierConfirmations?: SupplierConfirmationLiveReader;
  /**
   * Recorded prohibitions, loaded at EVERY projection (QA R4). An active
   * REGULATORY_HOLD, RECALL, STOP_SHIP, or SUPPLIER_QUALITY_HOLD recorded
   * after a founder release lands in the blockers on the next read, makes
   * the release fingerprint stale, and refuses the release under its own
   * non-waivable name. Absent (the default), only the canonical record's
   * regulatory hold applies.
   */
  readonly holds?: UnitHoldReader;
}

/**
 * A read behind this reader failed.
 *
 * Distinct from an empty result for the same reason the catalog source's own
 * error is: a broken inventory read must never project as a unit that simply
 * has no stock, because that reads as a truthful "unavailable" when it is not.
 */
export class EarlyAccessDeclaredFactsError extends Error {}

export class ProductControlDeclaredFactsReader
  implements EarlyAccessDeclaredFactsReader
{
  private readonly inventory: VariantInventoryFactsReader;
  private readonly audience: EarlyAccessAudienceSource;
  private readonly currency: string;
  private readonly supplierConfirmations: SupplierConfirmationLiveReader | null;
  private readonly holds: UnitHoldReader | null;

  constructor(dependencies: ProductControlDeclaredFactsDependencies) {
    this.inventory = dependencies.inventory;
    this.audience = dependencies.audience ?? EARLY_ACCESS_CUSTOMER_AUDIENCE_SOURCE;
    this.currency = dependencies.currency;
    this.supplierConfirmations = dependencies.supplierConfirmations ?? null;
    this.holds = dependencies.holds ?? null;
  }

  async readDeclaredFacts(input: {
    readonly products: readonly AdminProductDetail[];
    readonly now: Date;
    readonly context?: EarlyAccessCatalogContext;
  }): Promise<readonly EarlyAccessDeclaredProductFacts[]> {
    const evaluatedAt = input.now.toISOString();
    const context = input.context ?? {};
    const audience = this.audience.authorize(context, evaluatedAt);
    return Promise.all(
      input.products.map((product) =>
        this.readProductFacts(product, audience, evaluatedAt),
      ),
    );
  }

  private async readProductFacts(
    product: AdminProductDetail,
    audience: CartAudienceEligibility | null,
    evaluatedAt: string,
  ): Promise<EarlyAccessDeclaredProductFacts> {
    const variantFacts = await Promise.all(
      product.variants.map((variant) =>
        this.readVariantFacts(product, variant, audience, evaluatedAt),
      ),
    );
    return { productId: product.id, audience, variantFacts };
  }

  private async readVariantFacts(
    product: AdminProductDetail,
    variant: AdminProductVariant,
    audience: CartAudienceEligibility | null,
    evaluatedAt: string,
  ): Promise<EarlyAccessVariantFacts> {
    let inventory;
    try {
      inventory = await this.inventory.readVariantInventoryFacts({
        productId: product.id,
        variant,
        evaluatedAt,
      });
    } catch (cause) {
      throw new EarlyAccessDeclaredFactsError(
        `Inventory and lot documentation could not be read for ${variant.sku}.`,
        { cause },
      );
    }

    const canonical = readVariantCanonicalRecord(
      { canonicalName: product.canonicalName, slug: product.slug },
      { sku: variant.sku, catalogNumber: variant.catalogNumber, strength: variant.strength },
    );

    const coaEvidence = coaEvidenceFor(
      product.qualityDocumentState,
      inventory.lotCoa.state,
    );
    // Recorded prohibitions for THIS projection instant, merged with the
    // canonical record's own regulatory hold. Loaded fresh every read, so a
    // hold recorded after a release is in this answer, not the next deploy's.
    const activeHolds = await this.activeHoldsFor(
      product,
      variant,
      evaluatedAt,
      canonical.regulatoryHoldReason !== null,
    );
    const offerState = resolveEarlyAccessOfferState({
      product,
      variant,
      approvedAmountCents: this.approvedAmountCents(product, variant, audience, evaluatedAt),
      coaEvidence,
      regulatoryHold: activeHolds.includes("REGULATORY_HOLD"),
    });

    const fulfillmentOwner = fulfillmentOwnerForLane(product.lane);
    return {
      variantId: variant.id,
      // The two facts with no store anywhere in this repository. Null blocks,
      // and a founder release may bridge either by supplying it (see
      // EARLY_ACCESS_UNSOURCED_FACTS).
      quantityLimit: null,
      image: null,
      supplier:
        fulfillmentOwner === "not_assigned"
          ? null
          : {
              variantId: variant.id,
              fulfillmentOwner,
              // The provenance is the exact product fact the assignment was
              // derived from. A lane change therefore changes the version, and
              // a release pinned to the old one goes stale rather than
              // silently covering a unit somebody else now ships.
              sourceVersion: `lane:${product.lane}@${product.updatedAt}`,
            },
      fulfillment: await this.fulfillmentFact(product, variant, inventory.inventory, evaluatedAt),
      documentation: inventory.lotCoa,
      offerState,
      identityDispute: identityDisputeState(canonical.identity),
      // The recorded dispute wins over anything declared here anyway
      // (eligibility.earlyAccessStrengthDisputeState). This is the state for a
      // unit with NO recorded dispute: cleared only when a second, independent
      // record names the same presentation, and unknown otherwise.
      strengthDispute: canonical.presentationCorroborated ? "cleared" : "unknown",
      activeHolds,
    };
  }

  /**
   * Active recorded holds for one exact unit, merged with the canonical
   * record's regulatory hold. A broken registry read RAISES: "could not
   * check the prohibitions" must never render as "nothing prohibits".
   */
  private async activeHoldsFor(
    product: AdminProductDetail,
    variant: AdminProductVariant,
    evaluatedAt: string,
    canonicalRegulatoryHold: boolean,
  ): Promise<readonly EarlyAccessHoldBlocker[]> {
    let recorded: readonly EarlyAccessHoldBlocker[] = [];
    if (this.holds !== null) {
      try {
        recorded = await this.holds.activeHoldsForUnit(product.id, variant.id, evaluatedAt);
      } catch (cause) {
        throw new EarlyAccessDeclaredFactsError(
          `Recorded holds could not be read for ${variant.sku}.`,
          { cause },
        );
      }
    }
    if (!canonicalRegulatoryHold) return recorded;
    return ["REGULATORY_HOLD", ...recorded.filter((hold) => hold !== "REGULATORY_HOLD")];
  }

  /**
   * Fulfillment for one exact unit: allocatable inventory when it makes the
   * unit eligible, otherwise a LIVE supplier confirmation projected with its
   * own provenance, otherwise the blocking inventory answer unchanged.
   *
   * A broken confirmation read RAISES, for the same reason a broken inventory
   * read does: "could not check the supplier commitment" must never render as
   * a truthful "unavailable".
   */
  private async fulfillmentFact(
    product: AdminProductDetail,
    variant: AdminProductVariant,
    inventoryFact: CartInventoryEligibility | null,
    evaluatedAt: string,
  ): Promise<CartInventoryEligibility | null> {
    if (inventoryFact !== null && inventoryFact.state === "eligible") return inventoryFact;
    if (this.supplierConfirmations === null) return inventoryFact;
    let confirmation;
    try {
      confirmation = await this.supplierConfirmations.liveForUnit(
        product.id,
        variant.id,
        evaluatedAt,
      );
    } catch (cause) {
      throw new EarlyAccessDeclaredFactsError(
        `Supplier confirmations could not be read for ${variant.sku}.`,
        { cause },
      );
    }
    if (confirmation === null) return inventoryFact;
    return (
      supplierConfirmedFulfillmentFact(confirmation, {
        productId: product.id,
        variantId: variant.id,
        evaluatedAt,
      }) ?? inventoryFact
    );
  }

  /**
   * The one approved Product Control amount for this unit, or null.
   *
   * It is resolved here only as an INPUT to the offer state machine, which asks
   * whether a founder-approved amount exists at all. The amount a customer sees
   * is resolved separately by `resolveEarlyAccessPrice`, from the same rows, so
   * nothing downstream depends on this call having happened.
   */
  private approvedAmountCents(
    product: AdminProductDetail,
    variant: AdminProductVariant,
    audience: CartAudienceEligibility | null,
    evaluatedAt: string,
  ): number | null {
    if (audience === null) return null;
    const currency = normalizePriceCurrency(this.currency);
    if (currency === null) return null;
    const decision = decideProductControlPrice({
      productId: product.id,
      variant,
      prices: product.prices,
      audienceEligibility: audience,
      currency,
      evaluatedAt,
    });
    return decision.ok ? decision.price.amountCents : null;
  }
}

function identityDisputeState(
  corroboration: ReturnType<typeof readVariantCanonicalRecord>["identity"],
): EarlyAccessDisputeState {
  // `unrecorded` is deliberately `unknown` rather than `cleared`. One record
  // cannot corroborate itself, and a unit no second record has ever named is
  // not a unit whose identity anyone has checked.
  if (corroboration === "corroborated") return "cleared";
  if (corroboration === "contradicted") return "open";
  return "unknown";
}
