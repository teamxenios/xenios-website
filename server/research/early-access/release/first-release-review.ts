/**
 * The founder's first-release review. Server only, pure, no clock, no I/O.
 *
 * WHAT THIS ANSWERS
 *
 * "Which units could a named human release into Private Early Access today, and
 * for the rest, what exactly is stopping each one and who has to fix it."
 *
 * The projection already reports WHY a unit is held, as machine codes. That is
 * the right output for a customer surface and the wrong one for a founder
 * sitting down to decide: a list of thirteen codes per row does not say whether
 * the next step is counsel, Product Control, operations, or the founder's own
 * pen. This module reduces each row to ONE classification and ONE recommended
 * action, without discarding the codes.
 *
 * THE TWO KINDS OF BLOCKER, AND WHY THE SPLIT IS THE WHOLE DESIGN
 *
 * `founder-release.ts` draws the line: a release may bridge operational
 * incompleteness, because none of that changes what is in the vial, and may
 * never bridge uncertainty about the contents themselves. This module reads
 * that same line through `mayWaiveBlocker`, so the two can never disagree, and
 * adds the codes that line already anticipates but the Early Access eligibility
 * vocabulary does not yet emit:
 *
 *   REGULATORY_HOLD   the founder-locked catalog records this compound as held
 *                     pending a founder decision and counsel review.
 *   FORMULA_UNKNOWN   two independent records disagree about a BLEND's
 *                     composition, so we do not know what is in the vial.
 *
 * Both are already in `EARLY_ACCESS_NONWAIVABLE_BLOCKERS`, so no new policy is
 * invented here; they are derived and surfaced, which is what was missing.
 *
 * NO AMOUNTS COME FROM ANYWHERE BUT PRODUCT CONTROL. The founder-locked catalog
 * holds wholesale costs, draft computations, a superseded published price, and
 * a competitor's shelf price. None of them is read here. The price on a row is
 * the resolved Product Control amount or nothing.
 */

import type { FulfillmentOwner } from "@shared/research/catalog";
import type { EarlyAccessBlocker } from "../catalog/eligibility";
import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "../catalog/early-access-catalog";
import { earlyAccessRowKey } from "../catalog/early-access-catalog";
import {
  readVariantCanonicalRecord,
  type VariantCanonicalRecord,
} from "../../products-diagnostics/variant-canonical-record";
import { earlyAccessReleaseVersion, mayWaiveBlocker } from "./founder-release";

// ---------------------------------------------------------------------------
// The classification vocabulary
// ---------------------------------------------------------------------------

/**
 * Exactly one per unit. The order is the PRECEDENCE order, strongest reason
 * first, so a unit blocked on three things is reported under the one that must
 * be resolved first and by whom.
 */
export const FIRST_RELEASE_CLASSIFICATIONS = [
  "NOT_APPROVABLE_REGULATORY",
  "NOT_APPROVABLE_IDENTITY",
  "NOT_APPROVABLE_FORMULA",
  "NOT_APPROVABLE_STRENGTH",
  "NOT_APPROVABLE_SUPPLIER",
  "NOT_APPROVABLE_FULFILLMENT",
  "NOT_APPROVABLE_PRICE",
  "APPROVABLE_FOR_EARLY_ACCESS",
] as const;

export type FirstReleaseClassification =
  (typeof FIRST_RELEASE_CLASSIFICATIONS)[number];

/**
 * Blocker codes this review derives that the eligibility vocabulary does not
 * emit. Both are already non-waivable in `founder-release.ts`, so surfacing
 * them cannot widen what a founder may do; it can only narrow it.
 */
export const FIRST_RELEASE_DERIVED_BLOCKERS = [
  "REGULATORY_HOLD",
  "FORMULA_UNKNOWN",
] as const;

export type FirstReleaseDerivedBlocker =
  (typeof FIRST_RELEASE_DERIVED_BLOCKERS)[number];

/**
 * Every blocker on a unit, from the projection and from the derived canonical
 * record. Typed as a plain string union because `mayWaiveBlocker` is the single
 * authority on which of them a founder may bridge, and it takes a string.
 */
export type FirstReleaseBlocker = EarlyAccessBlocker | FirstReleaseDerivedBlocker;

// ---------------------------------------------------------------------------
// The derived blockers
// ---------------------------------------------------------------------------

/**
 * The blockers a row carries that Product Control did not report.
 *
 * Exported so the founder release route and the admin screen consult ONE
 * definition. Two implementations of "is this unit regulator-held" is one
 * implementation too many, and the wrong one sells a held compound.
 */
export function earlyAccessDerivedBlockers(
  row: EarlyAccessCatalogRow,
  canonical: VariantCanonicalRecord = canonicalRecordFor(row),
): readonly FirstReleaseDerivedBlocker[] {
  const derived: FirstReleaseDerivedBlocker[] = [];
  if (canonical.regulatoryHoldReason !== null) derived.push("REGULATORY_HOLD");
  // A contested BLEND is a contest about composition. The projection already
  // holds the unit with STRENGTH_DISPUTE_UNRESOLVED, so this adds no new hold;
  // it names the contest correctly so the founder chases the right document.
  if (canonical.contestKind === "formula") derived.push("FORMULA_UNKNOWN");
  return derived;
}

/** The founder-locked second record for a projected row, joined on its SKU. */
export function canonicalRecordFor(
  row: EarlyAccessCatalogRow,
): VariantCanonicalRecord {
  return readVariantCanonicalRecord(
    { canonicalName: row.canonicalName, slug: row.slug },
    { sku: row.sku, catalogNumber: null, strength: row.strength },
  );
}

// ---------------------------------------------------------------------------
// One reviewed unit
// ---------------------------------------------------------------------------

export interface FirstReleaseCandidate {
  readonly productId: string;
  readonly variantId: string;
  readonly slug: string;
  /** The customer-facing product name. */
  readonly product: string;
  readonly canonicalName: string;
  readonly variant: string;
  readonly sku: string;
  readonly strength: string | null;
  readonly presentation: string | null;
  /** The resolved Product Control amount, or null. Never derived, never a guess. */
  readonly priceCents: number | null;
  readonly currency: string;
  readonly supplier: FulfillmentOwner | null;
  /** Plain language, because "mitch" is not an operational instruction on its own. */
  readonly fulfillmentMethod: string;
  readonly inventoryState: EarlyAccessCatalogRow["availability"];
  readonly quantityLimit: number | null;
  readonly waivableBlockers: readonly FirstReleaseBlocker[];
  readonly nonwaivableBlockers: readonly FirstReleaseBlocker[];
  readonly classification: FirstReleaseClassification;
  readonly recommendedAction: string;
  /** The fingerprint a founder approval must echo. */
  readonly productVersion: string;
  /** Set only when a regulatory hold is recorded, so the founder reads the reason. */
  readonly regulatoryHoldReason: string | null;
  /** The one presentation of this product the founder workbook establishes. */
  readonly authoritativePresentation: boolean;
}

/** Early Access ships by hand, so the method is who does it, stated plainly. */
function fulfillmentMethodFor(owner: FulfillmentOwner | null): string {
  if (owner === "mitch") return "Manual, shipped by the supplier partner";
  if (owner === "xenios") return "Manual, shipped by xenios";
  return "None assigned";
}

const RECOMMENDED_ACTIONS: Record<FirstReleaseClassification, string> = {
  NOT_APPROVABLE_REGULATORY:
    "Hold. Counsel review and a founder decision unlock this compound; nothing in Product Control or operations can.",
  NOT_APPROVABLE_IDENTITY:
    "Confirm in Product Control which exact product and variant this is, then re-review.",
  NOT_APPROVABLE_FORMULA:
    "Obtain the supplier's written composition for this blend and reconcile it against the founder-locked formula, then re-review.",
  NOT_APPROVABLE_STRENGTH:
    "Obtain the supplier's written strength for this SKU and settle it against the founder-locked presentation, then re-review.",
  NOT_APPROVABLE_SUPPLIER:
    "Assign a fulfilment owner for this lane in Product Control, then re-review.",
  NOT_APPROVABLE_FULFILLMENT:
    "Receive an allocatable lot for this exact SKU, then re-review.",
  NOT_APPROVABLE_PRICE:
    "Settle the pricing formula for this unit so one approved amount exists, then re-review.",
  APPROVABLE_FOR_EARLY_ACCESS:
    "Ready for a founder release: supply the approved price and per-order quantity limit, confirm supplier and fulfilment, and record the waived operational blockers.",
};

/**
 * The one reason this unit is not releasable, in precedence order.
 *
 * Only NON-WAIVABLE blockers can decide this, because a waivable one is by
 * definition something the release itself supplies. A unit whose every blocker
 * is waivable is approvable, which is exactly what the bridge exists for.
 */
function classify(
  nonwaivable: readonly FirstReleaseBlocker[],
): FirstReleaseClassification {
  const has = (...codes: readonly string[]) =>
    codes.some((code) => nonwaivable.includes(code as FirstReleaseBlocker));

  if (has("REGULATORY_HOLD", "RECALL", "STOP_SHIP", "SUPPLIER_QUALITY_HOLD")) {
    return "NOT_APPROVABLE_REGULATORY";
  }
  if (
    has("IDENTITY_NOT_CONFIRMED", "IDENTITY_DISPUTE_UNRESOLVED", "SKU_IDENTITY_MISMATCH")
  ) {
    return "NOT_APPROVABLE_IDENTITY";
  }
  if (has("FORMULA_UNKNOWN", "COMPONENT_SPLIT_UNKNOWN")) {
    return "NOT_APPROVABLE_FORMULA";
  }
  if (
    has(
      "STRENGTH_NOT_CONFIRMED",
      "STRENGTH_DISPUTE_UNRESOLVED",
      "PRESENTATION_NOT_CONFIRMED",
      "PRESENTATION_DISPUTE_UNRESOLVED",
    )
  ) {
    return "NOT_APPROVABLE_STRENGTH";
  }
  if (has("SUPPLIER_NOT_ASSIGNED")) return "NOT_APPROVABLE_SUPPLIER";
  if (has("FULFILLMENT_UNAVAILABLE")) return "NOT_APPROVABLE_FULFILLMENT";
  // AUDIENCE_NOT_PERMITTED lands here rather than in its own bucket: the
  // audience is resolved per caller at purchase time, and for a founder review
  // the only decision it leaves open is whether this unit may be priced for
  // members at all.
  if (nonwaivable.length > 0) return "NOT_APPROVABLE_PRICE";
  return "APPROVABLE_FOR_EARLY_ACCESS";
}

/**
 * Review one projected row.
 *
 * The blocker split is computed by `mayWaiveBlocker`, never by a list kept
 * here, so a code added to the non-waivable set upstream immediately narrows
 * this review rather than quietly staying approvable.
 */
export function reviewEarlyAccessRow(
  row: EarlyAccessCatalogRow,
): FirstReleaseCandidate {
  const canonical = canonicalRecordFor(row);
  const all: readonly FirstReleaseBlocker[] = [
    ...row.blockers,
    ...earlyAccessDerivedBlockers(row, canonical),
  ];
  const nonwaivable = all.filter((blocker) => !mayWaiveBlocker(blocker));
  const waivable = all.filter((blocker) => mayWaiveBlocker(blocker));
  const classification = classify(nonwaivable);
  return {
    productId: row.productId,
    variantId: row.variantId,
    slug: row.slug,
    product: row.displayName,
    canonicalName: row.canonicalName,
    variant: [row.strength, row.presentation].filter(Boolean).join(", ") || row.sku,
    sku: row.sku,
    strength: row.strength,
    presentation: row.presentation,
    priceCents: row.priceCents,
    currency: row.currency,
    supplier: row.fulfillmentOwner,
    fulfillmentMethod: fulfillmentMethodFor(row.fulfillmentOwner),
    inventoryState: row.availability,
    quantityLimit: row.quantityLimit,
    waivableBlockers: waivable,
    nonwaivableBlockers: nonwaivable,
    classification,
    recommendedAction: RECOMMENDED_ACTIONS[classification],
    productVersion: earlyAccessReleaseVersion(row),
    regulatoryHoldReason: canonical.regulatoryHoldReason,
    authoritativePresentation: canonical.authoritativePresentation,
  };
}

// ---------------------------------------------------------------------------
// The whole review
// ---------------------------------------------------------------------------

export type FirstReleaseCounts = Readonly<
  Record<FirstReleaseClassification, number>
>;

export interface FirstReleaseReview {
  readonly evaluatedAt: string;
  readonly candidates: readonly FirstReleaseCandidate[];
  readonly counts: FirstReleaseCounts;
  /** Products that contributed no unit because they hold no presentation. */
  readonly productsWithoutVariants: readonly string[];
}

export function reviewEarlyAccessCatalog(
  projection: EarlyAccessCatalogProjection,
): FirstReleaseReview {
  const candidates = projection.rows.map(reviewEarlyAccessRow);
  const counts = FIRST_RELEASE_CLASSIFICATIONS.reduce(
    (totals, classification) => ({
      ...totals,
      [classification]: candidates.filter(
        (candidate) => candidate.classification === classification,
      ).length,
    }),
    {} as Record<FirstReleaseClassification, number>,
  );
  return {
    evaluatedAt: projection.evaluatedAt,
    candidates,
    counts,
    productsWithoutVariants: projection.productsWithoutVariants,
  };
}

/** The stable key for a reviewed unit. Identical to the projection's own. */
export function firstReleaseCandidateKey(candidate: FirstReleaseCandidate): string {
  return earlyAccessRowKey({
    productId: candidate.productId,
    variantId: candidate.variantId,
  } as EarlyAccessCatalogRow);
}

/**
 * The units one operational step from being releasable.
 *
 * A unit whose ONLY non-waivable gaps are the inventory ones is a unit nobody
 * has a product question about: identity, formula, presentation, regulatory
 * status, supplier, and audience are all settled, and what is missing is stock
 * on a shelf. That is the shortlist a founder plans a first release around, and
 * it is deliberately not the same thing as "approvable", because a unit with no
 * allocatable lot may not be sold today no matter how well understood it is.
 */
export const OPERATIONAL_ONLY_BLOCKERS: readonly string[] = ["FULFILLMENT_UNAVAILABLE"];

/** Every unit whose only remaining non-waivable gaps are operational-inventory ones. */
export function firstReleaseShortlist(
  review: FirstReleaseReview,
): readonly FirstReleaseCandidate[] {
  return review.candidates.filter(
    (candidate) =>
      candidate.classification === "APPROVABLE_FOR_EARLY_ACCESS" ||
      candidate.nonwaivableBlockers.every((blocker) =>
        OPERATIONAL_ONLY_BLOCKERS.includes(blocker),
      ),
  );
}

/**
 * The units to actually put in a first release.
 *
 * The shortlist above is everything nobody has a product question about, which
 * is most of the catalog and therefore not a recommendation. This narrows it to
 * the ONE presentation per product the founder workbook establishes, because a
 * harvested size is a presentation we recorded rather than one we chose, and a
 * first release is a choice.
 */
export function firstReleaseRecommendation(
  review: FirstReleaseReview,
): readonly FirstReleaseCandidate[] {
  return firstReleaseShortlist(review).filter(
    (candidate) => candidate.authoritativePresentation,
  );
}

// ---------------------------------------------------------------------------
// The committed document
// ---------------------------------------------------------------------------

function money(candidate: FirstReleaseCandidate): string {
  if (candidate.priceCents === null) return "None resolved";
  const amount = (candidate.priceCents / 100).toFixed(2);
  return `${amount} ${candidate.currency}`.trim();
}

function cell(value: string | null): string {
  const text = (value ?? "").trim();
  // A pipe inside a strength or a presentation would break the table row, and a
  // broken row is a row a reader silently misreads.
  return text.length === 0 ? "not recorded" : text.replace(/\|/g, "\\|");
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

/**
 * Render the reviewed first-release list.
 *
 * Pure, so the committed document is a function of the classifier and a
 * projection, and a test can assert the file on disk still equals what the code
 * produces. A document that drifts from the code is worse than no document,
 * because it is trusted.
 */
export function renderFirstReleaseCandidates(input: {
  readonly review: FirstReleaseReview;
  /** Where the projection came from, stated at the top of the document. */
  readonly provenance: readonly string[];
}): string {
  const { review } = input;
  const lines: string[] = [];

  lines.push("# Private Early Access: the reviewed first-release list");
  lines.push("");
  lines.push(
    `Evaluated at ${review.evaluatedAt}. ${review.candidates.length} exact units across ${
      new Set(review.candidates.map((candidate) => candidate.productId)).size
    } products.`,
  );
  lines.push("");
  lines.push("## Where this came from");
  lines.push("");
  for (const line of input.provenance) lines.push(line);
  lines.push("");

  lines.push("## Counts");
  lines.push("");
  lines.push("| Classification | Units |");
  lines.push("| --- | ---: |");
  for (const classification of FIRST_RELEASE_CLASSIFICATIONS) {
    lines.push(`| ${classification} | ${review.counts[classification]} |`);
  }
  lines.push(`| **Total** | **${review.candidates.length}** |`);
  lines.push("");

  const shortlist = firstReleaseShortlist(review);
  const recommended = firstReleaseRecommendation(review);
  lines.push("## The recommended first release");
  lines.push("");
  if (recommended.length === 0) {
    lines.push(
      "No unit is recommended. Every founder-established presentation has an open question about what it is, what is in it, or whether it may ship at all.",
    );
  } else {
    lines.push(
      `${recommended.length} products. Each is the one presentation the founder workbook establishes, and each carries no open question about identity, composition, presentation, regulatory status, supplier, or audience. Every other founder-established presentation in the catalog has a recorded dispute or a recorded hold.`,
    );
    lines.push("");
    lines.push("| Product | SKU | Strength | Presentation | Supplier | Still needed |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const candidate of recommended) {
      const needed = [...candidate.nonwaivableBlockers, ...candidate.waivableBlockers];
      lines.push(
        `| ${cell(candidate.product)} | ${cell(candidate.sku)} | ${cell(candidate.strength)} | ${cell(
          candidate.presentation,
        )} | ${cell(candidate.supplier)} | ${cell(list(needed))} |`,
      );
    }
    lines.push("");
    lines.push(
      `A further ${shortlist.length - recommended.length} units carry no open product question either, but each is a size harvested from a market reference rather than a presentation the founder chose. They are releasable in principle and are not part of a first release.`,
    );
  }
  lines.push("");

  lines.push("## Every unit");
  lines.push("");
  lines.push(
    "One row per exact unit, one classification each. `Waivable` blockers are the operational gaps a founder release may bridge by supplying the missing fact; `non-waivable` blockers are the ones no release may ever bridge, because they are uncertainty about what is in the vial or whether it may lawfully ship.",
  );
  lines.push("");
  for (const classification of FIRST_RELEASE_CLASSIFICATIONS) {
    const rows = review.candidates.filter(
      (candidate) => candidate.classification === classification,
    );
    if (rows.length === 0) continue;
    lines.push(`### ${classification} (${rows.length})`);
    lines.push("");
    lines.push(rows[0].recommendedAction);
    lines.push("");
    lines.push(
      "| Product | Variant | SKU | Strength | Presentation | Price | Supplier | Fulfilment | Inventory | Quantity limit | Waivable | Non-waivable |",
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const candidate of rows) {
      lines.push(
        [
          "",
          cell(candidate.product),
          cell(candidate.variant),
          cell(candidate.sku),
          cell(candidate.strength),
          cell(candidate.presentation),
          cell(money(candidate)),
          cell(candidate.supplier),
          cell(candidate.fulfillmentMethod),
          cell(candidate.inventoryState),
          candidate.quantityLimit === null ? "none set" : String(candidate.quantityLimit),
          cell(list(candidate.waivableBlockers)),
          cell(list(candidate.nonwaivableBlockers)),
          "",
        ].join(" | ").trim(),
      );
    }
    lines.push("");
  }

  const held = review.candidates.filter(
    (candidate) => candidate.regulatoryHoldReason !== null,
  );
  if (held.length > 0) {
    lines.push("## Recorded regulatory holds");
    lines.push("");
    const seen = new Set<string>();
    for (const candidate of held) {
      if (seen.has(candidate.productId)) continue;
      seen.add(candidate.productId);
      lines.push(`- **${candidate.product}**: ${candidate.regulatoryHoldReason}`);
    }
    lines.push("");
  }

  if (review.productsWithoutVariants.length > 0) {
    lines.push("## Products with no presentation");
    lines.push("");
    lines.push(
      "Early Access sells an exact presentation, so a product with none contributes no unit. Reported rather than silently dropped.",
    );
    lines.push("");
    for (const productId of review.productsWithoutVariants) {
      lines.push(`- ${productId}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
