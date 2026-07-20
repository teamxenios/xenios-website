// xenios research: legacy catalog adapter.
//
// `products-data.ts` is a hand-maintained array that states supplier facts as plain
// strings: exact strengths, prices, and for KLOW a full four-component composition.
// The catalog content review found every one of those facts NOT CONFIRMED against a
// written supplier document.
//
// This adapter does NOT decide who is right. It brings the legacy records into the
// `CatalogProduct` contract while preserving their values and labelling them
// `unverified_legacy`, so that:
//
//   1. no legacy value is lost (it is evidence of what was previously believed),
//   2. no legacy value can reach a member as fact,
//   3. no legacy value can pass the purchase gate,
//   4. Samuel gets an explicit reconciliation list.
//
// Deleting the values would destroy evidence. Trusting them would assert a claim
// about what is in a vial. Labelling them does neither.

import type { Product } from "@shared/research/types";
import {
  legacyValue,
  notConfirmed,
  type CatalogProduct,
  type CommerceApprovalState,
  type LaneDecisionState,
  type FulfillmentOwner,
  type MemberGoal,
  type ProductAvailability,
  type ProductLane,
} from "@shared/research/catalog";

const LEGACY_SOURCE = "server/research/products-data.ts";

/**
 * SKU assignment for the 15 catalog records, matching the founder specification and
 * the content records in `content/research-products/`.
 */
export const LEGACY_SLUG_TO_SKU: Readonly<Record<string, string>> = {
  "bpc-157-tb-500-15-15": "P001",
  "bpc-tb-ghk-cu": "P002",
  "klow-research-blend": "P003",
  "ta1-kpv-ll37": "P004",
  "cjc-1295-ipamorelin": "P005",
  "pt-141-bremelanotide": "P006",
  "tesamorelin-10mg": "P007",
  "gonadorelin-5mg": "P008",
  "nad-plus-500mg": "P009",
  "mots-c-10mg": "P010",
  "epitalon-10mg": "P011",
  "ss-31-elamipretide": "P012",
  "slu-pp-332-capsules": "P013",
  "dihexa-capsules": "P014",
  "semax-selank-dsip": "P015",
};

/** Guide slugs in `content/research-guides/`, so a product links to its evidence. */
export const LEGACY_SLUG_TO_GUIDES: Readonly<Record<string, string[]>> = {
  "bpc-157-tb-500-15-15": ["bpc-157", "tb-500", "bpc-157-tb-500"],
  "bpc-tb-ghk-cu": ["bpc-157", "tb-500", "ghk-cu", "bpc-157-tb-500-ghk-cu"],
  "klow-research-blend": ["klow"],
  "ta1-kpv-ll37": ["thymosin-alpha-1", "kpv", "ll-37", "thymosin-alpha-1-kpv-ll-37"],
  "cjc-1295-ipamorelin": ["cjc-1295", "ipamorelin", "cjc-1295-ipamorelin"],
  "pt-141-bremelanotide": ["pt-141"],
  "tesamorelin-10mg": ["tesamorelin"],
  "gonadorelin-5mg": ["gonadorelin"],
  "nad-plus-500mg": ["nad-plus"],
  "mots-c-10mg": ["mots-c"],
  "epitalon-10mg": ["epithalon"],
  "ss-31-elamipretide": ["ss-31"],
  "slu-pp-332-capsules": ["slu-pp-332"],
  "dihexa-capsules": ["dihexa"],
  "semax-selank-dsip": ["semax", "selank", "dsip", "semax-selank-dsip"],
};

/**
 * The KLOW record is called out specifically.
 *
 * The legacy file names a four-component set at exact strengths. The content review
 * declined to guess even the ingredient set, because no supplier document backs it.
 * A conflict note blocks member display outright, independent of confirmation state.
 */
const KLOW_CONFLICT =
  "The legacy catalog names a four-component set at exact strengths. The catalog content review found no supplier document establishing the ingredient set. Requires written supplier confirmation before any member-facing use.";

/** Blends where the legacy strength string implies a composition that is unconfirmed. */
const BLEND_CONFLICT =
  "The legacy catalog states an exact strength per component. No supplier document confirming the ratio is on file.";

const BLEND_SLUGS = new Set([
  "bpc-157-tb-500-15-15",
  "bpc-tb-ghk-cu",
  "klow-research-blend",
  "ta1-kpv-ll37",
  "cjc-1295-ipamorelin",
  "semax-selank-dsip",
]);

/**
 * Alternate spellings that must stay searchable.
 *
 * The legacy catalog slug is `epitalon-10mg`; the Guide content uses `epithalon`. Both
 * transliterations appear in the literature. Choosing a canonical scientific label is a
 * review decision, not an engineering one, so both spellings are preserved and neither
 * is promoted to canonical here.
 */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, string[]>> = {
  "epitalon-10mg": ["Epitalon", "Epithalon", "epitalon", "epithalon"],
};

/**
 * Maps a legacy category to a lane, plus whether that mapping is a decision.
 *
 * "programs" is not a supplement, a research material, Quantum, or clinical care.
 * Forcing one of those onto it would mis-apply that lane's authorization rules, claims
 * rules, and fulfillment owner. It gets an explicit held-open lane instead, which
 * blocks purchase on its own so the placeholder cannot ship as a quiet default.
 */
function mapLane(category: Product["category"]): { lane: ProductLane; decision: LaneDecisionState } {
  switch (category) {
    case "peptides":
      return { lane: "research_material", decision: "decided" };
    case "supplements":
      return { lane: "supplement", decision: "decided" };
    case "quantum":
      return { lane: "quantum", decision: "decided" };
    default:
      return { lane: "non_product_program", decision: "needs_samuel_decision" };
  }
}

/**
 * Legacy `status` is a presentation state, not an inventory state. Nothing here maps
 * to `in_stock`, because no inventory system existed and stock was never known.
 */
function mapAvailability(status: Product["status"]): ProductAvailability {
  switch (status) {
    case "hold":
      return "documentation_review";
    case "coming-soon":
      return "coming_soon";
    case "request-access":
      return "commerce_review";
    case "professional-only":
      return "commerce_review";
    case "live":
      // Even a legacy "live" record does not become purchasable, because stock was
      // never tracked and commerce was never approved.
      return "commerce_review";
    default:
      return "documentation_review";
  }
}

function mapFulfillmentOwner(lane: ProductLane): FulfillmentOwner {
  // Founder decision for roughly the first 60 days.
  if (lane === "research_material" || lane === "quantum") return "mitch";
  if (lane === "supplement") return "xenios";
  return "not_assigned";
}

export interface AdaptedCatalog {
  products: CatalogProduct[];
  /** Records whose lane cannot be determined without a founder decision. */
  unmapped: Array<{ slug: string; name: string; reason: string }>;
  /** Every supplier fact that needs written confirmation, for the admin queue. */
  reconciliation: Array<{ sku: string; slug: string; fact: string; legacyValue: string; note?: string }>;
}

/**
 * Adapts the legacy array. Pure, so it is fully testable without a database.
 */
export function adaptLegacyCatalog(legacy: readonly Product[], reviewedOn: string): AdaptedCatalog {
  const products: CatalogProduct[] = [];
  const unmapped: AdaptedCatalog["unmapped"] = [];
  const reconciliation: AdaptedCatalog["reconciliation"] = [];

  for (const item of legacy) {
    const { lane, decision } = mapLane(item.category);
    if (decision === "needs_samuel_decision") {
      // Still catalogued, so it is visible and auditable rather than silently dropped,
      // but recorded as an open decision and blocked from purchase by the lane itself.
      unmapped.push({
        slug: item.slug,
        name: item.name,
        reason: `NEEDS_SAMUEL_DECISION: category "${item.category}" is not a supplement, research material, Quantum, or clinical item. Held in the non_product_program lane until Samuel decides whether it belongs in the product catalogue at all.`,
      });
    }

    const sku = LEGACY_SLUG_TO_SKU[item.slug] ?? `LEGACY-${item.slug}`;
    const isBlend = BLEND_SLUGS.has(item.slug);
    const conflict = item.slug === "klow-research-blend" ? KLOW_CONFLICT : isBlend ? BLEND_CONFLICT : undefined;

    // Composition is only ever inferred from the legacy specifications block, and is
    // never synthesized from a name.
    const legacyComposition = item.specifications?.Components ?? null;
    const legacyStrength = item.size ?? null;
    const legacyFormat = item.specifications?.Format ?? null;

    const product: CatalogProduct = {
      sku,
      slug: item.slug,
      displayName: item.name,
      lane,
      laneDecision: decision,
      nameAliases: LEGACY_NAME_ALIASES[item.slug] ?? [],
      availability: mapAvailability(item.status),
      // Nothing arrives approved. Commerce approval is a written decision.
      commerceApproval: "blocked_pending_written_approval" as CommerceApprovalState,
      fulfillmentOwner: mapFulfillmentOwner(lane),

      facts: {
        composition:
          legacyComposition === null
            ? notConfirmed<string>(conflict)
            : legacyValue(legacyComposition, LEGACY_SOURCE, conflict),
        strength:
          legacyStrength === null
            ? notConfirmed<string>(conflict)
            : legacyValue(legacyStrength, LEGACY_SOURCE, conflict),
        format: legacyFormat === null ? notConfirmed<string>() : legacyValue(legacyFormat, LEGACY_SOURCE),
        priceCents:
          item.priceCents === null || item.priceCents === undefined
            ? notConfirmed<number>()
            : legacyValue(item.priceCents, LEGACY_SOURCE),
        // These never existed in the legacy file at all.
        shelfLife: notConfirmed<string>(),
        storage: notConfirmed<string>(),
        coa: notConfirmed<string>(),
      },

      guideState: "guide_in_development",
      qualityDocumentState: "missing",
      storageDataState: "missing",
      shippingProfileState: "missing",

      goalMappings: [] as MemberGoal[],
      relatedGuideSlugs: LEGACY_SLUG_TO_GUIDES[item.slug] ?? [],
      prohibitedClaims: [],

      subscriptionEligible: false,
      lastReviewed: reviewedOn,
      openSupplierQuestions: buildOpenQuestions(item, isBlend),
    };

    products.push(product);

    for (const [factName, value] of [
      ["composition", legacyComposition],
      ["strength", legacyStrength],
      ["priceCents", item.priceCents ?? null],
    ] as const) {
      if (value !== null && value !== undefined) {
        reconciliation.push({
          sku,
          slug: item.slug,
          fact: factName,
          legacyValue: String(value),
          note: conflict,
        });
      }
    }
  }

  return { products, unmapped, reconciliation };
}

function buildOpenQuestions(item: Product, isBlend: boolean): string[] {
  const questions = [
    "What written supplier document establishes the exact composition of this item?",
    "What is the confirmed fill volume, format, and presentation?",
    "What is the confirmed shelf life, and what document establishes it?",
    "What are the confirmed storage and handling conditions?",
    "Is a lot-level certificate of analysis available, and what does it cover?",
    "What written evidence exists that xenios may purchase, hold, and resell this item?",
  ];
  if (isBlend) {
    questions.unshift(
      "What written supplier document establishes the ingredient ratio for this blend, component by component?",
    );
  }
  if (item.priceCents !== null && item.priceCents !== undefined) {
    questions.push("What confirmed cost basis and margin support the stated price?");
  }
  return questions;
}
