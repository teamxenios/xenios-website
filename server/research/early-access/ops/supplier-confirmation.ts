/**
 * SUPPLIER_CONFIRMED_ON_DEMAND: a supplier's expiring commitment to fulfill
 * one exact unit, recorded by a named human.
 *
 * This record is the whole critical path between "42 clean units" and "one
 * sellable product". `FULFILLMENT_UNAVAILABLE` is a NON-WAIVABLE blocker, a
 * founder release cannot bridge it, and this repository carries no inventory
 * lots, so without this record no amount of founder-supplied DATA can make a
 * unit purchasable. With it, fulfillment becomes a truthful, auditable,
 * expiring fact.
 *
 * Three properties are load-bearing:
 *
 * 1. VARIANT-EXACT. A confirmation binds to the exact product AND variant, for
 *    the same reason strength disputes are non-waivable: "the supplier can
 *    ship BPC-157" says nothing about which vial.
 * 2. EXPIRING. Liveness is DERIVED from the clock (`supplierConfirmationHoldsAt`),
 *    exactly like a reservation and a founder release. An expired confirmation
 *    returns the unit to held automatically; no process needs to run.
 * 3. NAMED-HUMAN. `confirmedBy` refuses system-ish names, mirroring the
 *    durable table's constraint. Availability is a human commitment here,
 *    never an automated inference.
 *
 * The durable store is `research_early_access_supplier_confirmations`
 * (migration 20260804122000); the field names below mirror its columns.
 * Documentation is deliberately NOT projected from this record: the
 * confirmation's `documentationState` informs operations, but the COA
 * documentation gate reads lot evidence, and a supplier's self-declared state
 * must not satisfy it.
 */

import { createHash } from "node:crypto";

import type { CartInventoryEligibility } from "@shared/research/cart-product-selection";
import type { CommerceResult } from "../commerce/input-guards";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export const SUPPLIER_CONFIRMED_ON_DEMAND = "SUPPLIER_CONFIRMED_ON_DEMAND" as const;

export const SUPPLIER_CONFIRMATION_STATUSES = ["active", "withdrawn"] as const;
export type SupplierConfirmationStatus = (typeof SUPPLIER_CONFIRMATION_STATUSES)[number];

/** Mirrors the durable named-human constraint. Lowercased, trimmed comparison. */
const FORBIDDEN_CONFIRMED_BY = new Set([
  "system",
  "the system",
  "automation",
  "robot",
  "bot",
  "service",
  "admin",
]);

export type SupplierConfirmation = Readonly<{
  confirmationId: string;
  supplierOrg: string;
  /** Free-form contact detail: a name, a phone, an email. Never shown to customers. */
  supplierContact: string;
  productId: string;
  variantId: string;
  /** Our SKU for the exact unit. */
  sku: string;
  /** The supplier's own SKU for the same unit. */
  supplierSku: string;
  strength: string;
  presentation: string;
  /** The most units the supplier committed to fulfill under this confirmation. */
  maxQuantity: number;
  fulfillmentLocation: string;
  fulfillmentMethod: string;
  /** Target hours from payment verification to supplier handoff. A target, not a guarantee. */
  targetHandoffHours: number;
  shippingRequirements: string;
  coldChainState: string;
  documentationState: string;
  confirmedAt: string;
  /** Required. Liveness is derived from the clock against this instant. */
  expiresAt: string;
  confirmedBy: string;
  /** Where the evidence lives (message ref, email ref, call note ref). */
  evidenceRef: string;
  status: SupplierConfirmationStatus;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
}>;

export type SupplierConfirmationFailureCode =
  | "confirmation_invalid"
  | "unit_invalid"
  | "quantity_invalid"
  | "window_invalid"
  | "named_human_required";

export type SupplierConfirmationResult = CommerceResult<
  SupplierConfirmation,
  SupplierConfirmationFailureCode
>;

function refused(code: SupplierConfirmationFailureCode): SupplierConfirmationResult {
  return Object.freeze({ ok: false as const, code });
}

function isSafeText(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export type CreateSupplierConfirmationInput = Readonly<{
  confirmationId: string;
  supplierOrg: string;
  supplierContact: string;
  productId: string;
  variantId: string;
  sku: string;
  supplierSku: string;
  strength: string;
  presentation: string;
  maxQuantity: number;
  fulfillmentLocation: string;
  fulfillmentMethod: string;
  targetHandoffHours: number;
  shippingRequirements: string;
  coldChainState: string;
  documentationState: string;
  confirmedAt: string;
  expiresAt: string;
  confirmedBy: string;
  evidenceRef: string;
}>;

export function createSupplierConfirmation(
  input: CreateSupplierConfirmationInput,
): SupplierConfirmationResult {
  if (!isSafeText(input.confirmationId, 128)) return refused("confirmation_invalid");
  if (!isSafeText(input.supplierOrg) || !isSafeText(input.supplierContact, 500)) {
    return refused("confirmation_invalid");
  }
  for (const unitField of [
    input.productId,
    input.variantId,
    input.sku,
    input.supplierSku,
    input.strength,
    input.presentation,
  ]) {
    if (!isSafeText(unitField, 128)) return refused("unit_invalid");
  }
  if (!Number.isSafeInteger(input.maxQuantity) || input.maxQuantity <= 0) {
    return refused("quantity_invalid");
  }
  if (
    !isSafeText(input.fulfillmentLocation) ||
    !isSafeText(input.fulfillmentMethod, 128) ||
    !isSafeText(input.shippingRequirements, 2000) ||
    !isSafeText(input.coldChainState, 64) ||
    !isSafeText(input.documentationState) ||
    !isSafeText(input.evidenceRef, 500)
  ) {
    return refused("confirmation_invalid");
  }
  if (
    !Number.isSafeInteger(input.targetHandoffHours) ||
    input.targetHandoffHours < 1 ||
    input.targetHandoffHours > 720
  ) {
    return refused("window_invalid");
  }
  if (!isTimestamp(input.confirmedAt) || !isTimestamp(input.expiresAt)) {
    return refused("window_invalid");
  }
  if (Date.parse(input.expiresAt) <= Date.parse(input.confirmedAt)) {
    return refused("window_invalid");
  }
  if (
    !isSafeText(input.confirmedBy) ||
    FORBIDDEN_CONFIRMED_BY.has(input.confirmedBy.trim().toLowerCase())
  ) {
    return refused("named_human_required");
  }

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      confirmationId: input.confirmationId,
      supplierOrg: input.supplierOrg,
      supplierContact: input.supplierContact,
      productId: input.productId,
      variantId: input.variantId,
      sku: input.sku,
      supplierSku: input.supplierSku,
      strength: input.strength,
      presentation: input.presentation,
      maxQuantity: input.maxQuantity,
      fulfillmentLocation: input.fulfillmentLocation,
      fulfillmentMethod: input.fulfillmentMethod,
      targetHandoffHours: input.targetHandoffHours,
      shippingRequirements: input.shippingRequirements,
      coldChainState: input.coldChainState,
      documentationState: input.documentationState,
      confirmedAt: input.confirmedAt,
      expiresAt: input.expiresAt,
      confirmedBy: input.confirmedBy,
      evidenceRef: input.evidenceRef,
      status: "active" as const,
      withdrawnAt: null,
      withdrawnBy: null,
    }),
  });
}

// ---------------------------------------------------------------------------
// Liveness and provenance
// ---------------------------------------------------------------------------

/** Live exactly when active and the clock has not reached expiry. */
export function supplierConfirmationHoldsAt(
  confirmation: SupplierConfirmation,
  now: string,
): boolean {
  if (confirmation.status !== "active") return false;
  if (!isTimestamp(now)) return false;
  return Date.parse(now) < Date.parse(confirmation.expiresAt);
}

/**
 * The provenance a projected fact carries. Any change to what was confirmed
 * (window, quantity, unit) changes the version, so a release or fingerprint
 * pinned to the old confirmation goes stale rather than silently covering a
 * different commitment.
 */
export function supplierConfirmationSourceVersion(
  confirmation: SupplierConfirmation,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        confirmationId: confirmation.confirmationId,
        productId: confirmation.productId,
        variantId: confirmation.variantId,
        maxQuantity: confirmation.maxQuantity,
        confirmedAt: confirmation.confirmedAt,
        expiresAt: confirmation.expiresAt,
        status: confirmation.status,
      }),
    )
    .digest("hex");
  return `${SUPPLIER_CONFIRMED_ON_DEMAND}:${digest}`;
}

/**
 * The fulfillment fact a LIVE confirmation projects for its exact unit, or
 * null. This is what turns `FULFILLMENT_UNAVAILABLE` off in the eligibility
 * census: state "eligible", no reason, provenance naming this confirmation.
 * A wrong unit or a dead confirmation projects nothing, never a downgraded
 * fact.
 */
export function supplierConfirmedFulfillmentFact(
  confirmation: SupplierConfirmation,
  unit: Readonly<{ productId: string; variantId: string; evaluatedAt: string }>,
): CartInventoryEligibility | null {
  if (confirmation.productId !== unit.productId) return null;
  if (confirmation.variantId !== unit.variantId) return null;
  if (!supplierConfirmationHoldsAt(confirmation, unit.evaluatedAt)) return null;
  return Object.freeze({
    productId: unit.productId,
    variantId: unit.variantId,
    state: "eligible" as const,
    reason: null,
    sourceVersion: supplierConfirmationSourceVersion(confirmation),
    evaluatedAt: unit.evaluatedAt,
  });
}

// ---------------------------------------------------------------------------
// The store port
// ---------------------------------------------------------------------------

export interface SupplierConfirmationStore {
  /** Idempotent by confirmation id: false is a replay, never an error. */
  insert(confirmation: SupplierConfirmation): Promise<boolean>;
  byId(confirmationId: string): Promise<SupplierConfirmation | null>;
  /**
   * The newest LIVE confirmation for one exact unit at one instant, or null.
   * The durable adapter answers from active, unexpired rows only.
   */
  liveForUnit(
    productId: string,
    variantId: string,
    now: string,
  ): Promise<SupplierConfirmation | null>;
  /** Withdrawal ends liveness immediately. False when the id is unknown. */
  withdraw(confirmationId: string, by: string, at: string): Promise<boolean>;
}

/** Test and labeled-local-development store. Not for production. */
export class InMemorySupplierConfirmationStore implements SupplierConfirmationStore {
  private readonly confirmations = new Map<string, SupplierConfirmation>();

  async insert(confirmation: SupplierConfirmation): Promise<boolean> {
    if (this.confirmations.has(confirmation.confirmationId)) return false;
    this.confirmations.set(confirmation.confirmationId, confirmation);
    return true;
  }

  async byId(confirmationId: string): Promise<SupplierConfirmation | null> {
    return this.confirmations.get(confirmationId) ?? null;
  }

  async liveForUnit(
    productId: string,
    variantId: string,
    now: string,
  ): Promise<SupplierConfirmation | null> {
    const live = Array.from(this.confirmations.values())
      .filter(
        (confirmation) =>
          confirmation.productId === productId &&
          confirmation.variantId === variantId &&
          supplierConfirmationHoldsAt(confirmation, now),
      )
      .sort((a, b) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt));
    return live[0] ?? null;
  }

  async withdraw(confirmationId: string, by: string, at: string): Promise<boolean> {
    const existing = this.confirmations.get(confirmationId);
    if (existing === undefined) return false;
    this.confirmations.set(confirmationId, {
      ...existing,
      status: "withdrawn",
      withdrawnAt: at,
      withdrawnBy: by,
    });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Reservation binding
// ---------------------------------------------------------------------------

export type ResolveConfirmationFailureCode =
  | "confirmation_unknown"
  | "confirmation_not_live"
  | "confirmation_unit_mismatch"
  | "confirmation_quantity_exceeded";

export type ResolveConfirmationResult = CommerceResult<
  SupplierConfirmation,
  ResolveConfirmationFailureCode
>;

/**
 * Resolve a reservation's `supplierConfirmationId` against the store, rather
 * than accepting any string. A reservation may only hold against a LIVE
 * confirmation for the SAME exact unit, and never for more units than the
 * supplier committed to.
 */
export async function resolveSupplierConfirmationForReservation(
  store: SupplierConfirmationStore,
  input: Readonly<{
    confirmationId: string;
    productId: string;
    variantId: string;
    quantity: number;
    now: string;
  }>,
): Promise<ResolveConfirmationResult> {
  const confirmation = await store.byId(input.confirmationId);
  if (confirmation === null) {
    return Object.freeze({ ok: false as const, code: "confirmation_unknown" as const });
  }
  if (
    confirmation.productId !== input.productId ||
    confirmation.variantId !== input.variantId
  ) {
    return Object.freeze({ ok: false as const, code: "confirmation_unit_mismatch" as const });
  }
  if (!supplierConfirmationHoldsAt(confirmation, input.now)) {
    return Object.freeze({ ok: false as const, code: "confirmation_not_live" as const });
  }
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity <= 0 ||
    input.quantity > confirmation.maxQuantity
  ) {
    return Object.freeze({ ok: false as const, code: "confirmation_quantity_exceeded" as const });
  }
  return Object.freeze({ ok: true as const, value: confirmation });
}
