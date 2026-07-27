import {
  CART_PURCHASE_AUDIENCES,
  CART_PRODUCT_SELECTION_FAILURE_CODES,
  type CartProductSelection,
} from "@shared/research/cart-product-selection";
import {
  isSafeMemberCatalogPathwayName,
  MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY,
  MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION,
  MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY,
  MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS,
  MEMBER_CATALOG_SORTS,
  type MemberCatalog,
  type MemberCatalogCard,
  type MemberCatalogMediaPresentation,
  type MemberCatalogPrice,
  type MemberCatalogReadiness,
  type MemberCatalogResult,
  type MemberCatalogVariant,
  type MemberProductDetail,
  type MemberProductDetailResult,
} from "@shared/research/member-catalog";
import { PRODUCT_LANES } from "@shared/research/catalog";
import { adaptCartProductSelection } from "./cartProductSelection";

const DISPLAY_STATES = new Set([
  "available",
  "unavailable",
  "documentation_pending",
  "pricing_pending",
  "catalog_only",
]);
const FORBIDDEN_KEYS = new Set([
  "storageKey",
  "privateStorageKey",
  "enteredValue",
  "auditHistory",
  "reason",
  "quantity",
  "lotId",
  "locationId",
  "provider",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function canonicalIso(value: unknown): value is string {
  if (
    !text(value) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function safeMediaHref(
  value: unknown,
  policy: unknown,
  expiresAt: unknown,
  evaluatedAt: string,
  expectedObjectPath: string,
): value is string {
  if (!text(value) || !canonicalIso(evaluatedAt)) return false;
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
    if (
      policy !== "xenios_signed_storage_v1" ||
      !canonicalIso(expiresAt) ||
      Date.parse(expiresAt) <= Date.parse(evaluatedAt) ||
      Date.parse(expiresAt) >
        Date.parse(evaluatedAt) +
          MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS * 1000
    ) {
      return false;
    }
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
      )
    );
  } catch {
    return false;
  }
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(child),
  );
}

function price(value: unknown): MemberCatalogPrice | null | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !text(value.id) ||
    !Number.isSafeInteger(value.amountCents) ||
    Number(value.amountCents) < 0 ||
    !text(value.currency) ||
    value.currency !== value.currency.toUpperCase() ||
    !canonicalIso(value.effectiveAt) ||
    !(value.expiresAt === null || canonicalIso(value.expiresAt)) ||
    !Number.isInteger(value.version) ||
    Number(value.version) <= 0
  ) {
    return undefined;
  }
  return {
    id: value.id,
    amountCents: Number(value.amountCents),
    currency: value.currency,
    effectiveAt: value.effectiveAt,
    expiresAt: value.expiresAt as string | null,
    version: Number(value.version),
  };
}

function media(
  value: unknown,
  productId: string,
  evaluatedAt: string,
): MemberCatalogMediaPresentation | null | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !text(value.mediaId) ||
    value.productId !== productId ||
    !text(value.filename) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.filename) ||
    value.filename === "." ||
    value.filename === ".." ||
    !safeMediaHref(
      value.href,
      value.policy,
      value.expiresAt,
      evaluatedAt,
      `${productId}/${value.mediaId}/${value.filename}`,
    ) ||
    !text(value.altText) ||
    !text(value.sourceVersion)
  ) {
    return undefined;
  }
  return {
    mediaId: value.mediaId,
    productId,
    href: value.href,
    altText: value.altText,
    filename: value.filename,
    sourceVersion: value.sourceVersion,
    policy: value.policy as MemberCatalogMediaPresentation["policy"],
    expiresAt: value.expiresAt as string | null,
  };
}

function priceIsCurrent(value: MemberCatalogPrice | null, evaluatedAt: string) {
  if (value === null) return true;
  const at = Date.parse(evaluatedAt);
  const effectiveAt = Date.parse(value.effectiveAt);
  const expiresAt =
    value.expiresAt === null ? null : Date.parse(value.expiresAt);
  return (
    effectiveAt <= at &&
    (expiresAt === null || expiresAt > at)
  );
}

function versionRefs(
  value: unknown,
  identity: "id" | "domain",
): Array<{ id: string; version: number }> | Array<{ domain: string; version: number }> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const seen = new Set<string>();
  const output: Array<{ id: string; version: number }> = [];
  for (const item of value) {
    if (
      !isObject(item) ||
      !text(item[identity]) ||
      !Number.isInteger(item.version) ||
      Number(item.version) <= 0 ||
      seen.has(item[identity] as string)
    ) {
      return null;
    }
    seen.add(item[identity] as string);
    output.push({ id: item[identity] as string, version: Number(item.version) });
  }
  return identity === "id"
    ? output
    : output.map(({ id, version }) => ({ domain: id, version }));
}

function readiness(value: unknown): MemberCatalogReadiness | null | undefined {
  if (value === null) return null;
  if (!isObject(value) || value.ready !== true) return undefined;
  const inputs = versionRefs(value.inputVersions, "id") as
    | Array<{ id: string; version: number }>
    | null;
  const domains = versionRefs(value.domainVersions, "domain") as
    | Array<{ domain: string; version: number }>
    | null;
  if (
    inputs === null ||
    domains === null ||
    !Number.isInteger(value.verifiedInputCount) ||
    Number(value.verifiedInputCount) !== inputs.length
  ) {
    return undefined;
  }
  return {
    ready: true,
    verifiedInputCount: inputs.length,
    inputVersions: inputs,
    domainVersions: domains,
  };
}

function card(value: unknown, evaluatedAt: string): MemberCatalogCard | null {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !text(value.slug) ||
    !text(value.displayName) ||
    !Array.isArray(value.aliases) ||
    !value.aliases.every((item) => typeof item === "string") ||
    !PRODUCT_LANES.includes(value.lane as never) ||
    !text(value.category) ||
    !text(value.classification) ||
    !text(value.summary) ||
    !DISPLAY_STATES.has(String(value.displayState)) ||
    !Number.isInteger(value.variantCount) ||
    Number(value.variantCount) < 0 ||
    !canonicalIso(value.updatedAt)
  ) {
    return null;
  }
  const safePrice = price(value.price);
  const safeMedia = media(value.media, value.id, evaluatedAt);
  const safeReadiness = readiness(value.readiness);
  let safeSelection: CartProductSelection | null = null;
  if (value.selection !== null) {
    const adapted = adaptCartProductSelection({
      ok: true,
      selection: value.selection,
    });
    if (!adapted.ok || adapted.selection.productId !== value.id) return null;
    safeSelection = adapted.selection;
  }
  if (
    safePrice === undefined ||
    safeMedia === undefined ||
    safeReadiness === undefined ||
    (value.displayState === "available" &&
      (safePrice === null ||
        safeMedia === null ||
        safeReadiness === null ||
        safeSelection === null)) ||
    (value.displayState !== "available" && safeSelection !== null) ||
    (safeSelection !== null &&
      (safeSelection.price.id !== safePrice?.id ||
        safeSelection.price.version !== safePrice?.version ||
        safeSelection.price.amountCents !== safePrice?.amountCents ||
        safeSelection.price.currency !== safePrice?.currency ||
        safeSelection.price.effectiveAt !== safePrice?.effectiveAt ||
        safeSelection.price.expiresAt !== safePrice?.expiresAt ||
        safeSelection.media.id !== safeMedia?.mediaId ||
        safeSelection.media.altText !== safeMedia?.altText ||
        JSON.stringify(safeSelection.canonicalReadiness) !==
          JSON.stringify(safeReadiness)))
  ) {
    return null;
  }
  return {
    id: value.id,
    slug: value.slug,
    displayName: value.displayName,
    aliases: [...value.aliases] as string[],
    lane: value.lane as MemberCatalogCard["lane"],
    category: value.category,
    classification: value.classification,
    summary: value.summary,
    displayState: value.displayState as MemberCatalogCard["displayState"],
    media: safeMedia,
    price: safePrice,
    readiness: safeReadiness,
    selection: safeSelection,
    variantCount: Number(value.variantCount),
    updatedAt: value.updatedAt,
  };
}

function variant(value: unknown, productId: string): MemberCatalogVariant | null {
  if (
    !isObject(value) ||
    !text(value.id) ||
    value.productId !== productId ||
    !text(value.sku) ||
    !text(value.label) ||
    !nullableText(value.strength) ||
    !nullableText(value.size) ||
    !nullableText(value.format) ||
    !nullableText(value.presentation) ||
    !nullableText(value.shippingClass) ||
    !["available", "unavailable"].includes(String(value.availability)) ||
    !["verified", "required", "not_applicable"].includes(
      String(value.lotCoaState),
    )
  ) {
    return null;
  }
  const safePrice = price(value.price);
  if (safePrice === undefined) return null;
  let selection: CartProductSelection | null = null;
  if (value.selection !== null) {
    const adapted = adaptCartProductSelection({
      ok: true,
      selection: value.selection,
    });
    if (
      !adapted.ok ||
      adapted.selection.productId !== productId ||
      adapted.selection.variantId !== value.id
    ) {
      return null;
    }
    selection = adapted.selection;
  }
  if (
    !(
      value.selectionFailure === null ||
      (typeof value.selectionFailure === "string" &&
        (
          CART_PRODUCT_SELECTION_FAILURE_CODES as readonly string[]
        ).includes(value.selectionFailure))
    ) ||
    (selection === null) === (value.selectionFailure === null)
  ) {
    return null;
  }
  return {
    id: value.id,
    productId,
    sku: value.sku,
    label: value.label,
    strength: value.strength as string | null,
    size: value.size as string | null,
    format: value.format as string | null,
    presentation: value.presentation as string | null,
    shippingClass: value.shippingClass as string | null,
    price: safePrice,
    availability: value.availability as MemberCatalogVariant["availability"],
    lotCoaState: value.lotCoaState as MemberCatalogVariant["lotCoaState"],
    selection,
    selectionFailure:
      value.selectionFailure as MemberCatalogVariant["selectionFailure"],
  };
}

function detail(value: unknown): MemberProductDetail | null {
  if (
    !isObject(value) ||
    !(CART_PURCHASE_AUDIENCES as readonly unknown[]).includes(value.audience) ||
    !text(value.currency) ||
    value.currency !== value.currency.toUpperCase() ||
    !canonicalIso(value.evaluatedAt)
  ) {
    return null;
  }
  const detailEvaluatedAt = value.evaluatedAt;
  const base = card(value, detailEvaluatedAt);
  if (
    base === null ||
    !text(value.canonicalName) ||
    !nullableText(value.overview) ||
    !nullableText(value.specifications) ||
    !nullableText(value.researchInformation) ||
    !nullableText(value.storageInformation) ||
    !nullableText(value.shippingInformation) ||
    !nullableText(value.returnInformation) ||
    !nullableText(value.disclaimers) ||
    !nullableText(value.reviewDate) ||
    !Array.isArray(value.variants) ||
    !Array.isArray(value.relatedProducts) ||
    typeof value.researchOnlyBoundary !== "boolean"
  ) {
    return null;
  }
  const variants = value.variants.map((item) => variant(item, base.id));
  const related = value.relatedProducts.map((item) =>
    card(item, detailEvaluatedAt),
  );
  const safeReadiness = base.readiness;
  const nontransactional =
    base.lane === "future_clinical" ||
    base.lane === "non_product_program";
  if (
    variants.some((item) => item === null) ||
    related.some((item) => item === null) ||
    new Set(variants.map((item) => item!.id)).size !== variants.length ||
    new Set(related.map((item) => item!.id)).size !== related.length ||
    related.some((item) => item?.id === base.id) ||
    !priceIsCurrent(base.price, detailEvaluatedAt) ||
    related.some(
      (item) =>
        item !== null &&
        (!priceIsCurrent(item.price, detailEvaluatedAt) ||
          (item.price !== null && item.price.currency !== value.currency) ||
          (item.selection !== null &&
            (item.selection.audience !== value.audience ||
              item.selection.evaluatedAt !== detailEvaluatedAt ||
              item.selection.price.currency !== value.currency))),
    ) ||
    variants.some(
      (item) =>
        item !== null &&
        (!priceIsCurrent(item.price, detailEvaluatedAt) ||
          (item.price !== null && item.price.currency !== value.currency) ||
          (item.selection !== null &&
            (item.selection.audience !== value.audience ||
              item.selection.evaluatedAt !== detailEvaluatedAt ||
              item.selection.inventoryEligibility.productId !== base.id ||
              item.selection.inventoryEligibility.variantId !== item.id ||
              item.selection.inventoryEligibility.evaluatedAt !==
                detailEvaluatedAt ||
              item.selection.inventoryEligibility.state !== "eligible" ||
              item.availability !== "available" ||
              !["verified", "not_applicable"].includes(item.lotCoaState) ||
              item.selection.price.id !== item.price?.id ||
              item.selection.price.version !== item.price?.version ||
              item.selection.price.amountCents !== item.price?.amountCents ||
              item.selection.price.currency !== item.price?.currency ||
              item.selection.price.effectiveAt !== item.price?.effectiveAt ||
              item.selection.price.expiresAt !== item.price?.expiresAt ||
              item.selection.media.id !== base.media?.mediaId ||
              item.selection.media.altText !== base.media?.altText ||
              JSON.stringify(item.selection.canonicalReadiness) !==
                JSON.stringify(safeReadiness))))
    ) ||
    (base.price !== null && base.price.currency !== value.currency) ||
    (base.displayState === "available") !==
      variants.some((item) => item?.selection !== null) ||
    (base.displayState === "catalog_only" &&
      variants.some((item) => item?.selection !== null)) ||
    (variants.some((item) => item?.selection !== null) &&
      safeReadiness === null) ||
    (base.selection !== null &&
      !variants.some(
        (item) =>
          item !== null &&
          item.selection !== null &&
          JSON.stringify(item.selection) === JSON.stringify(base.selection),
      )) ||
    (nontransactional &&
      (base.displayState !== "catalog_only" ||
        base.summary !== MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY ||
        base.price !== null ||
        base.selection !== null ||
        base.readiness !== null ||
        base.variantCount !== 0 ||
        variants.length !== 0 ||
        value.researchOnlyBoundary !== true ||
        value.overview !== null ||
        value.specifications !== null ||
        value.researchInformation !== null ||
        value.storageInformation !== null ||
        value.shippingInformation !== null ||
        value.returnInformation !== null ||
        value.disclaimers !== null ||
        value.reviewDate !== null)) ||
    (base.lane === "future_clinical" &&
      (!isSafeMemberCatalogPathwayName(base.displayName) ||
        value.canonicalName !== base.displayName ||
        base.aliases.length !== 0 ||
        base.category !== MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY ||
        base.classification !==
          MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION)) ||
    (base.lane === "non_product_program" &&
      (base.displayName !== "Research program" ||
        value.canonicalName !== "Research program" ||
        base.aliases.length !== 0 ||
        base.category !== MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY ||
        base.classification !==
          MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION))
  ) {
    return null;
  }
  return {
    ...base,
    audience: value.audience as MemberProductDetail["audience"],
    currency: value.currency,
    evaluatedAt: detailEvaluatedAt,
    canonicalName: value.canonicalName,
    overview: value.overview as string | null,
    specifications: value.specifications as string | null,
    researchInformation: value.researchInformation as string | null,
    storageInformation: value.storageInformation as string | null,
    shippingInformation: value.shippingInformation as string | null,
    returnInformation: value.returnInformation as string | null,
    disclaimers: value.disclaimers as string | null,
    reviewDate: value.reviewDate as string | null,
    variants: variants as MemberCatalogVariant[],
    relatedProducts: related as MemberCatalogCard[],
    researchOnlyBoundary: value.researchOnlyBoundary,
  };
}

export function adaptMemberCatalog(value: unknown): MemberCatalogResult {
  if (
    hasForbiddenKey(value) ||
    !isObject(value) ||
    value.ok !== true ||
    !isObject(value.catalog)
  ) {
    return { ok: false, code: "invalid_projection" };
  }
  const catalog = value.catalog;
  if (
    !(CART_PURCHASE_AUDIENCES as readonly unknown[]).includes(
      catalog.audience,
    ) ||
    !text(catalog.currency) ||
    catalog.currency !== catalog.currency.toUpperCase() ||
    !canonicalIso(catalog.evaluatedAt) ||
    !Array.isArray(catalog.items) ||
    !Array.isArray(catalog.categories) ||
    !catalog.categories.every(text) ||
    !Array.isArray(catalog.lanes) ||
    !catalog.lanes.every((lane) => PRODUCT_LANES.includes(lane as never))
  ) {
    return { ok: false, code: "invalid_projection" };
  }
  const catalogEvaluatedAt = catalog.evaluatedAt as string;
  const items = catalog.items.map((item) => card(item, catalogEvaluatedAt));
  if (
    items.some((item) => item === null) ||
    new Set(items.map((item) => item!.id)).size !== items.length ||
    new Set(items.map((item) => item!.slug)).size !== items.length ||
    items.some(
      (item) =>
        item !== null &&
        (!priceIsCurrent(item.price, catalogEvaluatedAt) ||
          (item.price !== null && item.price.currency !== catalog.currency) ||
          (item.selection !== null &&
            (item.selection.audience !== catalog.audience ||
              item.selection.evaluatedAt !== catalogEvaluatedAt ||
              item.selection.inventoryEligibility.productId !== item.id ||
              item.selection.inventoryEligibility.evaluatedAt !==
                catalogEvaluatedAt ||
              item.selection.price.currency !== catalog.currency))),
    ) ||
    items.some(
      (item) =>
        item !== null &&
        (item.lane === "future_clinical" ||
          item.lane === "non_product_program") &&
        (item.displayState !== "catalog_only" ||
          item.summary !== MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY ||
          item.price !== null ||
          item.selection !== null ||
          item.readiness !== null ||
          item.variantCount !== 0 ||
          (item.lane === "future_clinical" &&
            (!isSafeMemberCatalogPathwayName(item.displayName) ||
              item.aliases.length !== 0 ||
              item.category !== MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY ||
              item.classification !==
                MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION)) ||
          (item.lane === "non_product_program" &&
            (item.displayName !== "Research program" ||
              item.aliases.length !== 0 ||
              item.category !== MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY ||
              item.classification !==
                MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION))),
    )
  ) {
    return { ok: false, code: "invalid_projection" };
  }
  return {
    ok: true,
    catalog: {
      audience: catalog.audience as MemberCatalog["audience"],
      currency: catalog.currency,
      evaluatedAt: catalogEvaluatedAt,
      items: items as MemberCatalogCard[],
      categories: [...catalog.categories] as string[],
      lanes: [...catalog.lanes] as MemberCatalog["lanes"],
    },
  };
}

export function adaptMemberProductDetail(
  value: unknown,
): MemberProductDetailResult {
  if (isObject(value) && value.ok === false && value.code === "not_found") {
    return { ok: false, code: "not_found" };
  }
  if (
    hasForbiddenKey(value) ||
    !isObject(value) ||
    value.ok !== true ||
    !("product" in value)
  ) {
    return { ok: false, code: "invalid_projection" };
  }
  const product = detail(value.product);
  return product
    ? { ok: true, product }
    : { ok: false, code: "invalid_projection" };
}

export { MEMBER_CATALOG_SORTS };
