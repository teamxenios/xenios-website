import type {
  AdminProductDetail,
  AdminProductMedia,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
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
import {
  isSafeMemberCatalogPathwayName,
  MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY,
  MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION,
  MEMBER_CATALOG_LOT_COA_STATES,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION,
  MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY,
} from "@shared/research/member-catalog";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import { selectCartProduct } from "../commerce/cart-product-selection";
import {
  parseProductControlTimestamp,
  parseProductControlTimestampMicros,
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

function safePublicMediaHref(
  value: string,
  policy: "xenios_public_media_v1" | "xenios_signed_storage_v1",
  expiresAt: string | null,
  evaluatedAt: string,
  expectedObjectPath: string,
): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port
    ) {
      return false;
    }
    if (policy === "xenios_public_media_v1") {
      return (
        (url.hostname === "xeniostechnology.com" ||
          url.hostname.endsWith(".xeniostechnology.com")) &&
        url.search === "" &&
        expiresAt === null
      );
    }
    if (policy !== "xenios_signed_storage_v1") return false;
    const expiresMs =
      expiresAt === null ? null : parseProductControlTimestamp(expiresAt);
    const evaluatedMs = parseProductControlTimestamp(evaluatedAt);
    const keys = Array.from(url.searchParams.keys());
    const prefix =
      "/storage/v1/object/sign/research-product-media/";
    if (!url.pathname.startsWith(prefix)) return false;
    let decodedObjectPath: string;
    try {
      decodedObjectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      return false;
    }
    return (
      url.origin === "https://yvzeduaxbwgcwllhywff.supabase.co" &&
      decodedObjectPath === expectedObjectPath &&
      !decodedObjectPath.includes("\\") &&
      decodedObjectPath.split("/").every(
        (segment) => segment !== "." && segment !== "..",
      ) &&
      keys.length === 1 &&
      keys[0] === "token" &&
      url.searchParams.getAll("token").length === 1 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        url.searchParams.get("token") ?? "",
      ) &&
      expiresMs !== null &&
      evaluatedMs !== null &&
      expiresMs > evaluatedMs
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

type ProductDisplayBindingKey =
  (typeof PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS)[number]["key"];

type ProductDisplayBindings = Record<ProductDisplayBindingKey, boolean>;

function resolvedProductDisplayBindings(
  productId: string,
  items: readonly RequiredInput[],
  evaluatedAt: string,
): ProductDisplayBindings {
  const evaluatedMicros = parseProductControlTimestampMicros(evaluatedAt);
  const entries = PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding) => {
    const active = items.filter(
      (item) =>
        item.key === binding.key &&
        item.domain === binding.domain &&
        item.recordType === binding.recordType &&
        item.recordId === productId &&
        item.currentState !== "superseded",
    );
    const item = active.length === 1 ? active[0] : null;
    const verifiedAt =
      item?.verifiedAt === null || item?.verifiedAt === undefined
        ? null
        : parseProductControlTimestampMicros(item.verifiedAt);
    const verified =
      item !== null &&
      evaluatedMicros !== null &&
      Boolean(item.id.trim()) &&
      Boolean(item.fieldPath.trim()) &&
      Number.isInteger(item.version) &&
      item.version > 0 &&
      (item.currentState === "not_applicable" ||
        (item.currentState === "verified" &&
          Boolean(item.verifiedBy?.trim()) &&
          verifiedAt !== null &&
          verifiedAt <= evaluatedMicros));
    return { key: binding.key, id: verified ? item!.id : null, verified };
  });
  const resolvedIds = entries.flatMap((entry) =>
    entry.id === null ? [] : [entry.id],
  );
  if (new Set(resolvedIds).size !== resolvedIds.length) {
    return Object.fromEntries(
      PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map(({ key }) => [key, false]),
    ) as ProductDisplayBindings;
  }
  return Object.fromEntries(
    entries.map(({ key, verified }) => [key, verified]),
  ) as ProductDisplayBindings;
}

function allProductDisplayBindingsResolved(
  bindings: ProductDisplayBindings,
): boolean {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.every(
    ({ key }) => bindings[key],
  );
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
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(media.filename) ||
    media.filename === "." ||
    media.filename === ".."
  ) {
    return null;
  }
  const expectedObjectPath = `${product.id}/${media.id}/${media.filename}`;
  const presentation = exactlyOne(
    source.mediaPresentations,
    (item) =>
      item.productId === product.id &&
      item.mediaId === media.id &&
      item.altText.trim() === media.altText.trim() &&
      item.filename === media.filename,
  );
  return presentation !== null &&
    presentation.sourceVersion.trim() &&
    (presentation.policy !== "xenios_signed_storage_v1" ||
      media.storageKey === expectedObjectPath) &&
    safePublicMediaHref(
      presentation.href,
      presentation.policy,
      presentation.expiresAt,
      source.evaluatedAt,
      expectedObjectPath,
    )
    ? {
        mediaId: presentation.mediaId,
        productId: presentation.productId,
        href: presentation.href,
        altText: presentation.altText,
        filename: presentation.filename,
        sourceVersion: presentation.sourceVersion,
        policy: presentation.policy,
        expiresAt:
          presentation.expiresAt === null
            ? null
            : canonicalIso(presentation.expiresAt),
      }
    : null;
}

function exactLotCoaPresentation(
  productId: string,
  variantId: string,
  source: MemberCatalogProjectionSource,
) {
  const records = source.lotCoaPresentations.filter(
    (item) => item.productId === productId && item.variantId === variantId,
  );
  if (records.length !== 1) return null;
  const item = records[0];
  return (
    (MEMBER_CATALOG_LOT_COA_STATES as readonly unknown[]).includes(
      item.state,
    ) &&
    Boolean(item.sourceVersion.trim()) &&
    parseProductControlTimestamp(item.evaluatedAt) ===
      parseProductControlTimestamp(source.evaluatedAt)
  )
    ? item
    : null;
}

function variantProjection(
  product: AdminProductDetail,
  variant: AdminProductVariant,
  input: MemberCatalogProjectionInput,
  resolver: CurrentPriceResolver,
  safePresentationAvailable: boolean,
  displayBindingsReady: boolean,
): MemberCatalogVariant {
  const price = currentPrice(resolver, product, variant, input.source);
  const inventory = exactlyOne(
    input.source.inventoryEligibility,
    (item) =>
      item.productId === product.id && item.variantId === variant.id,
  );
  const lotCoa = exactLotCoaPresentation(
    product.id,
    variant.id,
    input.source,
  );
  const selectionResult = !displayBindingsReady
    ? { ok: false as const, code: "required_inputs_incomplete" as const }
    : !safePresentationAvailable
      ? { ok: false as const, code: "media_unapproved" as const }
      : lotCoa === null ||
          !["verified", "not_applicable"].includes(lotCoa.state)
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
  bindings: ProductDisplayBindings,
): MemberCatalogDisplayState {
  if (
    product.lane === "future_clinical" ||
    product.lane === "non_product_program"
  ) {
    return "catalog_only";
  }
  if (!allProductDisplayBindingsResolved(bindings)) {
    return "documentation_pending";
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
  if (
    product.lane === "future_clinical" ||
    product.lane === "non_product_program"
  ) {
    return MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY;
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
): MemberProductDetail | null {
  const bindings = resolvedProductDisplayBindings(
    product.id,
    input.requiredInputs,
    input.source.evaluatedAt,
  );
  if (!bindings["products.family"]) return null;
  const nontransactional =
    product.lane === "future_clinical" ||
    product.lane === "non_product_program";
  const media = bindings["product_content.primary_image"]
    ? safeMedia(product, input.source)
    : null;
  const variants =
    nontransactional || !bindings["products.sku"]
      ? []
      : approvedVariants(
          product,
          input.source.audienceEligibility!.audience,
        ).map((variant) =>
          variantProjection(
            product,
            variant,
            input,
            resolver,
            media !== null,
            allProductDisplayBindingsResolved(bindings),
          ),
        );
  const state = displayState(product, variants, bindings);
  const lowestPrice = variants
    .flatMap((variant) => (variant.price ? [variant.price] : []))
    .sort((left, right) => left.amountCents - right.amountCents)[0] ?? null;
  const selectedVariant =
    variants.find((variant) => variant.selection !== null) ?? null;
  const selection = selectedVariant?.selection ?? null;
  const displayPrice = selectedVariant?.price ?? lowestPrice;
  const safePathwayName =
    product.lane === "future_clinical" &&
    isSafeMemberCatalogPathwayName(product.displayName)
      ? product.displayName.trim()
      : product.lane === "future_clinical"
        ? "Research pathway"
        : product.lane === "non_product_program"
          ? "Research program"
          : product.displayName;

  return {
    id: product.id,
    slug: product.slug,
    displayName: safePathwayName,
    canonicalName: nontransactional ? safePathwayName : product.canonicalName,
    aliases: nontransactional ? [] : [...product.aliases],
    lane: product.lane,
    category:
      product.lane === "future_clinical"
        ? MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY
        : product.lane === "non_product_program"
          ? MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY
        : product.category,
    classification:
      product.lane === "future_clinical"
        ? MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION
        : product.lane === "non_product_program"
          ? MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION
        : product.classification,
    summary: safeSummary(product),
    displayState: state,
    media,
    price: nontransactional ? null : displayPrice,
    selection: nontransactional ? null : selection,
    variantCount: nontransactional ? 0 : variants.length,
    updatedAt: canonicalIso(product.updatedAt) ?? input.source.evaluatedAt,
    audience: input.source.audienceEligibility!.audience,
    currency: input.source.currency,
    evaluatedAt: canonicalIso(input.source.evaluatedAt)!,
    overview: nontransactional ? null : product.content.overview,
    specifications: nontransactional ? null : product.content.specifications,
    researchInformation: nontransactional
      ? null
      : product.content.researchInformation,
    storageInformation:
      nontransactional ||
      !bindings["product_content.storage_information"]
      ? null
      : product.content.storageInformation,
    shippingInformation: nontransactional
      ? null
      : product.content.shippingInformation,
    returnInformation: nontransactional
      ? null
      : product.content.returnInformation,
    disclaimers: nontransactional ? null : product.content.disclaimers,
    reviewDate: nontransactional ? null : product.content.reviewDate,
    variants,
    readiness: nontransactional ? null : readinessFrom(variants),
    relatedProducts: [],
    researchOnlyBoundary:
      product.lane === "research_material" || nontransactional,
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
  const projected = visibleProducts(input.products)
    .map((product) => projectProduct(product, input, resolver))
    .filter((product): product is MemberProductDetail => product !== null);
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
  if (projected === null) return null;
  projected.relatedProducts = products
    .filter(
      (product) =>
        product.id !== matches[0].id &&
        (product.category === matches[0].category ||
          product.lane === matches[0].lane),
    )
    .slice(0, 3)
    .map((product) => projectProduct(product, input, resolver))
    .filter((product): product is MemberProductDetail => product !== null)
    .map(card);
  return projected;
}
