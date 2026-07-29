import type { CatalogProduct } from "@shared/research/catalog";
import type { Product } from "@shared/research/types";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogQuery,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import catalogSource from "../../../content/research-products/v3-catalog.json";

export type V3CatalogProfile = {
  product_key: string;
  slug: string;
  display_name: string;
  product_class: string;
  merchandising_category: string;
  status_classification: "research_material" | "laboratory_supply";
  customer_state: "coming_soon";
  purchase_state: "disabled_pending_readiness";
  pricing_state: "public_price_pending";
  supplier_state: "supplier_confirmation_pending";
  inventory_state: "inventory_pending";
  quality_state: "lot_and_quality_pending";
  media_state: "media_pending";
  subscription_state: "disabled";
  primary_cta: "Notify me";
  secondary_cta: "Request sourcing";
  route: string;
  preview_copy: string;
  reference_sizes: string;
  source_reference: string | null;
};

type V3CatalogDocument = {
  schemaVersion: 1;
  source: string;
  profiles: V3CatalogProfile[];
};

const document = catalogSource as V3CatalogDocument;
const CANONICAL_PROFILE_COUNT = 49;
const PRODUCT_KEY = /^xn-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateProfile(profile: V3CatalogProfile): void {
  if (
    !PRODUCT_KEY.test(profile.product_key) ||
    !SLUG.test(profile.slug) ||
    !profile.display_name.trim() ||
    !profile.product_class.trim() ||
    !profile.merchandising_category.trim() ||
    !["research_material", "laboratory_supply"].includes(
      profile.status_classification,
    ) ||
    profile.customer_state !== "coming_soon" ||
    profile.purchase_state !== "disabled_pending_readiness" ||
    profile.pricing_state !== "public_price_pending" ||
    profile.supplier_state !== "supplier_confirmation_pending" ||
    profile.inventory_state !== "inventory_pending" ||
    profile.quality_state !== "lot_and_quality_pending" ||
    profile.media_state !== "media_pending" ||
    profile.subscription_state !== "disabled" ||
    profile.route !== `/research/products/${profile.slug}` ||
    !profile.preview_copy.endsWith("Not for human or veterinary use.")
  ) {
    throw new Error(`Invalid V3 catalog profile: ${profile.product_key}`);
  }
}

function loadProfiles(): readonly V3CatalogProfile[] {
  if (
    document.schemaVersion !== 1 ||
    document.profiles.length !== CANONICAL_PROFILE_COUNT
  ) {
    throw new Error("The V3 canonical catalog must contain exactly 49 profiles.");
  }
  const keys = new Set<string>();
  const slugs = new Set<string>();
  for (const profile of document.profiles) {
    validateProfile(profile);
    if (keys.has(profile.product_key) || slugs.has(profile.slug)) {
      throw new Error(`Duplicate V3 catalog identity: ${profile.product_key}`);
    }
    keys.add(profile.product_key);
    slugs.add(profile.slug);
  }
  return Object.freeze(document.profiles.map((profile) => Object.freeze(profile)));
}

export const v3CatalogProfiles = loadProfiles();

/**
 * Truthful public discovery records. Candidate presentations are explicitly
 * described as planning references; no supplier, public price, inventory,
 * lot, COA, storage, shipping, or subscription fact is asserted.
 */
export const v3PreviewProducts: Product[] = v3CatalogProfiles.map(
  (profile, index) => ({
    slug: profile.slug,
    name: profile.display_name,
    category:
      profile.product_key === "xn-quantum-foundational-reset"
        ? "quantum"
        : "peptides",
    lane: "research",
    status: "coming-soon",
    priceCents: null,
    eyebrow: profile.merchandising_category,
    summary: profile.preview_copy,
    description: [
      `${profile.display_name} is a supplier-independent Xenios Research profile.`,
      "Purchase remains disabled until an exact supplier offer, approved public price, inventory, lot-quality record, storage source, shipping profile, and required agreements all pass server-authoritative review.",
    ],
    highlights: [
      profile.product_class,
      "Supplier coverage in review",
      "Notify-me and sourcing interest only",
    ],
    tags: [
      profile.product_class,
      profile.merchandising_category,
      "Coming soon",
    ],
    specifications: {
      Classification: profile.product_class,
      "Research category": profile.merchandising_category,
      "Presentation status": "Options being confirmed",
      "Purchase state": "Disabled pending complete readiness",
    },
    qualityNotes: [
      "No lot or quality report is attached until an exact supplier offer and exact lot are confirmed.",
      "Missing tests remain shown as missing; no competitive report or supplier record is reused.",
    ],
    badge: "Coming soon",
    sortOrder: index + 1,
  }),
);

/**
 * Legacy commerce consumers still import this symbol. Preview profiles have
 * no approved Product Control variant or SKU, so the only truthful and
 * fail-closed compatibility projection is an empty catalog.
 */
export const v3PreviewCatalogProducts: CatalogProduct[] = [];

function previewCard(profile: V3CatalogProfile): MemberCatalogCard {
  return {
    id: profile.product_key,
    slug: profile.slug,
    displayName: profile.display_name,
    aliases: [],
    lane:
      profile.product_key === "xn-quantum-foundational-reset"
        ? "quantum"
        : "research_material",
    category: profile.merchandising_category,
    classification: profile.product_class,
    summary: profile.preview_copy,
    displayState: "documentation_pending",
    media: null,
    price: null,
    readiness: null,
    selection: null,
    variantCount: 0,
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

export function v3PreviewMemberCatalog(
  evaluatedAt: string,
  query: MemberCatalogQuery = {},
): MemberCatalog {
  let items = v3CatalogProfiles.map(previewCard);
  const search = query.query?.trim().toLowerCase();
  if (search) {
    items = items.filter((item) =>
      [
        item.displayName,
        item.category,
        item.classification,
        item.summary,
      ].some((value) => value.toLowerCase().includes(search)),
    );
  }
  if (query.category && query.category !== "all") {
    items = items.filter((item) => item.category === query.category);
  }
  if (query.lane && query.lane !== "all") {
    items = items.filter((item) => item.lane === query.lane);
  }
  items.sort((left, right) => {
    if (query.sort === "name_descending") {
      return right.displayName.localeCompare(left.displayName);
    }
    if (query.sort === "recently_updated") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }
    return left.displayName.localeCompare(right.displayName);
  });
  return {
    audience: "member",
    currency: "USD",
    evaluatedAt,
    items,
    categories: Array.from(
      new Set(v3CatalogProfiles.map((item) => item.merchandising_category)),
    ).sort(),
    lanes: Array.from(new Set(items.map((item) => item.lane))),
  };
}

export function v3PreviewMemberDetail(
  slug: string,
  evaluatedAt: string,
): MemberProductDetail | null {
  const profile = v3CatalogProfiles.find((item) => item.slug === slug);
  if (!profile) return null;
  return {
    ...previewCard(profile),
    audience: "member",
    currency: "USD",
    evaluatedAt,
    canonicalName: profile.display_name,
    overview:
      `${profile.display_name} is a supplier-independent non-clinical discovery profile. ` +
      "It is not an offer for sale and carries no supplier, price, inventory, lot, quality, storage, or shipping assertion.",
    specifications:
      "Options are being confirmed. No presentation, format, size, or SKU is public until an exact supplier-backed variant is approved.",
    researchInformation: profile.preview_copy,
    storageInformation: null,
    shippingInformation: null,
    returnInformation: null,
    disclaimers:
      "For research use only. Not for human or veterinary use. Purchase remains disabled until every server-authoritative readiness gate passes.",
    reviewDate: "2026-07-27",
    variants: [],
    relatedProducts: [],
    researchOnlyBoundary: true,
  };
}
