import type {
  AdminProductDetail,
  AdminProductMedia,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogDisplayState,
  MemberCatalogPrice,
  MemberCatalogProjectionSource,
  MemberCatalogQuery,
  MemberCatalogReadiness,
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import { selectCartProduct } from "../commerce/cart-product-selection";
import {
  parseProductControlTimestamp,
  ProductControlCurrentPriceResolver,
  type CurrentPriceResolver,
} from "./product-control-reader";

export type MemberCatalogProjectionInput = {
  products: readonly AdminProductDetail[];
  requiredInputs: readonly RequiredInput[];
  readiness: readonly DomainReadiness[];
  source: MemberCatalogProjectionSource;
};

export class MemberCatalogProjectionError extends Error {}

function canonicalIso(value: string): string | null {
  const milliseconds = parseProductControlTimestamp(value);
  return milliseconds !== null
    ? new Date(milliseconds).toISOString()
    : null;
}

function safeHttpsHref(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function exactlyOne<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): T | null {
  const matches = values.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function approvedVariants(
  product: AdminProductDetail,
  audience: MemberCatalog["audience"],
): AdminProductVariant[] {
  return product.variants
    .filter(
      (variant) =>
        variant.productId === product.id &&
        variant.status === "approved" &&
        variant.active &&
        Boolean(variant.id.trim()) &&
        Boolean(variant.sku.trim()) &&
        (audience !== "member" || variant.memberEligible),
    )
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.label.localeCompare(right.label),
    );
}

function currentPrice(
  resolver: CurrentPriceResolver,
  product: AdminProductDetail,
  variant: AdminProductVariant,
  source: MemberCatalogProjectionSource,
): AdminProductPrice | null {
  return resolver.resolve({
    productId: product.id,
    variant,
    prices: product.prices,
    audienceEligibility: source.audienceEligibility!,
    currency: source.currency,
    evaluatedAt: source.evaluatedAt,
  });
}

function priceProjection(price: AdminProductPrice | null): MemberCatalogPrice | null {
  if (price === null) return null;
  const effectiveAt = canonicalIso(price.effectiveAt);
  const expiresAt =
    price.expiresAt === null ? null : canonicalIso(price.expiresAt);
  if (effectiveAt === null || (price.expiresAt !== null && expiresAt === null)) {
    return null;
  }
  return {
    id: price.id,
    amountCents: price.amountCents,
    currency: price.currency,
    effectiveAt,
    expiresAt,
    version: price.version,
  };
}

function safeMedia(
  product: AdminProductDetail,
  source: MemberCatalogProjectionSource,
) {
  const media = exactlyOne(
    product.media,
    (item) =>
      item.productId === product.id &&
      item.kind === "primary_image" &&
      item.state === "approved" &&
      Boolean(item.approvedBy) &&
      Boolean(item.altText.trim()),
  );
  if (media === null) return null;
  const presentation = exactlyOne(
    source.mediaPresentations,
    (item) =>
      item.productId === product.id &&
      item.mediaId === media.id &&
      item.altText.trim() === media.altText.trim(),
  );
  return presentation !== null &&
    presentation.sourceVersion.trim() &&
    safeHttpsHref(presentation.href)
    ? {
        mediaId: presentation.mediaId,
        productId: presentation.productId,
        href: presentation.href,
        altText: presentation.altText,
        sourceVersion: presentation.sourceVersion,
      }
    : null;
}

function variantProjection(
  product: AdminProductDetail,
  variant: AdminProductVariant,
  input: MemberCatalogProjectionInput,
  resolver: CurrentPriceResolver,
  safePresentationAvailable: boolean,
): MemberCatalogVariant {
  const price = currentPrice(resolver, product, variant, input.source);
  const inventory = exactlyOne(
    input.source.inventoryEligibility,
    (item) =>
      item.productId === product.id && item.variantId === variant.id,
  );
  const lotCoa = exactlyOne(
    input.source.lotCoaPresentations,
    (item) =>
      item.productId === product.id &&
      item.variantId === variant.id &&
      Boolean(item.sourceVersion.trim()) &&
      parseProductControlTimestamp(item.evaluatedAt) ===
        parseProductControlTimestamp(input.source.evaluatedAt),
  );
  const commerceLane =
    product.lane !== "future_clinical" &&
    product.lane !== "non_product_program";
  const selectionResult = !commerceLane
    ? { ok: false as const, code: "product_commerce_unapproved" as const }
    : !safePresentationAvailable
      ? { ok: false as const, code: "media_unapproved" as const }
      : lotCoa?.state === "required" || lotCoa === null
        ? { ok: false as const, code: "inventory_unavailable" as const }
        : selectCartProduct(
        {
          productId: product.id,
          variantId: variant.id,
          audience: input.source.audienceEligibility!.audience,
          currency: input.source.currency,
          evaluatedAt: input.source.evaluatedAt,
        },
        {
          products: [product],
          variants: product.variants,
          prices: product.prices,
          media: product.media,
          requiredInputs: input.requiredInputs,
          readiness: input.readiness,
          audienceEligibility: input.source.audienceEligibility,
          inventoryEligibility: inventory,
        },
          );

  return {
    id: variant.id,
    productId: product.id,
    sku: variant.sku,
    label: variant.label,
    strength: variant.strength,
    size: variant.size,
    format: variant.format,
    presentation: variant.presentation,
    shippingClass: variant.shippingClass,
    price: priceProjection(price),
    availability:
      inventory?.state === "eligible" &&
      inventory.reason === null &&
      Boolean(inventory.sourceVersion.trim()) &&
      parseProductControlTimestamp(inventory.evaluatedAt) ===
        parseProductControlTimestamp(input.source.evaluatedAt)
        ? "available"
        : "unavailable",
    lotCoaState: lotCoa?.state ?? "required",
    selection: selectionResult.ok ? selectionResult.selection : null,
    selectionFailure: selectionResult.ok ? null : selectionResult.code,
  };
}

function readinessFrom(
  variants: readonly MemberCatalogVariant[],
): MemberCatalogReadiness | null {
  const ready = variants.find((variant) => variant.selection !== null)?.selection
    ?.canonicalReadiness;
  return ready
    ? {
        ready: true,
        verifiedInputCount: ready.verifiedInputCount,
        inputVersions: ready.inputVersions.map(({ id, version }) => ({
          id,
          version,
        })),
        domainVersions: ready.domainVersions.map(({ domain, version }) => ({
          domain,
          version,
        })),
      }
    : null;
}

function displayState(
  product: AdminProductDetail,
  variants: readonly MemberCatalogVariant[],
): MemberCatalogDisplayState {
  if (
    product.lane === "future_clinical" ||
    product.lane === "non_product_program"
  ) {
    return "catalog_only";
  }
  if (variants.some((variant) => variant.selection !== null)) return "available";
  const failures = variants.flatMap((variant) =>
    variant.selectionFailure ? [variant.selectionFailure] : [],
  );
  if (
    failures.includes("required_inputs_incomplete") ||
    failures.includes("readiness_incomplete") ||
    failures.includes("media_missing") ||
    failures.includes("media_unapproved") ||
    failures.includes("media_ambiguous")
  ) {
    return "documentation_pending";
  }
  if (
    failures.includes("price_missing") ||
    failures.includes("price_unapproved") ||
    failures.includes("price_stale") ||
    failures.includes("price_ambiguous")
  ) {
    return "pricing_pending";
  }
  return "unavailable";
}

function safeSummary(product: AdminProductDetail): string {
  if (product.lane === "future_clinical") {
    return "Research pathway information is being prepared. This catalog state does not offer prescribing, dosing, or treatment.";
  }
  return (
    product.content.shortDescription?.trim() ||
    "Published Research catalog information reviewed for member display."
  );
}

function projectProduct(
  product: AdminProductDetail,
  input: MemberCatalogProjectionInput,
  resolver: CurrentPriceResolver,
): MemberProductDetail {
  const media = safeMedia(product, input.source);
  const variants = approvedVariants(
    product,
    input.source.audienceEligibility!.audience,
  ).map((variant) =>
    variantProjection(product, variant, input, resolver, media !== null),
  );
  const state = displayState(product, variants);
  const lowestPrice = variants
    .flatMap((variant) => (variant.price ? [variant.price] : []))
    .sort((left, right) => left.amountCents - right.amountCents)[0] ?? null;
  const selectedVariant =
    variants.find((variant) => variant.selection !== null) ?? null;
  const selection = selectedVariant?.selection ?? null;
  const displayPrice = selectedVariant?.price ?? lowestPrice;
  const clinicalCatalogOnly = product.lane === "future_clinical";

  return {
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    aliases: [...product.aliases],
    lane: product.lane,
    category: product.category,
    classification: product.classification,
    summary: safeSummary(product),
    displayState: state,
    media,
    price: displayPrice,
    selection,
    variantCount: variants.length,
    updatedAt: canonicalIso(product.updatedAt) ?? input.source.evaluatedAt,
    audience: input.source.audienceEligibility!.audience,
    currency: input.source.currency,
    evaluatedAt: canonicalIso(input.source.evaluatedAt)!,
    overview: clinicalCatalogOnly ? null : product.content.overview,
    specifications: clinicalCatalogOnly ? null : product.content.specifications,
    researchInformation: clinicalCatalogOnly
      ? null
      : product.content.researchInformation,
    storageInformation: clinicalCatalogOnly
      ? null
      : product.content.storageInformation,
    shippingInformation: clinicalCatalogOnly
      ? null
      : product.content.shippingInformation,
    returnInformation: clinicalCatalogOnly
      ? null
      : product.content.returnInformation,
    disclaimers: product.content.disclaimers,
    reviewDate: product.content.reviewDate,
    variants,
    readiness: readinessFrom(variants),
    relatedProducts: [],
    researchOnlyBoundary:
      product.lane === "research_material" || clinicalCatalogOnly,
  };
}

function card(product: MemberProductDetail): MemberCatalogCard {
  const {
    audience: _audience,
    currency: _currency,
    evaluatedAt: _evaluatedAt,
    canonicalName: _canonicalName,
    overview: _overview,
    specifications: _specifications,
    researchInformation: _researchInformation,
    storageInformation: _storageInformation,
    shippingInformation: _shippingInformation,
    returnInformation: _returnInformation,
    disclaimers: _disclaimers,
    reviewDate: _reviewDate,
    variants: _variants,
    relatedProducts: _relatedProducts,
    researchOnlyBoundary: _researchOnlyBoundary,
    ...value
  } = product;
  return value;
}

function visibleProducts(products: readonly AdminProductDetail[]) {
  const candidates = products.filter(
    (product) =>
      product.status === "published" &&
      product.visibility === "public" &&
      product.active,
  );
  const ids = new Map<string, number>();
  const slugs = new Map<string, number>();
  for (const product of candidates) {
    ids.set(product.id, (ids.get(product.id) ?? 0) + 1);
    slugs.set(
      product.slug.toLowerCase(),
      (slugs.get(product.slug.toLowerCase()) ?? 0) + 1,
    );
  }
  return candidates.filter(
    (product) =>
      ids.get(product.id) === 1 &&
      slugs.get(product.slug.toLowerCase()) === 1,
  );
}

function requireProjectionSource(source: MemberCatalogProjectionSource): string {
  const evaluatedAt = canonicalIso(source.evaluatedAt);
  const audienceEvaluatedAt =
    source.audienceEligibility === null
      ? null
      : canonicalIso(source.audienceEligibility.evaluatedAt);
  if (
    evaluatedAt === null ||
    !source.currency.trim() ||
    source.currency !== source.currency.toUpperCase() ||
    source.audienceEligibility === null ||
    source.audienceEligibility.state !== "authorized" ||
    !source.audienceEligibility.sourceVersion.trim() ||
    audienceEvaluatedAt !== evaluatedAt
  ) {
    throw new MemberCatalogProjectionError(
      "A server-authorized audience, currency, and evaluation time are required.",
    );
  }
  return evaluatedAt;
}

export function projectMemberCatalog(
  input: MemberCatalogProjectionInput,
  query: MemberCatalogQuery = {},
  resolver: CurrentPriceResolver = new ProductControlCurrentPriceResolver(),
): MemberCatalog {
  const evaluatedAt = requireProjectionSource(input.source);
  const projected = visibleProducts(input.products).map((product) =>
    projectProduct(product, input, resolver),
  );
  const categories = Array.from(
    new Set(projected.map((product) => product.category).filter(Boolean)),
  ).sort();
  const lanes = Array.from(new Set(projected.map((product) => product.lane))).sort();
  const normalizedQuery = query.query?.trim().toLowerCase() ?? "";
  const items = projected
    .filter((product) => {
      if (query.lane && query.lane !== "all" && product.lane !== query.lane) {
        return false;
      }
      if (
        query.category &&
        query.category !== "all" &&
        product.category !== query.category
      ) {
        return false;
      }
      return (
        !normalizedQuery ||
        [
          product.displayName,
          product.canonicalName,
          product.category,
          product.classification,
          ...product.aliases,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    })
    .sort((left, right) => {
      if (query.sort === "name_descending") {
        return right.displayName.localeCompare(left.displayName);
      }
      if (query.sort === "recently_updated") {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return left.displayName.localeCompare(right.displayName);
    })
    .map(card);
  return {
    audience: input.source.audienceEligibility!.audience,
    currency: input.source.currency,
    evaluatedAt,
    items,
    categories,
    lanes,
  };
}

export function projectMemberProductDetail(
  input: MemberCatalogProjectionInput,
  slug: string,
  resolver: CurrentPriceResolver = new ProductControlCurrentPriceResolver(),
): MemberProductDetail | null {
  requireProjectionSource(input.source);
  const products = visibleProducts(input.products);
  const matches = products.filter(
    (product) => product.slug.toLowerCase() === slug.trim().toLowerCase(),
  );
  if (matches.length !== 1) return null;
  const projected = projectProduct(matches[0], input, resolver);
  projected.relatedProducts = products
    .filter(
      (product) =>
        product.id !== matches[0].id &&
        (product.category === matches[0].category ||
          product.lane === matches[0].lane),
    )
    .slice(0, 3)
    .map((product) => card(projectProduct(product, input, resolver)));
  return projected;
}
