import type {
  MemberCatalogCard,
  MemberCatalogPrice,
  MemberCatalogReadiness,
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import type { BadgeTone } from "../ui/kit";

export const PEPTIDE_ACCESS_STATES = [
  "eligible",
  "request_access",
  "held",
  "pending_documentation",
  "coming_soon",
  "care_only",
  "unavailable",
] as const;

export type PeptideAccessState = (typeof PEPTIDE_ACCESS_STATES)[number];

export type PeptideAccessPresentation = {
  state: PeptideAccessState;
  label: string;
  tone: BadgeTone;
  note: string;
  canRequestAccess: boolean;
  showPrice: boolean;
};

const PRESENTATION: Record<PeptideAccessState, PeptideAccessPresentation> = {
  eligible: {
    state: "eligible",
    label: "Eligible variant available",
    tone: "success",
    note: "At least one exact variant passed the current server eligibility projection.",
    canRequestAccess: false,
    showPrice: true,
  },
  request_access: {
    state: "request_access",
    label: "Request access",
    tone: "info",
    note: "Access or approved pricing is not currently available for this exact offering.",
    canRequestAccess: true,
    showPrice: false,
  },
  held: {
    state: "held",
    label: "Held",
    tone: "warning",
    note: "The exact product, variant, or readiness identities did not reconcile.",
    canRequestAccess: true,
    showPrice: false,
  },
  pending_documentation: {
    state: "pending_documentation",
    label: "Pending documentation",
    tone: "pending",
    note: "Required product or exact-lot documentation is still being verified.",
    canRequestAccess: true,
    showPrice: false,
  },
  coming_soon: {
    state: "coming_soon",
    label: "Coming soon",
    tone: "neutral",
    note: "This entry is informational and is not open for transaction.",
    canRequestAccess: true,
    showPrice: false,
  },
  care_only: {
    state: "care_only",
    label: "Care only",
    tone: "info",
    note: "This pathway is not offered through Research commerce.",
    canRequestAccess: false,
    showPrice: false,
  },
  unavailable: {
    state: "unavailable",
    label: "Unavailable",
    tone: "warning",
    note: "No exact operationally eligible variant is available.",
    canRequestAccess: true,
    showPrice: false,
  },
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function isPeptideCatalogCard(product: MemberCatalogCard): boolean {
  if (product.lane === "research_material") return true;
  const classification = `${product.category} ${product.classification}`;
  return product.lane === "future_clinical" && /\bpeptide\b/i.test(classification);
}

function pricesMatch(
  left: MemberCatalogPrice | null,
  right: MemberCatalogPrice | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.id === right.id &&
    left.amountCents === right.amountCents &&
    left.currency === right.currency &&
    left.effectiveAt === right.effectiveAt &&
    left.expiresAt === right.expiresAt &&
    left.version === right.version
  );
}

function readinessEntriesMatch(
  left: Array<{ id: string; version: number }>,
  right: Array<{ id: string; version: number }>,
): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort((a, b) => a.id.localeCompare(b.id));
  const normalizedRight = [...right].sort((a, b) => a.id.localeCompare(b.id));
  return normalizedLeft.every(
    (entry, index) =>
      entry.id === normalizedRight[index]?.id &&
      entry.version === normalizedRight[index]?.version,
  );
}

function domainEntriesMatch(
  left: Array<{ domain: string; version: number }>,
  right: Array<{ domain: string; version: number }>,
): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort((a, b) => a.domain.localeCompare(b.domain));
  const normalizedRight = [...right].sort((a, b) => a.domain.localeCompare(b.domain));
  return normalizedLeft.every(
    (entry, index) =>
      entry.domain === normalizedRight[index]?.domain &&
      entry.version === normalizedRight[index]?.version,
  );
}

function readinessMatches(
  left: MemberCatalogReadiness | null,
  right: MemberCatalogReadiness | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.ready === true &&
    right.ready === true &&
    left.verifiedInputCount === right.verifiedInputCount &&
    readinessEntriesMatch(left.inputVersions, right.inputVersions) &&
    domainEntriesMatch(left.domainVersions, right.domainVersions)
  );
}

type ExactSelection = NonNullable<MemberCatalogVariant["selection"]>;

function selectionReconciles(
  product: MemberCatalogCard,
  selection: ExactSelection | null,
  price: MemberCatalogPrice | null,
  expectedVariantId?: string,
  expectedSku?: string,
): selection is ExactSelection {
  if (
    selection === null ||
    product.displayState !== "available" ||
    product.media === null ||
    product.readiness === null ||
    selection.productId !== product.id ||
    selection.productId !== selection.inventoryEligibility.productId ||
    selection.variantId !== selection.inventoryEligibility.variantId ||
    selection.inventoryEligibility.state !== "eligible" ||
    selection.audienceEligibility.state !== "authorized" ||
    selection.audienceEligibility.audience !== selection.audience ||
    selection.media.id !== product.media.mediaId ||
    selection.media.altText !== product.media.altText ||
    !pricesMatch(price, selection.price) ||
    !readinessMatches(product.readiness, selection.canonicalReadiness)
  ) {
    return false;
  }

  if (expectedVariantId !== undefined && selection.variantId !== expectedVariantId) {
    return false;
  }
  if (expectedSku !== undefined && normalized(selection.sku) !== normalized(expectedSku)) {
    return false;
  }
  return selection.variantId.trim().length > 0 && selection.sku.trim().length > 0;
}

export function isExactCardEligible(product: MemberCatalogCard): boolean {
  return selectionReconciles(product, product.selection, product.price);
}

export function isExactVariantEligible(
  product: MemberProductDetail,
  variant: MemberCatalogVariant,
): boolean {
  return (
    variant.productId === product.id &&
    variant.availability === "available" &&
    variant.lotCoaState === "verified" &&
    selectionReconciles(
      product,
      variant.selection,
      variant.price,
      variant.id,
      variant.sku,
    )
  );
}

export function cardAccessPresentation(
  product: MemberCatalogCard,
): PeptideAccessPresentation {
  if (product.lane === "future_clinical") return PRESENTATION.care_only;
  if (isExactCardEligible(product)) return PRESENTATION.eligible;

  switch (product.displayState) {
    case "documentation_pending":
      return PRESENTATION.pending_documentation;
    case "pricing_pending":
      return PRESENTATION.request_access;
    case "catalog_only":
      return PRESENTATION.coming_soon;
    case "unavailable":
      return PRESENTATION.unavailable;
    case "available":
      return PRESENTATION.held;
  }
}

const DOCUMENTATION_FAILURES = new Set<MemberCatalogVariant["selectionFailure"]>([
  "media_missing",
  "media_unapproved",
  "media_ambiguous",
  "required_inputs_incomplete",
  "readiness_incomplete",
]);

const PRICE_OR_ACCESS_FAILURES = new Set<MemberCatalogVariant["selectionFailure"]>([
  "audience_eligibility_missing",
  "audience_identity_mismatch",
  "audience_unauthorized",
  "member_variant_ineligible",
  "price_missing",
  "price_currency_mismatch",
  "price_unapproved",
  "price_stale",
  "price_ambiguous",
]);

const UNAVAILABLE_FAILURES = new Set<MemberCatalogVariant["selectionFailure"]>([
  "product_unavailable",
  "inventory_eligibility_missing",
  "inventory_identity_mismatch",
  "inventory_unavailable",
]);

export function variantAccessPresentation(
  product: MemberProductDetail,
  variant: MemberCatalogVariant,
): PeptideAccessPresentation {
  if (product.lane === "future_clinical") return PRESENTATION.care_only;
  if (product.displayState === "catalog_only") return PRESENTATION.coming_soon;
  if (isExactVariantEligible(product, variant)) return PRESENTATION.eligible;
  if (variant.lotCoaState === "required") return PRESENTATION.pending_documentation;
  if (DOCUMENTATION_FAILURES.has(variant.selectionFailure)) {
    return PRESENTATION.pending_documentation;
  }
  if (PRICE_OR_ACCESS_FAILURES.has(variant.selectionFailure)) {
    return PRESENTATION.request_access;
  }
  if (
    variant.availability === "unavailable" ||
    UNAVAILABLE_FAILURES.has(variant.selectionFailure)
  ) {
    return PRESENTATION.unavailable;
  }
  return PRESENTATION.held;
}

export function formatEligibleCardPrice(product: MemberCatalogCard): string | null {
  if (!isExactCardEligible(product) || product.price === null) return null;
  return formatPrice(product.price);
}

export function formatEligibleVariantPrice(
  product: MemberProductDetail,
  variant: MemberCatalogVariant,
): string | null {
  if (!isExactVariantEligible(product, variant) || variant.price === null) return null;
  return formatPrice(variant.price);
}

function formatPrice(price: MemberCatalogPrice): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
  }).format(price.amountCents / 100);
}

export function variantIdentityLabel(variant: MemberCatalogVariant): string {
  const facts = [
    variant.label,
    variant.strength,
    variant.size,
    variant.presentation,
    variant.format,
  ]
    .map((value) => value?.trim() ?? "")
    .filter((value, index, values) => value && values.indexOf(value) === index);
  facts.push(`SKU ${variant.sku}`);
  return facts.join(" · ");
}
