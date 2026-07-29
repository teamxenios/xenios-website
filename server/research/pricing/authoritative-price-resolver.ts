/**
 * The authoritative price resolution facade. Server only.
 *
 * This module composes the existing fail-closed
 * ProductControlCurrentPriceResolver (the single authority for "which price
 * row is current") and translates its verdict into the customer-safe
 * PriceResolution contract from shared/research/pricing.ts.
 *
 * Boundary rules enforced here:
 * - The browser never chooses the audience. The audience input is a branded
 *   ServerAuthorizedAudience that can only be constructed by
 *   authorizeAudienceFromServerIdentity, which must be called with facts
 *   derived from the authenticated server-side session (member tier, account
 *   role), never from a request body, query string, header, or cookie value.
 * - Currency is normalized and allowlisted (USD only today).
 * - The response never carries supplier cost, wholesale source, margin,
 *   source URL, approval note, approver identity, or any internal field.
 *   CustomerPrice is built by explicit field picks, never by spread.
 * - Amounts are positive safe integers. A zero-amount row is never returned
 *   as available.
 * - When this module's failure classifier disagrees with the authority (the
 *   classifier thinks a price exists but the authority said no), the
 *   authority wins and the result fails closed as price_missing.
 */

import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { CartAudienceEligibility } from "@shared/research/cart-product-selection";
import {
  CUSTOMER_PRICE_AUDIENCES,
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
  type CustomerPrice,
  type CustomerPriceAudience,
  type PriceResolution,
  type PriceUnavailableReason,
  type SupportedPriceCurrency,
} from "@shared/research/pricing";
import {
  parseProductControlTimestamp,
  ProductControlCurrentPriceResolver,
  type ProductCatalogReader,
} from "../catalog/product-control-reader";

declare const serverAuthorizationBrand: unique symbol;

/**
 * An audience fact that provably originated on the server. The brand symbol
 * is not exported, so the only way to obtain this type is through
 * authorizeAudienceFromServerIdentity below. Route handlers must derive the
 * audience from the authenticated session identity, never from anything the
 * browser sent.
 */
export interface ServerAuthorizedAudience {
  readonly audience: CustomerPriceAudience;
  readonly sourceVersion: string;
  readonly evaluatedAt: string;
  readonly [serverAuthorizationBrand]: "server";
}

/**
 * Construct the branded audience fact from server-side authorization.
 * Call this only with values resolved from the authenticated session.
 * Returns null (fail closed) for anything malformed.
 */
export function authorizeAudienceFromServerIdentity(input: {
  audience: CustomerPriceAudience;
  sourceVersion: string;
  evaluatedAt: string;
}): ServerAuthorizedAudience | null {
  if (
    !(CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(input.audience) ||
    !input.sourceVersion.trim() ||
    parseProductControlTimestamp(input.evaluatedAt) === null
  ) {
    return null;
  }
  return {
    audience: input.audience,
    sourceVersion: input.sourceVersion,
    evaluatedAt: input.evaluatedAt,
  } as ServerAuthorizedAudience;
}

/** The smallest read surface this facade needs. */
export interface PricingProductSource {
  readProductForPricing(productId: string): Promise<AdminProductDetail | null>;
}

/**
 * Adapter from the existing drift-checked catalog reader to the pricing
 * read surface. Fails closed when the product id is absent or duplicated.
 */
export class CatalogPricingProductSource implements PricingProductSource {
  constructor(private readonly reader: ProductCatalogReader) {}

  async readProductForPricing(
    productId: string,
  ): Promise<AdminProductDetail | null> {
    const catalog = await this.reader.readCatalog();
    const matches = catalog.filter((product) => product.id === productId);
    return matches.length === 1 ? matches[0] : null;
  }
}

export interface ResolveApprovedResearchPriceInput {
  productId: string;
  variantId: string;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  at: string;
}

function unavailable(reason: PriceUnavailableReason): PriceResolution {
  return { state: "unavailable", reason };
}

function ambiguous(): PriceResolution {
  return { state: "ambiguous", reason: "price_ambiguous" };
}

function toCustomerPrice(
  price: AdminProductPrice,
  audience: CustomerPriceAudience,
  currency: SupportedPriceCurrency,
): CustomerPrice {
  // Explicit field picks only. Never spread the admin record: approvalNote,
  // approvedBy, createdBy, and audit timestamps must not cross this boundary.
  return {
    priceId: price.id,
    productId: price.productId,
    variantId: price.variantId,
    audience,
    amountCents: price.amountCents,
    currency,
    effectiveAt: price.effectiveAt,
    expiresAt: price.expiresAt,
    version: price.version,
  };
}

function priceRowWellFormed(
  price: AdminProductPrice,
): boolean {
  return (
    Boolean(price.id.trim()) &&
    Boolean(price.approvedBy) &&
    isCustomerSafeAmountCents(price.amountCents) &&
    Number.isInteger(price.version) &&
    price.version > 0 &&
    parseProductControlTimestamp(price.effectiveAt) !== null &&
    (price.expiresAt === null ||
      parseProductControlTimestamp(price.expiresAt) !== null)
  );
}

/**
 * Label why the authority returned no price. This classifier never overrides
 * the authority: if it finds exactly one candidate it believes is valid, the
 * result is still price_missing, because the authority already said no.
 */
function classifyFailure(input: {
  prices: readonly AdminProductPrice[];
  productId: string;
  variantId: string;
  audience: CustomerPriceAudience;
  currency: SupportedPriceCurrency;
  at: number;
}): PriceResolution {
  const identity = input.prices.filter(
    (price) =>
      price.productId === input.productId &&
      price.variantId === input.variantId,
  );
  if (identity.length === 0) return unavailable("price_missing");

  const forAudience = identity.filter(
    (price) => price.audience === input.audience,
  );
  if (forAudience.length === 0) return unavailable("wrong_audience");

  const forCurrency = forAudience.filter(
    (price) => price.currency === input.currency,
  );
  if (forCurrency.length === 0) return unavailable("wrong_currency");

  const active = forCurrency.filter((price) => price.status === "active");
  if (active.length === 0) {
    return forCurrency.some(
      (price) => price.status === "draft" || price.status === "approved",
    )
      ? unavailable("price_unapproved")
      : unavailable("price_inactive");
  }

  const wellFormed = active.filter(priceRowWellFormed);
  if (wellFormed.length === 0) return unavailable("price_unapproved");

  const inWindow = wellFormed.filter((price) => {
    const effectiveAt = parseProductControlTimestamp(price.effectiveAt);
    const expiresAt =
      price.expiresAt === null
        ? null
        : parseProductControlTimestamp(price.expiresAt);
    return (
      effectiveAt !== null &&
      effectiveAt <= input.at &&
      (price.expiresAt === null || (expiresAt !== null && expiresAt > input.at))
    );
  });
  if (inWindow.length === 0) {
    const anyFuture = wellFormed.some((price) => {
      const effectiveAt = parseProductControlTimestamp(price.effectiveAt);
      return effectiveAt !== null && effectiveAt > input.at;
    });
    return anyFuture ? unavailable("price_future") : unavailable("price_expired");
  }
  if (inWindow.length > 1) return ambiguous();

  // Exactly one candidate looks valid to the classifier, yet the authority
  // returned null. The authority wins. Fail closed.
  return unavailable("price_missing");
}

export class AuthoritativePriceResolver {
  private readonly authority = new ProductControlCurrentPriceResolver();

  constructor(private readonly source: PricingProductSource) {}

  async resolveApprovedResearchPrice(
    input: ResolveApprovedResearchPriceInput,
  ): Promise<PriceResolution> {
    const currency = normalizePriceCurrency(input.currency);
    if (currency === null) return unavailable("wrong_currency");

    const at = parseProductControlTimestamp(input.at);
    if (at === null || !input.productId.trim() || !input.variantId.trim()) {
      return unavailable("price_missing");
    }

    // Defense in depth on top of the brand: revalidate the authorization
    // fact at runtime, and require it to be evaluated for this exact instant
    // so a stale authorization cannot price a later moment.
    const authorized = input.authenticatedAudience;
    if (
      !(CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(
        authorized.audience,
      ) ||
      !authorized.sourceVersion.trim() ||
      parseProductControlTimestamp(authorized.evaluatedAt) !== at
    ) {
      return unavailable("wrong_audience");
    }

    const product = await this.source.readProductForPricing(input.productId);
    if (
      product === null ||
      product.id !== input.productId ||
      product.status !== "published" ||
      product.visibility !== "public" ||
      !product.active
    ) {
      return unavailable("product_inactive");
    }

    const variants = product.variants.filter(
      (variant: AdminProductVariant) =>
        variant.id === input.variantId &&
        variant.productId === input.productId,
    );
    if (variants.length === 0) return unavailable("variant_inactive");
    if (variants.length > 1) return ambiguous();
    const variant = variants[0];
    if (variant.status !== "approved") return unavailable("variant_unapproved");
    if (!variant.active) return unavailable("variant_inactive");
    if (authorized.audience === "member" && !variant.memberEligible) {
      return unavailable("member_ineligible");
    }

    const audienceEligibility: CartAudienceEligibility = {
      audience: authorized.audience,
      state: "authorized",
      sourceVersion: authorized.sourceVersion,
      evaluatedAt: authorized.evaluatedAt,
    };
    const resolved = this.authority.resolve({
      productId: input.productId,
      variant,
      prices: product.prices,
      audienceEligibility,
      currency,
      evaluatedAt: input.at,
    });

    if (resolved !== null) {
      // The authority allows amountCents >= 0; the customer boundary does
      // not. A zero-amount row is never displayable and never becomes $0.
      if (!isCustomerSafeAmountCents(resolved.amountCents)) {
        return unavailable("price_missing");
      }
      return {
        state: "available",
        price: toCustomerPrice(resolved, authorized.audience, currency),
      };
    }

    return classifyFailure({
      prices: product.prices,
      productId: input.productId,
      variantId: input.variantId,
      audience: authorized.audience,
      currency,
      at,
    });
  }
}

export function createAuthoritativePriceResolver(
  source: PricingProductSource,
): AuthoritativePriceResolver {
  return new AuthoritativePriceResolver(source);
}
