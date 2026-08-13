import { createHash } from "node:crypto";

import { DIRECT_EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";

import type { EarlyAccessBlocker } from "../catalog/eligibility";
import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";

// The founder-controlled Early Access release bridge.
//
// Product Control remains the authority on identity, strength, presentation,
// and order integrity. It currently holds every unit, which is correct and is
// not something this module changes: it does not edit a product, clear a
// blocker, or write to Product Control at all. It records a SEPARATE, explicit
// decision by a named human to sell one exact unit inside Private Early Access
// while Product Control catches up.
//
// Four properties make that safe enough to be worth doing:
//
//   1. SCOPED. A release names the portal and only "private_early_access" is
//      accepted. The member storefront, public storefront, care, affiliate, and
//      supplier portals read Product Control and never consult this ledger.
//   2. VERSION BOUND. A release pins the exact product facts the founder saw. If
//      the strength, presentation, SKU, identity, or price changes afterwards,
//      the release goes stale and the unit is held again automatically. An
//      approval can never silently carry over to a different product.
//   3. EXPLICIT. A release waives named blockers. A blocker that appears later
//      and was never waived holds the unit, so nothing is approved by accident.
//   4. APPEND ONLY. Revoking is a new record, never a mutation, so history is
//      intact and historical orders keep the exact release they were sold under.
//
// This is deliberately temporary. When Product Control reaches readiness,
// deleting this module and its call site removes the override without touching
// a single historical order, because orders record the release they used.

/** The ONLY portal this override may ever apply to. */
export const EARLY_ACCESS_RELEASE_PORTAL = "private_early_access" as const;

/**
 * Blockers a founder may NEVER waive.
 *
 * The line is not how serious the blocker sounds. It is whether xenios knows
 * exactly what the customer will physically receive. A release may bridge
 * operational incompleteness (no photograph yet, no lab paperwork on file yet,
 * fulfilment still done by hand) because none of that changes what is in the
 * vial. It may never bridge uncertainty about the contents themselves.
 *
 * There is deliberately no acknowledgement field, no override flag, and no
 * "I understand the risk" path. A founder who needs one of these cleared must
 * resolve it in Product Control, which is the system of record for what a
 * product IS. Waiving it here would record a decision nobody is in a position
 * to make.
 */
export const EARLY_ACCESS_NONWAIVABLE_BLOCKERS = Object.freeze([
  // What is in the vial, and whether we can say so exactly.
  "IDENTITY_NOT_CONFIRMED",
  "STRENGTH_NOT_CONFIRMED",
  "PRESENTATION_NOT_CONFIRMED",
  "IDENTITY_DISPUTE_UNRESOLVED",
  "STRENGTH_DISPUTE_UNRESOLVED",
  "PRESENTATION_DISPUTE_UNRESOLVED",
  "SKU_IDENTITY_MISMATCH",
  "FORMULA_UNKNOWN",
  "COMPONENT_SPLIT_UNKNOWN",
  // Whether it may lawfully and safely ship at all.
  "REGULATORY_HOLD",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
  // Whether a real supplier and a real route to the customer exist. Automating
  // them is operational; having them at all is not.
  "SUPPLIER_NOT_ASSIGNED",
  "FULFILLMENT_UNAVAILABLE",
  // Who this may be sold to is a policy decision, not an operational gap.
  "AUDIENCE_NOT_PERMITTED",
] as const);

/**
 * Blockers a founder release may temporarily bridge.
 *
 * Each is a gap in operations or automation, not in knowledge of the product.
 * PRICE_NOT_APPROVED is waivable only because the release itself carries the
 * approved price, so the founder is supplying the missing fact rather than
 * discarding it. QUANTITY_LIMIT_MISSING is waivable on the same basis.
 */
export const EARLY_ACCESS_WAIVABLE_BLOCKERS = Object.freeze([
  "PRICE_NOT_APPROVED",
  "PRICE_CURRENCY_MISSING",
  "DOCUMENTATION_NOT_SATISFIED",
  "LAB_DOCUMENTATION_PENDING",
  "IMAGE_PENDING",
  "QUANTITY_LIMIT_MISSING",
  "AUTOMATED_SUPPLIER_INTEGRATION_PENDING",
  "AUTOMATED_TRACKING_PENDING",
  "AUTOMATED_REPORTING_PENDING",
  "MANUAL_FULFILLMENT_REQUIRED",
  "LIMITED_EARLY_ACCESS",
  "OFFER_STATE_NOT_PURCHASABLE",
] as const);

/** True when a blocker may never be bridged by a founder release. */
export function isNonwaivableBlocker(blocker: string): boolean {
  return (EARLY_ACCESS_NONWAIVABLE_BLOCKERS as readonly string[]).includes(blocker);
}

/**
 * Any blocker not explicitly listed as waivable is treated as non-waivable.
 *
 * This fails CLOSED on purpose. A blocker code added to Product Control later
 * would otherwise become silently waivable the moment it appeared, and nobody
 * would notice until it had already sold something.
 */
export function mayWaiveBlocker(blocker: string): boolean {
  if (isNonwaivableBlocker(blocker)) return false;
  return (EARLY_ACCESS_WAIVABLE_BLOCKERS as readonly string[]).includes(blocker);
}

export const EARLY_ACCESS_RELEASE_STATUSES = Object.freeze(["approved", "revoked"] as const);
export type EarlyAccessReleaseStatus = (typeof EARLY_ACCESS_RELEASE_STATUSES)[number];

const MIN_REASON_LENGTH = 12;
const MAX_REASON_LENGTH = 2_000;
const MAX_PRICE_CENTS = 100_000_000;
// A newly appended release may express the founder-approved 1..50 normal-order
// band. Historical quantity-20 releases remain immutable; the separate
// quantity-50 authority packet appends successors after M66 rather than
// rewriting or replaying them.
const MAX_QUANTITY_LIMIT = DIRECT_EARLY_ACCESS_MAX_QUANTITY;
const SUPPORTED_CURRENCIES = Object.freeze(["USD"] as const);
const ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.@:-]{2,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;

/**
 * One founder decision, exactly as it is recorded.
 *
 * Every field a later reader needs to answer "who sold this, on what basis, and
 * against which product facts" is on the record itself. Nothing is looked up.
 */
export interface EarlyAccessRelease {
  readonly releaseId: string;
  readonly portal: typeof EARLY_ACCESS_RELEASE_PORTAL;
  readonly productId: string;
  readonly variantId: string;
  /** The fingerprint of the product facts this decision was made against. */
  readonly productVersion: string;
  readonly status: EarlyAccessReleaseStatus;
  /** The server-authoritative price. Product Control has none for these units. */
  readonly approvedPriceCents: number;
  readonly currency: string;
  /** Operational blockers this release bridges. Never a non-waivable one. */
  readonly waivedBlockers: readonly EarlyAccessBlocker[];
  /** The founder-confirmed per-order quantity limit. */
  readonly approvedQuantityLimit: number;
  /** ISO 8601, or null for a release with no expiry. */
  readonly expiresAt: string | null;
  /** A named human. Never "the system", never a role alone. */
  readonly actor: string;
  readonly reason: string;
  /** ISO 8601, UTC. */
  readonly recordedAt: string;
}

export type EarlyAccessReleaseDraft = Omit<EarlyAccessRelease, "portal" | "recordedAt"> & {
  readonly portal?: typeof EARLY_ACCESS_RELEASE_PORTAL;
  readonly recordedAt?: string;
};

export type EarlyAccessReleaseRejection =
  | "PORTAL_NOT_PERMITTED"
  | "RELEASE_ID_INVALID"
  | "PRODUCT_INVALID"
  | "VARIANT_INVALID"
  | "VERSION_INVALID"
  | "STATUS_INVALID"
  | "PRICE_INVALID"
  | "CURRENCY_UNSUPPORTED"
  | "BLOCKERS_INVALID"
  | "NONWAIVABLE_BLOCKER"
  | "QUANTITY_LIMIT_INVALID"
  | "EXPIRY_INVALID"
  | "ACTOR_INVALID"
  | "REASON_INSUFFICIENT"
  | "TIMESTAMP_INVALID";

export type EarlyAccessReleaseValidation =
  | Readonly<{ ok: true; release: EarlyAccessRelease }>
  | Readonly<{ ok: false; code: EarlyAccessReleaseRejection }>;

/**
 * The fingerprint an approval is bound to.
 *
 * It covers exactly the facts that would change what the customer receives, or
 * what they pay. A change to any of them invalidates the approval, which is the
 * point: the founder approved THIS unit as it stood, not the name.
 */
export function earlyAccessReleaseVersion(row: EarlyAccessCatalogRow): string {
  const canonical = [
    row.productId,
    row.variantId,
    row.sku,
    row.canonicalName,
    row.strength ?? "",
    row.presentation ?? "",
    row.priceCents === null ? "" : String(row.priceCents),
    row.currency,
    // Product Control's own verdict is part of the state that was approved. If
    // it later reports a DIFFERENT set of problems, the founder never saw them.
    [...row.blockers].sort().join(","),
  ]
    // Each field is length prefixed rather than joined by a separator. Any
    // separator can appear inside a strength or presentation, and then two
    // genuinely different units collide: "10 mg" + "vial" and "10" + "mg vial"
    // produce the same string. A collision here would let a release approved
    // for one unit validate against another, which is the single thing this
    // fingerprint exists to prevent.
    .map((field) => `${field.length}:${field}`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function validCurrency(value: unknown): value is string {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

function validBlockerList(value: unknown): value is readonly EarlyAccessBlocker[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 64);
}

/**
 * Validate a founder decision before it is ever appended.
 *
 * Every refusal is a distinct code because this is an operator-facing tool, not
 * a customer-facing one: a founder who typed the wrong currency should be told
 * which field is wrong, not handed one opaque failure.
 */
export function validateEarlyAccessRelease(draft: unknown): EarlyAccessReleaseValidation {
  if (draft === null || typeof draft !== "object") return fail("PRODUCT_INVALID");
  const input = draft as EarlyAccessReleaseDraft;

  const portal = input.portal ?? EARLY_ACCESS_RELEASE_PORTAL;
  if (portal !== EARLY_ACCESS_RELEASE_PORTAL) return fail("PORTAL_NOT_PERMITTED");
  if (typeof input.releaseId !== "string" || !ID_PATTERN.test(input.releaseId)) {
    return fail("RELEASE_ID_INVALID");
  }
  if (typeof input.productId !== "string" || !ID_PATTERN.test(input.productId)) {
    return fail("PRODUCT_INVALID");
  }
  if (typeof input.variantId !== "string" || !ID_PATTERN.test(input.variantId)) {
    return fail("VARIANT_INVALID");
  }
  if (typeof input.productVersion !== "string" || !/^[a-f0-9]{64}$/.test(input.productVersion)) {
    return fail("VERSION_INVALID");
  }
  if (
    typeof input.status !== "string" ||
    !(EARLY_ACCESS_RELEASE_STATUSES as readonly string[]).includes(input.status)
  ) {
    return fail("STATUS_INVALID");
  }
  // A revocation carries no price claim, so only an approval is priced.
  if (input.status === "approved") {
    if (
      typeof input.approvedPriceCents !== "number" ||
      !Number.isSafeInteger(input.approvedPriceCents) ||
      input.approvedPriceCents <= 0 ||
      input.approvedPriceCents > MAX_PRICE_CENTS
    ) {
      return fail("PRICE_INVALID");
    }
    if (!validCurrency(input.currency)) return fail("CURRENCY_UNSUPPORTED");
  }
  if (!validBlockerList(input.waivedBlockers)) return fail("BLOCKERS_INVALID");

  // The restriction that matters. A release may bridge an operational gap; it
  // may never assert that we know what is in the vial when we do not. There is
  // no acknowledgement path around this, deliberately.
  for (const blocker of input.waivedBlockers) {
    if (!mayWaiveBlocker(blocker)) return fail("NONWAIVABLE_BLOCKER");
  }

  if (input.status === "approved") {
    if (
      typeof input.approvedQuantityLimit !== "number" ||
      !Number.isSafeInteger(input.approvedQuantityLimit) ||
      input.approvedQuantityLimit <= 0 ||
      input.approvedQuantityLimit > MAX_QUANTITY_LIMIT
    ) {
      return fail("QUANTITY_LIMIT_INVALID");
    }
  }

  // Null is a deliberate choice ("no expiry"), so it is accepted; undefined is
  // an omission, and an omitted expiry on a decision this consequential should
  // be stated rather than assumed.
  const expiresAt = input.expiresAt;
  if (expiresAt !== null) {
    if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
      return fail("EXPIRY_INVALID");
    }
  }

  if (typeof input.actor !== "string" || !ACTOR_PATTERN.test(input.actor)) {
    return fail("ACTOR_INVALID");
  }
  if (
    typeof input.reason !== "string" ||
    input.reason.trim().length < MIN_REASON_LENGTH ||
    input.reason.length > MAX_REASON_LENGTH
  ) {
    return fail("REASON_INSUFFICIENT");
  }

  const recordedAt = input.recordedAt;
  if (recordedAt !== undefined) {
    if (typeof recordedAt !== "string") return fail("TIMESTAMP_INVALID");
    const parsed = Date.parse(recordedAt);
    if (!Number.isFinite(parsed)) return fail("TIMESTAMP_INVALID");
  }

  return Object.freeze({
    ok: true as const,
    release: Object.freeze({
      releaseId: input.releaseId,
      portal: EARLY_ACCESS_RELEASE_PORTAL,
      productId: input.productId,
      variantId: input.variantId,
      productVersion: input.productVersion,
      status: input.status,
      approvedPriceCents: input.status === "approved" ? input.approvedPriceCents : 0,
      currency: input.status === "approved" ? input.currency : "",
      waivedBlockers: Object.freeze([...input.waivedBlockers]),
      approvedQuantityLimit: input.status === "approved" ? input.approvedQuantityLimit : 0,
      expiresAt: expiresAt ?? null,
      actor: input.actor,
      reason: input.reason.trim(),
      recordedAt: recordedAt ?? new Date().toISOString(),
    }) as EarlyAccessRelease,
  });
}

function fail(code: EarlyAccessReleaseRejection): EarlyAccessReleaseValidation {
  return Object.freeze({ ok: false as const, code });
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export type EarlyAccessReleaseHold =
  | "NO_FOUNDER_RELEASE"
  | "RELEASE_REVOKED"
  | "RELEASE_STALE"
  | "RELEASE_EXPIRED"
  | "NONWAIVABLE_BLOCKER"
  | "BLOCKERS_NOT_WAIVED";

export type EarlyAccessReleaseDecision =
  | Readonly<{
      released: true;
      releaseId: string;
      priceCents: number;
      currency: string;
      waivedBlockers: readonly EarlyAccessBlocker[];
      productVersion: string;
      /** The release's own per-order ceiling. The order path must enforce it. */
      approvedQuantityLimit: number;
    }>
  | Readonly<{
      released: false;
      hold: EarlyAccessReleaseHold;
      /** Blockers still holding this unit that no release waives. */
      unwaivedBlockers: readonly EarlyAccessBlocker[];
    }>;

/**
 * Decide whether ONE unit may be bought inside Private Early Access.
 *
 * A row Product Control already considers purchasable does not need a release
 * and is not given one here; this answers only the override question, so the
 * caller composes the two and the normal path is untouched.
 */
export function decideEarlyAccessRelease(input: {
  readonly row: EarlyAccessCatalogRow;
  readonly releases: readonly EarlyAccessRelease[];
  /** Epoch milliseconds, for expiry. Omitted means expiry is not evaluated. */
  readonly now?: number;
}): EarlyAccessReleaseDecision {
  const { row } = input;

  // FIRST, before any release is even looked at. Validation already refuses to
  // record a non-waivable waiver, but a record could reach storage by some other
  // route: a direct database write, a restored backup taken under older rules, a
  // future code path nobody checked. A unit whose contents are uncertain is held
  // no matter what any release says about it.
  const nonwaivable = row.blockers.filter((blocker) => isNonwaivableBlocker(blocker));
  if (nonwaivable.length > 0) return held("NONWAIVABLE_BLOCKER", nonwaivable);

  const version = earlyAccessReleaseVersion(row);
  const relevant = input.releases.filter(
    (release) =>
      release.portal === EARLY_ACCESS_RELEASE_PORTAL &&
      release.productId === row.productId &&
      release.variantId === row.variantId,
  );
  if (relevant.length === 0) return held("NO_FOUNDER_RELEASE", row.blockers);

  // Append-only means the ledger holds the whole history, so the current state
  // is the LAST record written for this unit. Ties break on release id so the
  // answer is deterministic when two records share a timestamp.
  const ordered = [...relevant].sort((a, b) => {
    const byTime = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
    if (byTime !== 0) return byTime;
    return a.releaseId < b.releaseId ? -1 : a.releaseId > b.releaseId ? 1 : 0;
  });
  const current = ordered[ordered.length - 1] as EarlyAccessRelease;

  if (current.status === "revoked") return held("RELEASE_REVOKED", row.blockers);

  // The founder approved the unit as it stood. If any fact that changes what the
  // customer receives has moved since, this approval is not about this product.
  if (current.productVersion !== version) return held("RELEASE_STALE", row.blockers);

  if (current.expiresAt !== null && input.now !== undefined) {
    const expiry = Date.parse(current.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= input.now) {
      return held("RELEASE_EXPIRED", row.blockers);
    }
  }

  // Belt and braces with the check above: even for a row with no non-waivable
  // blocker today, a release that CLAIMS to waive one is not honoured.
  if (current.waivedBlockers.some((blocker) => !mayWaiveBlocker(blocker))) {
    return held("NONWAIVABLE_BLOCKER", current.waivedBlockers.filter((b) => !mayWaiveBlocker(b)));
  }

  const unwaived = row.blockers.filter((blocker) => !current.waivedBlockers.includes(blocker));
  if (unwaived.length > 0) return held("BLOCKERS_NOT_WAIVED", unwaived);

  return Object.freeze({
    released: true as const,
    releaseId: current.releaseId,
    approvedQuantityLimit: current.approvedQuantityLimit,
    priceCents: current.approvedPriceCents,
    currency: current.currency,
    waivedBlockers: current.waivedBlockers,
    productVersion: current.productVersion,
  });
}

function held(
  hold: EarlyAccessReleaseHold,
  unwaivedBlockers: readonly EarlyAccessBlocker[],
): EarlyAccessReleaseDecision {
  return Object.freeze({
    released: false as const,
    hold,
    unwaivedBlockers: Object.freeze([...unwaivedBlockers]),
  });
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export type EarlyAccessReleaseAppend =
  | Readonly<{ ok: true; release: EarlyAccessRelease }>
  | Readonly<{ ok: false; code: EarlyAccessReleaseRejection | "DUPLICATE_RELEASE_ID" }>;

/** Append-only by construction: there is no update and no delete. */
export interface EarlyAccessReleaseLedger {
  append(draft: unknown): Promise<EarlyAccessReleaseAppend>;
  /** Every record ever written for a unit, oldest first. */
  history(productId: string, variantId: string): Promise<readonly EarlyAccessRelease[]>;
  all(): Promise<readonly EarlyAccessRelease[]>;
}

export class InMemoryEarlyAccessReleaseLedger implements EarlyAccessReleaseLedger {
  private readonly records: EarlyAccessRelease[] = [];
  private readonly seen = new Set<string>();

  async append(draft: unknown): Promise<EarlyAccessReleaseAppend> {
    const validated = validateEarlyAccessRelease(draft);
    if (!validated.ok) return Object.freeze({ ok: false as const, code: validated.code });
    if (this.seen.has(validated.release.releaseId)) {
      return Object.freeze({ ok: false as const, code: "DUPLICATE_RELEASE_ID" as const });
    }
    this.seen.add(validated.release.releaseId);
    this.records.push(validated.release);
    return Object.freeze({ ok: true as const, release: validated.release });
  }

  async history(productId: string, variantId: string): Promise<readonly EarlyAccessRelease[]> {
    return Object.freeze(
      this.records.filter((r) => r.productId === productId && r.variantId === variantId),
    );
  }

  async all(): Promise<readonly EarlyAccessRelease[]> {
    return Object.freeze([...this.records]);
  }
}
