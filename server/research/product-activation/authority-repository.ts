import { createHash } from "node:crypto";

import type {
  NonliveProductVariantActivationState,
  ProductVariantActivationAuthorityEvidence,
} from "@shared/research/product-activation/contract";

export const PRODUCT_VARIANT_LEDGER_STATES = [
  "live",
  "held",
  "pending",
  "unavailable",
  "retired",
] as const;

export type ProductVariantLedgerState =
  (typeof PRODUCT_VARIANT_LEDGER_STATES)[number];

/**
 * One immutable row returned by the durable activation ledger.
 *
 * The repository is required to return every candidate for the exact SKU at
 * the evaluation instant. The resolver rejects zero, duplicate, mismatched,
 * revoked, stale, or conflicting rows; it never chooses a convenient first
 * row. `evidenceFingerprint` is recomputed here and cannot self-attest.
 */
export interface ProductVariantActivationLedgerRecord {
  schemaVersion: 1;
  ledgerRevision: number;
  productId: string;
  variantId: string;
  sku: string;
  productState: ProductVariantLedgerState;
  variantState: ProductVariantLedgerState;
  approvalId: string;
  approvedByActorId: string;
  approvedByRole: "founder" | "super_admin";
  approvedAt: string;
  reviewedAt: string;
  validFrom: string;
  validThrough: string;
  revokedAt: string | null;
  evidenceFingerprint: string;
}

export interface ProductVariantActivationLedgerRepository {
  /** A fresh durable lookup on every invocation; implementations must not cache. */
  readCurrentCandidates(input: Readonly<{
    sku: string;
    evaluatedAt: string;
  }>): Promise<readonly ProductVariantActivationLedgerRecord[]>;
}

/**
 * The durable Product Control identity bound to a legacy commerce SKU.
 * Legacy `CatalogProduct` records do not carry Product Control ids, so cart
 * mutation must resolve this exact-one binding before it may consult the
 * activation ledger. The activation row is then checked against these ids,
 * never against ids copied back from the row itself.
 */
export interface ProductVariantActivationBinding {
  productId: string;
  variantId: string;
  sku: string;
}

export interface ProductVariantActivationBindingRepository {
  /** A fresh durable Product Control lookup on every invocation; no cache. */
  readCurrentBindings(input: Readonly<{
    sku: string;
    evaluatedAt: string;
  }>): Promise<readonly ProductVariantActivationBinding[]>;
}

export interface ProductVariantActivationLookup {
  sku: string;
  productId?: string;
  variantId?: string;
  evaluatedAt: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRICT_ISO_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function exactInstant(value: string): number | null {
  if (!STRICT_ISO_UTC.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : null;
}

function nonBlank(value: string): boolean {
  return value.trim().length > 0;
}

/** Stable, length-unambiguous canonical payload for one immutable revision. */
export function canonicalProductVariantActivationPayload(
  row: Omit<ProductVariantActivationLedgerRecord, "evidenceFingerprint">,
): string {
  return JSON.stringify([
    row.schemaVersion,
    row.ledgerRevision,
    row.productId,
    row.variantId,
    row.sku,
    row.productState,
    row.variantState,
    row.approvalId,
    row.approvedByActorId,
    row.approvedByRole,
    row.approvedAt,
    row.reviewedAt,
    row.validFrom,
    row.validThrough,
    row.revokedAt,
  ]);
}

export function canonicalProductVariantActivationFingerprint(
  row: Omit<ProductVariantActivationLedgerRecord, "evidenceFingerprint">,
): string {
  return `sha256:${createHash("sha256")
    .update(canonicalProductVariantActivationPayload(row), "utf8")
    .digest("hex")}`;
}

const resolvedLiveEvidence = new WeakSet<object>();

type LiveEvidence = Extract<
  ProductVariantActivationAuthorityEvidence,
  { state: "live" }
>;

function nonlive(
  state: NonliveProductVariantActivationState,
  row?: Partial<Pick<ProductVariantActivationLedgerRecord, "productId" | "variantId" | "sku">>,
): ProductVariantActivationAuthorityEvidence {
  return {
    state,
    productId: row?.productId ?? null,
    variantId: row?.variantId ?? null,
    sku: row?.sku ?? null,
  };
}

function restrictiveState(
  productState: ProductVariantLedgerState,
  variantState: ProductVariantLedgerState,
): NonliveProductVariantActivationState {
  const states = [productState, variantState];
  if (states.includes("held")) return "held";
  if (states.includes("retired")) return "retired";
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("pending")) return "pending";
  return "conflicting";
}

/**
 * Deterministic adjudication after an authoritative repository read. Kept
 * private so a caller cannot seal a certificate by handing this module rows.
 * Purchase paths call the async repository wrapper below, which owns the
 * request-time read.
 */
function adjudicateProductVariantActivationCandidates(
  candidates: readonly ProductVariantActivationLedgerRecord[],
  exact: ProductVariantActivationLookup,
): ProductVariantActivationAuthorityEvidence {
  const evaluatedAt = exactInstant(exact.evaluatedAt);
  if (!nonBlank(exact.sku) || evaluatedAt === null) return nonlive("conflicting");
  if (candidates.length === 0) return nonlive("unavailable");
  if (candidates.length !== 1) return nonlive("ambiguous");

  const row = candidates[0];
  const identity = { productId: row.productId, variantId: row.variantId, sku: row.sku };
  if (
    row.schemaVersion !== 1 ||
    !Number.isSafeInteger(row.ledgerRevision) ||
    row.ledgerRevision <= 0 ||
    !nonBlank(row.productId) ||
    !nonBlank(row.variantId) ||
    !nonBlank(row.sku) ||
    row.sku !== exact.sku ||
    (exact.productId !== undefined && row.productId !== exact.productId) ||
    (exact.variantId !== undefined && row.variantId !== exact.variantId) ||
    !UUID.test(row.approvalId) ||
    !UUID.test(row.approvedByActorId) ||
    !["founder", "super_admin"].includes(row.approvedByRole) ||
    canonicalProductVariantActivationFingerprint(row) !== row.evidenceFingerprint
  ) {
    return nonlive("conflicting", identity);
  }

  if (row.revokedAt !== null) {
    return exactInstant(row.revokedAt) === null
      ? nonlive("conflicting", identity)
      : nonlive("revoked", identity);
  }

  if (row.productState !== "live" || row.variantState !== "live") {
    return nonlive(restrictiveState(row.productState, row.variantState), identity);
  }

  const approvedAt = exactInstant(row.approvedAt);
  const reviewedAt = exactInstant(row.reviewedAt);
  const validFrom = exactInstant(row.validFrom);
  const validThrough = exactInstant(row.validThrough);
  if (
    approvedAt === null ||
    reviewedAt === null ||
    validFrom === null ||
    validThrough === null ||
    approvedAt > reviewedAt ||
    reviewedAt > validFrom ||
    validFrom >= validThrough
  ) {
    return nonlive("conflicting", identity);
  }
  if (evaluatedAt < validFrom || evaluatedAt >= validThrough) {
    return nonlive("stale", identity);
  }

  const evidence: LiveEvidence = Object.freeze({
    state: "live",
    productState: "live",
    variantState: "live",
    productId: row.productId,
    variantId: row.variantId,
    sku: row.sku,
    source: "durable_activation_ledger",
    ledgerRevision: row.ledgerRevision,
    approvalId: row.approvalId,
    approvedByActorId: row.approvedByActorId,
    approvedByRole: row.approvedByRole,
    approvedAt: row.approvedAt,
    reviewedAt: row.reviewedAt,
    evaluatedAt: exact.evaluatedAt,
    validFrom: row.validFrom,
    validThrough: row.validThrough,
    evidenceFingerprint: row.evidenceFingerprint,
    revokedAt: null,
  });
  resolvedLiveEvidence.add(evidence);
  return evidence;
}

/**
 * The only purchase-authorizing entry point: fresh repository read followed by
 * exact-one, canonical-fingerprint, lifecycle, and revocation adjudication.
 * Read errors fail closed as unavailable and never reuse an earlier result.
 */
export async function resolveCurrentProductVariantActivationAuthority(
  repository: ProductVariantActivationLedgerRepository,
  exact: ProductVariantActivationLookup,
): Promise<ProductVariantActivationAuthorityEvidence> {
  try {
    const candidates = await repository.readCurrentCandidates({
      sku: exact.sku,
      evaluatedAt: exact.evaluatedAt,
    });
    if (!Array.isArray(candidates)) return nonlive("unavailable");
    return adjudicateProductVariantActivationCandidates(candidates, exact);
  } catch {
    return nonlive("unavailable");
  }
}

/** Resolve one exact Product Control binding; zero or duplicate rows refuse. */
export async function resolveCurrentProductVariantActivationBinding(
  repository: ProductVariantActivationBindingRepository,
  input: Readonly<{ sku: string; evaluatedAt: string }>,
): Promise<ProductVariantActivationBinding | null> {
  try {
    if (!nonBlank(input.sku) || exactInstant(input.evaluatedAt) === null) {
      return null;
    }
    const candidates = await repository.readCurrentBindings(input);
    if (!Array.isArray(candidates) || candidates.length !== 1) return null;
    const binding = candidates[0];
    if (
      !nonBlank(binding.productId) ||
      !nonBlank(binding.variantId) ||
      !nonBlank(binding.sku) ||
      binding.sku !== input.sku
    ) {
      return null;
    }
    return Object.freeze({ ...binding });
  } catch {
    return null;
  }
}

/**
 * Runtime proof that the value was produced by this process's resolver, not by
 * deserializing or copying a certificate-shaped object.
 */
export function isResolvedCurrentLiveProductVariantActivationAuthority(
  authority: ProductVariantActivationAuthorityEvidence | null | undefined,
  exact: ProductVariantActivationLookup,
): authority is LiveEvidence {
  return (
    authority?.state === "live" &&
    resolvedLiveEvidence.has(authority) &&
    (exact.productId === undefined || authority.productId === exact.productId) &&
    (exact.variantId === undefined || authority.variantId === exact.variantId) &&
    authority.sku === exact.sku &&
    authority.evaluatedAt === exact.evaluatedAt
  );
}

/** Production-safe absence until a durable ledger adapter is registered. */
export const unavailableProductVariantActivationLedger: ProductVariantActivationLedgerRepository = {
  readCurrentCandidates: async () => [],
};

export const unavailableProductVariantActivationBindings: ProductVariantActivationBindingRepository = {
  readCurrentBindings: async () => [],
};
