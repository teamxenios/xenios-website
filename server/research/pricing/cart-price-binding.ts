/**
 * Cart price binding. Server only.
 *
 * The lane that pins an authoritative price to a cart line. Given a SKU, a
 * quantity, and a server-authorized audience, this module resolves the current
 * price through the frozen pricing core and produces a CartPriceSnapshot, the
 * shape the cart persists so checkout can later prove what the member saw.
 *
 * Boundary rules enforced here:
 * - Client-supplied amounts, price ids, versions, and audiences are never
 *   inputs to authority. The only client inputs are a SKU and a quantity; the
 *   audience is the branded ServerAuthorizedAudience from the pricing core,
 *   revalidated again at runtime so a forged cast still fails closed.
 * - SKU to variant resolution is deterministic (research_product_variants.sku
 *   is UNIQUE). The injected lookup returns exactly one identity or null, and
 *   an identity that disagrees with the requested SKU fails closed.
 * - All arithmetic is integer only through the core helpers. Quantity must be
 *   a positive safe integer within an injectable max-quantity policy.
 * - Every failure is a typed rejection from a closed taxonomy. There is no
 *   default price, no zero price, and no -1 sentinel on any path.
 *
 * Nothing here performs IO of its own and nothing reads a clock: time is
 * always an explicit input, so every caller and every test is deterministic.
 */

import {
  computeLineTotalCents,
  CUSTOMER_PRICE_AUDIENCES,
  isCustomerPrice,
  isSafeQuantity,
  isValidCartPriceSnapshot,
  normalizePriceCurrency,
  PRICE_RESOLUTION_FAILURE_REASONS,
  type CartPriceSnapshot,
  type CustomerPrice,
  type PriceResolution,
  type PriceResolutionFailureReason,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import type {
  ResolveApprovedResearchPriceInput,
  ServerAuthorizedAudience,
} from "./authoritative-price-resolver";

// ---------------------------------------------------------------------------
// Injectable read surfaces
// ---------------------------------------------------------------------------

/**
 * The one variant identity a SKU resolves to. Carries only what a snapshot
 * needs: identity plus a display name. No price, no cost, no internal field.
 */
export interface VariantIdentity {
  productId: string;
  variantId: string;
  sku: string;
  displayName: string;
}

/**
 * SKU to variant resolution. The database enforces SKU uniqueness, so the
 * implementation returns exactly one identity or null; there is no ambiguous
 * shape by construction. A null is always a fail-closed answer.
 */
export interface VariantLookupBySku {
  findVariantBySku(sku: string): Promise<VariantIdentity | null>;
}

/**
 * The pricing-core resolver facade, as the smallest port this lane needs.
 * The real AuthoritativePriceResolver satisfies this structurally; tests
 * inject in-memory fakes with the same fail-closed semantics.
 */
export interface PriceResolverPort {
  resolveApprovedResearchPrice(
    input: ResolveApprovedResearchPriceInput,
  ): Promise<PriceResolution>;
}

/** The two readers every price-lineage module resolves through. */
export interface PriceLineageReaders {
  variants: VariantLookupBySku;
  priceResolver: PriceResolverPort;
}

/**
 * Injectable ceiling for a single cart line. The default mirrors
 * MAX_LINE_QUANTITY in server/research/commerce/cart.ts (1000): far above any
 * real order, far below where integer-cents arithmetic stops being exact.
 * The duplication is deliberate; that module is outside this lane's lease.
 */
export interface QuantityPolicy {
  maxQuantity: number;
}

export const DEFAULT_QUANTITY_POLICY: QuantityPolicy = { maxQuantity: 1000 };

function isUsableQuantityPolicy(policy: QuantityPolicy): boolean {
  return isSafeQuantity(policy.maxQuantity);
}

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/** Failures shared by every module that resolves a SKU to a current price. */
export const SKU_RESOLVE_FAILURE_REASONS = [
  ...PRICE_RESOLUTION_FAILURE_REASONS,
  "sku_unknown",
  "audience_unauthorized",
  "invalid_instant",
] as const;

export type SkuResolveFailureReason = (typeof SKU_RESOLVE_FAILURE_REASONS)[number];

export type CartBindingRejectionReason =
  | SkuResolveFailureReason
  | "quantity_invalid"
  | "line_total_overflow";

export type CartRevalidationRejectionReason =
  | CartBindingRejectionReason
  | "snapshot_malformed"
  | "sku_remapped";

// ---------------------------------------------------------------------------
// Runtime authorization revalidation
// ---------------------------------------------------------------------------

/**
 * Defense in depth on top of the pricing core's brand: revalidate the
 * authorization fact at runtime and require it to be evaluated at exactly the
 * instant being priced. A value cast past the type system, an off-allowlist
 * audience, a blank source version, or a stale evaluation all fail closed
 * here, before any reader is consulted.
 */
export function isRuntimeAuthorizedAudience(
  authorized: ServerAuthorizedAudience,
  atMillis: number,
): boolean {
  if (typeof authorized !== "object" || authorized === null) return false;
  return (
    (CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(
      authorized.audience,
    ) &&
    typeof authorized.sourceVersion === "string" &&
    authorized.sourceVersion.trim().length > 0 &&
    typeof authorized.evaluatedAt === "string" &&
    parseProductControlTimestamp(authorized.evaluatedAt) === atMillis
  );
}

// ---------------------------------------------------------------------------
// Shared SKU price resolution
// ---------------------------------------------------------------------------

export interface ResolveSkuPriceInput {
  sku: string;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  at: string;
}

export type SkuPriceOutcome =
  | { state: "resolved"; variant: VariantIdentity; price: CustomerPrice }
  | { state: "failed"; reason: SkuResolveFailureReason };

function failed(reason: SkuResolveFailureReason): SkuPriceOutcome {
  return { state: "failed", reason };
}

function isCoherentVariantIdentity(
  identity: VariantIdentity,
  requestedSku: string,
): boolean {
  return (
    typeof identity === "object" &&
    identity !== null &&
    typeof identity.productId === "string" &&
    identity.productId.trim().length > 0 &&
    typeof identity.variantId === "string" &&
    identity.variantId.trim().length > 0 &&
    typeof identity.displayName === "string" &&
    identity.displayName.trim().length > 0 &&
    identity.sku === requestedSku
  );
}

/**
 * The one path from a SKU to a current authoritative price. Used by the cart
 * binding, the checkout recompute, and the subscription price validation, so
 * every lane fails closed identically.
 */
export async function resolveSkuPrice(
  input: ResolveSkuPriceInput,
  readers: PriceLineageReaders,
): Promise<SkuPriceOutcome> {
  const atMillis = parseProductControlTimestamp(input.at);
  if (atMillis === null) return failed("invalid_instant");

  if (!isRuntimeAuthorizedAudience(input.authenticatedAudience, atMillis)) {
    return failed("audience_unauthorized");
  }

  const currency = normalizePriceCurrency(input.currency);
  if (currency === null) return failed("wrong_currency");

  const sku = typeof input.sku === "string" ? input.sku.trim() : "";
  if (sku.length === 0) return failed("sku_unknown");

  const identity = await readers.variants.findVariantBySku(sku);
  if (identity === null || !isCoherentVariantIdentity(identity, sku)) {
    return failed("sku_unknown");
  }

  const resolution = await readers.priceResolver.resolveApprovedResearchPrice({
    productId: identity.productId,
    variantId: identity.variantId,
    authenticatedAudience: input.authenticatedAudience,
    currency,
    at: input.at,
  });

  if (resolution.state === "ambiguous") return failed("price_ambiguous");
  if (resolution.state === "unavailable") return failed(resolution.reason);

  // Defensive: the resolver already guarantees a customer-safe price, but a
  // fake or future implementation must not be able to smuggle a malformed or
  // mismatched price through this seam. The authority answer must be for the
  // exact identity and audience asked about.
  const price = resolution.price;
  if (
    !isCustomerPrice(price) ||
    price.productId !== identity.productId ||
    price.variantId !== identity.variantId ||
    price.audience !== input.authenticatedAudience.audience ||
    price.currency !== currency
  ) {
    return failed("price_missing");
  }

  return { state: "resolved", variant: identity, price };
}

// ---------------------------------------------------------------------------
// Binding: produce a CartPriceSnapshot
// ---------------------------------------------------------------------------

export interface BindCartPriceInput {
  sku: string;
  quantity: number;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  /** The instant this line is being priced. Always explicit, never a clock. */
  at: string;
}

export type CartPriceBindingResult =
  | { state: "bound"; snapshot: CartPriceSnapshot }
  | { state: "rejected"; reason: CartBindingRejectionReason };

export interface CartPriceBindingDeps extends PriceLineageReaders {
  quantityPolicy?: QuantityPolicy;
}

function rejected(reason: CartBindingRejectionReason): CartPriceBindingResult {
  return { state: "rejected", reason };
}

function buildSnapshot(
  variant: VariantIdentity,
  price: CustomerPrice,
  quantity: number,
  lineTotalCents: number,
  pricedAt: string,
): CartPriceSnapshot {
  // Explicit field picks only, so nothing extra a reader attached can ride
  // through into persistence.
  return Object.freeze({
    productId: variant.productId,
    variantId: variant.variantId,
    sku: variant.sku,
    displayName: variant.displayName,
    priceId: price.priceId,
    priceVersion: price.version,
    audience: price.audience,
    currency: price.currency,
    unitAmountCents: price.amountCents,
    quantity,
    lineTotalCents,
    effectiveAt: price.effectiveAt,
    expiresAt: price.expiresAt,
    pricedAt,
  });
}

/**
 * Price one cart line against the authority and pin the result. The snapshot
 * records exactly which price row, version, audience, and amount the member
 * saw, and when. Checkout later re-resolves and compares; it never trusts
 * this snapshot as authority, only as the claim to verify.
 */
export async function bindCartPrice(
  input: BindCartPriceInput,
  deps: CartPriceBindingDeps,
): Promise<CartPriceBindingResult> {
  const policy = deps.quantityPolicy ?? DEFAULT_QUANTITY_POLICY;
  // A malformed policy fails closed: no quantity is valid under it.
  if (!isUsableQuantityPolicy(policy)) return rejected("quantity_invalid");
  if (!isSafeQuantity(input.quantity) || input.quantity > policy.maxQuantity) {
    return rejected("quantity_invalid");
  }

  const outcome = await resolveSkuPrice(
    {
      sku: input.sku,
      authenticatedAudience: input.authenticatedAudience,
      currency: input.currency,
      at: input.at,
    },
    deps,
  );
  if (outcome.state === "failed") return rejected(outcome.reason);

  let lineTotalCents: number;
  try {
    lineTotalCents = computeLineTotalCents(
      outcome.price.amountCents,
      input.quantity,
    );
  } catch {
    return rejected("line_total_overflow");
  }

  const snapshot = buildSnapshot(
    outcome.variant,
    outcome.price,
    input.quantity,
    lineTotalCents,
    input.at,
  );
  // Final self-check: a snapshot that fails its own validity guard is never
  // released. This is the last stop before persistence.
  if (!isValidCartPriceSnapshot(snapshot)) return rejected("quantity_invalid");
  return { state: "bound", snapshot };
}

// ---------------------------------------------------------------------------
// Revalidation: is an existing snapshot still the truth?
// ---------------------------------------------------------------------------

export type CartSnapshotRevalidation =
  | { state: "valid"; refreshed: CartPriceSnapshot }
  | {
      state: "reprice_required";
      staleVersion: number;
      currentVersion: number;
      refreshed: CartPriceSnapshot;
    }
  | { state: "rejected"; reason: CartRevalidationRejectionReason };

export interface RevalidateCartPriceSnapshotInput {
  /** Unknown on purpose: a stored value is validated, never trusted. */
  snapshot: unknown;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  at: string;
}

function revalidationRejected(
  reason: CartRevalidationRejectionReason,
): CartSnapshotRevalidation {
  return { state: "rejected", reason };
}

/**
 * Re-prove an existing cart snapshot against the authority at a later
 * instant. Anything structurally off (a tampered total, a -1 sentinel, a
 * missing field) rejects as snapshot_malformed before any reader runs. A
 * price whose version or economics moved comes back as a typed
 * reprice_required carrying the fresh snapshot, so the caller can reprice
 * explicitly rather than silently charging a number the member never saw.
 */
export async function revalidateCartPriceSnapshot(
  input: RevalidateCartPriceSnapshotInput,
  deps: CartPriceBindingDeps,
): Promise<CartSnapshotRevalidation> {
  if (!isValidCartPriceSnapshot(input.snapshot)) {
    return revalidationRejected("snapshot_malformed");
  }
  const snapshot = input.snapshot;

  const atMillis = parseProductControlTimestamp(input.at);
  if (atMillis === null) return revalidationRejected("invalid_instant");
  if (!isRuntimeAuthorizedAudience(input.authenticatedAudience, atMillis)) {
    return revalidationRejected("audience_unauthorized");
  }
  // The snapshot must belong to the audience asking. A member cannot ride a
  // wholesale snapshot through checkout, and the reverse also fails.
  if (snapshot.audience !== input.authenticatedAudience.audience) {
    return revalidationRejected("wrong_audience");
  }
  const currency = normalizePriceCurrency(input.currency);
  if (currency === null || snapshot.currency !== currency) {
    return revalidationRejected("wrong_currency");
  }

  const policy = deps.quantityPolicy ?? DEFAULT_QUANTITY_POLICY;
  if (!isUsableQuantityPolicy(policy)) {
    return revalidationRejected("quantity_invalid");
  }
  if (
    !isSafeQuantity(snapshot.quantity) ||
    snapshot.quantity > policy.maxQuantity
  ) {
    return revalidationRejected("quantity_invalid");
  }

  const outcome = await resolveSkuPrice(
    {
      sku: snapshot.sku,
      authenticatedAudience: input.authenticatedAudience,
      currency: input.currency,
      at: input.at,
    },
    deps,
  );
  if (outcome.state === "failed") return revalidationRejected(outcome.reason);

  // The SKU must still resolve to the variant the snapshot pinned. A SKU that
  // now points at a different product or variant is a remap, not a reprice.
  if (
    outcome.variant.productId !== snapshot.productId ||
    outcome.variant.variantId !== snapshot.variantId
  ) {
    return revalidationRejected("sku_remapped");
  }

  let lineTotalCents: number;
  try {
    lineTotalCents = computeLineTotalCents(
      outcome.price.amountCents,
      snapshot.quantity,
    );
  } catch {
    return revalidationRejected("line_total_overflow");
  }

  const refreshed = buildSnapshot(
    outcome.variant,
    outcome.price,
    snapshot.quantity,
    lineTotalCents,
    input.at,
  );
  if (!isValidCartPriceSnapshot(refreshed)) {
    return revalidationRejected("snapshot_malformed");
  }

  // Any economic drift requires an explicit reprice: a new version, a new
  // price row, a changed amount, or a changed validity window. The member
  // must see the new number; it is never applied silently.
  const economicallyIdentical =
    refreshed.priceId === snapshot.priceId &&
    refreshed.priceVersion === snapshot.priceVersion &&
    refreshed.unitAmountCents === snapshot.unitAmountCents &&
    refreshed.currency === snapshot.currency &&
    refreshed.audience === snapshot.audience &&
    refreshed.effectiveAt === snapshot.effectiveAt &&
    refreshed.expiresAt === snapshot.expiresAt;
  if (!economicallyIdentical) {
    return {
      state: "reprice_required",
      staleVersion: snapshot.priceVersion,
      currentVersion: refreshed.priceVersion,
      refreshed,
    };
  }

  return { state: "valid", refreshed };
}
