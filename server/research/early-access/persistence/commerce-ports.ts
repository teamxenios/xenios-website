import type { SupplierShipmentRecipient } from "../commerce/supplier-release";
import type {
  EarlyAccessAgreementGate,
  EarlyAccessReferralAttribution,
  EarlyAccessReferralResolver,
  EarlyAccessShippingPolicy,
  EarlyAccessSupplierAssignment,
  EarlyAccessSupplierDirectory,
} from "../routes/ports";
import { earlyAccessSupplierIdentifier } from "../ops/supplier-identity";
import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * Durable replacements for the four fail-closed commerce placeholders.
 *
 * Every one of them PRESERVES the fail-closed default by shape rather than by
 * code path: an empty agreements table accepts nobody, an empty supplier
 * confirmation table assigns nobody, an empty shipping allowlist serves
 * nowhere, and an absent referral grant attributes nothing. Wiring these in
 * changes where the answer comes from, never what the absence of an answer
 * means.
 */

const RPC = {
  agreementsAccepted: "research_early_access_agreements_accepted",
  recordAgreement: "research_early_access_record_agreement",
  supplierForUnit: "research_early_access_supplier_for_unit",
  shippingServes: "research_early_access_shipping_serves",
  referralForCustomer: "research_early_access_referral_for_customer",
  grantReferral: "research_early_access_grant_referral",
} as const;

export type EarlyAccessRequiredAgreement = Readonly<{ kind: string; version: string }>;

export type SupabaseEarlyAccessAgreementGateOptions = Readonly<{
  query: EarlyAccessPersistenceQuery;
  /**
   * The agreements an order requires, as (kind, version) pairs. This is
   * deployment policy, stated explicitly by the operator; an empty or absent
   * list makes the gate refuse everyone, exactly like the placeholder it
   * replaces, because "no stated requirements" must never read as "nothing
   * required".
   */
  required: readonly EarlyAccessRequiredAgreement[];
}>;

export class SupabaseEarlyAccessAgreementGate implements EarlyAccessAgreementGate {
  private readonly query: EarlyAccessPersistenceQuery;
  private readonly required: readonly EarlyAccessRequiredAgreement[];

  constructor(options: SupabaseEarlyAccessAgreementGateOptions) {
    this.query = options.query;
    this.required = options.required;
  }

  async accepted(customerRef: string): Promise<boolean> {
    if (this.required.length === 0) return false;
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.agreementsAccepted,
      args: { p_customer_ref: customerRef, p_required: this.required },
    });
    return raw === true;
  }
}

/**
 * Records one acceptance through the RPC migration 20260804120000 already
 * created.
 *
 * It is a separate class from the gate on purpose. The gate reads and the
 * recorder writes, through two different functions, so a fault in the write
 * path can only ever fail to record an acceptance (which refuses a sale). It
 * cannot make the gate answer true for an acceptance that was never made.
 */
export class SupabaseEarlyAccessAgreementRecorder {
  private readonly query: EarlyAccessPersistenceQuery;

  constructor(query: EarlyAccessPersistenceQuery) {
    this.query = query;
  }

  async record(input: {
    readonly customerRef: string;
    readonly kind: string;
    readonly version: string;
    readonly acceptedAt: string;
    readonly evidence: Readonly<Record<string, unknown>>;
  }): Promise<"recorded" | "already_on_file" | "failed"> {
    // The RPC returns true when it inserted and false when it caught
    // `unique_violation`, which means the acceptance was ALREADY on file. Both
    // are good outcomes. A genuine fault throws out of runEarlyAccessCall and
    // is the only thing that reports failure.
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.recordAgreement,
      args: {
        p_customer_ref: input.customerRef,
        p_kind: input.kind,
        p_version: input.version,
        p_accepted_at: input.acceptedAt,
        p_evidence: input.evidence,
      },
    });
    if (raw === true) return "recorded";
    if (raw === false) return "already_on_file";
    return "failed";
  }
}

export type SupabaseEarlyAccessSupplierDirectoryOptions = Readonly<{
  query: EarlyAccessPersistenceQuery;
  now: () => number;
}>;

/**
 * Answers from ACTIVE, UNEXPIRED supplier confirmations
 * (SUPPLIER_CONFIRMED_ON_DEMAND records) and from nothing else. A unit
 * without a live confirmation gets null, and the order flow refuses it with
 * SUPPLIER_UNAVAILABLE exactly as it does today.
 */
export class SupabaseEarlyAccessSupplierDirectory implements EarlyAccessSupplierDirectory {
  private readonly query: EarlyAccessPersistenceQuery;
  private readonly now: () => number;

  constructor(options: SupabaseEarlyAccessSupplierDirectoryOptions) {
    this.query = options.query;
    this.now = options.now;
  }

  async forUnit(
    productId: string,
    variantId: string,
  ): Promise<EarlyAccessSupplierAssignment | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.supplierForUnit,
      args: {
        p_product_id: productId,
        p_variant_id: variantId,
        p_now: new Date(this.now()).toISOString(),
      },
    });
    if (raw === null || raw === undefined) return null;
    const parsed = expectObject(RPC.supplierForUnit, raw);
    if (typeof parsed.supplierId !== "string" || typeof parsed.supplierSku !== "string") {
      return null;
    }
    // THE ONE TRANSLATION THIS BOUNDARY OWES THE PORT. The RPC answers
    // `'supplierId', supplier_org`, and supplier_org is a free-text
    // organisation NAME: every recorded confirmation carries "Raw Peptides",
    // which the order route's isSafeIdentifier guard rejects because the
    // pattern has no space. The row is real, the route is real, and the sale
    // was refused anyway. Translating the name into its identifier form here
    // keeps the guard intact and fails closed when no valid identifier can be
    // derived. See ops/supplier-identity.ts for why this is a translation
    // rather than a repair, and what the schema-level fix is.
    const supplierId = earlyAccessSupplierIdentifier(parsed.supplierId);
    if (supplierId === null) return null;
    return Object.freeze({
      supplierId,
      supplierSku: parsed.supplierSku,
    });
  }
}

export class SupabaseEarlyAccessShippingPolicy implements EarlyAccessShippingPolicy {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async serves(destination: SupplierShipmentRecipient): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.shippingServes,
      args: { p_country: destination.country, p_region: destination.region },
    });
    return raw === true;
  }
}

const REFERRAL_CUSTOMER_REF = /^eac_[a-f0-9]{32}$/;
const REFERRAL_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,63}$/;
const REFERRAL_AFFILIATE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;

/**
 * The rate ceiling the commission lane enforces, restated here so a grant this
 * writer records can never carry a rate the settlement lane would then refuse.
 * The table's own constraint allows up to 10000; the money lane caps holds at
 * half the order, and a grant above that cap is a grant that can never pay, so
 * it is refused at write time where the operator can still see why.
 */
const REFERRAL_MAX_HOLD_BASIS_POINTS = 5_000;

export type EarlyAccessReferralGrantInput = Readonly<{
  customerRef: string;
  referralCode: string;
  affiliateId: string;
  affiliateCustomerRef: string;
  holdBasisPoints: number;
}>;

export type EarlyAccessReferralGrantOutcome = "granted" | "input_invalid";

/**
 * Records how a customer arrived, through the RPC migration 20260804120000
 * already created and which, until this class, had ZERO server callers.
 *
 * Every field is server-derived: the caller is the customer-bind seam, which
 * hands this writer values it resolved from a server-verified partner referral,
 * never anything a browser typed. The RPC is an upsert keyed on customer_ref
 * (one grant per customer, re-recording replaces the attribution and clears any
 * revocation), so calling this twice with the same facts is one grant, which is
 * what makes the seam safe to retry.
 *
 * It is a separate class from the resolver on purpose, exactly as the agreement
 * recorder is separate from the agreement gate: the resolver reads and this
 * writer writes, through two different functions, so a fault in the write path
 * can only ever fail to record a grant (which attributes nothing). It cannot
 * make the resolver answer with a grant that was never made.
 */
export class SupabaseEarlyAccessReferralGrantWriter {
  private readonly query: EarlyAccessPersistenceQuery;

  constructor(query: EarlyAccessPersistenceQuery) {
    this.query = query;
  }

  async grant(input: EarlyAccessReferralGrantInput): Promise<EarlyAccessReferralGrantOutcome> {
    // Refused BEFORE the database sees it. The table has its own constraints,
    // but a constraint violation surfaces as an opaque persistence error, and
    // a malformed grant is not an infrastructure fault: it is bad input from a
    // seam that should hear so by name.
    if (
      !REFERRAL_CUSTOMER_REF.test(input.customerRef) ||
      !REFERRAL_CUSTOMER_REF.test(input.affiliateCustomerRef) ||
      !REFERRAL_CODE.test(input.referralCode) ||
      !REFERRAL_AFFILIATE.test(input.affiliateId) ||
      !Number.isSafeInteger(input.holdBasisPoints) ||
      input.holdBasisPoints < 1 ||
      input.holdBasisPoints > REFERRAL_MAX_HOLD_BASIS_POINTS ||
      // An affiliate cannot be granted their own arrival. The table refuses
      // this too; refusing it here keeps the refusal named.
      input.affiliateCustomerRef === input.customerRef
    ) {
      return "input_invalid";
    }
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.grantReferral,
      args: {
        p_customer_ref: input.customerRef,
        p_referral_code: input.referralCode,
        p_affiliate_id: input.affiliateId,
        p_affiliate_customer_ref: input.affiliateCustomerRef,
        p_hold_basis_points: input.holdBasisPoints,
      },
    });
    // The RPC returns literal true on success and nothing else. Any other
    // answer means the function is not the function this writer was built
    // against, and a grant that may or may not exist must be a failure, not a
    // shrug.
    if (raw !== true) {
      throw new EarlyAccessPersistenceError(RPC.grantReferral);
    }
    return "granted";
  }
}

export class SupabaseEarlyAccessReferralResolver implements EarlyAccessReferralResolver {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async forCustomer(customerRef: string): Promise<EarlyAccessReferralAttribution | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.referralForCustomer,
      args: { p_customer_ref: customerRef },
    });
    if (raw === null || raw === undefined) return null;
    const parsed = expectObject(RPC.referralForCustomer, raw);
    if (
      typeof parsed.referralCode !== "string" ||
      typeof parsed.affiliateId !== "string" ||
      typeof parsed.affiliateCustomerRef !== "string" ||
      typeof parsed.holdBasisPoints !== "number"
    ) {
      return null;
    }
    return Object.freeze({
      referralCode: parsed.referralCode,
      affiliateId: parsed.affiliateId,
      affiliateCustomerRef: parsed.affiliateCustomerRef,
      holdBasisPoints: parsed.holdBasisPoints,
    });
  }
}

import type {
  EarlyAccessAdminExceptionRow,
  EarlyAccessSettledAwaitingFulfillmentRow,
} from "../routes/admin-routes";

const FULFILLMENT_OPS_RPC = {
  /** Founder-gated candidate: supabase/candidates/20260819_research_early_access_settled_awaiting_fulfillment.sql */
  settledAwaitingFulfillment: "research_early_access_settled_awaiting_fulfillment",
  /** Deployed by migration 20260804121000. */
  openExceptions: "research_early_access_open_admin_exceptions",
} as const;

/**
 * The two fulfillment-operations reads. Read-only by construction: both RPCs
 * are security definer, service_role execute only, and neither takes an
 * argument, so nothing here can write or be steered.
 */
export class SupabaseEarlyAccessFulfillmentOpsReads {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async settledAwaitingFulfillment(): Promise<
    readonly EarlyAccessSettledAwaitingFulfillmentRow[]
  > {
    const raw = await runEarlyAccessCall(this.query, {
      fn: FULFILLMENT_OPS_RPC.settledAwaitingFulfillment,
      args: {},
    });
    const rows = expectArray(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment, raw);
    return Object.freeze(
      rows.map((row) => {
        const record = expectObject(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment, row);
        if (
          typeof record.orderNumber !== "string" ||
          typeof record.settledAt !== "string" ||
          typeof record.sku !== "string" ||
          typeof record.quantity !== "number" ||
          typeof record.payableTotalCents !== "number" ||
          typeof record.currency !== "string" ||
          typeof record.trackingCount !== "number" ||
          typeof record.dispatchEventCount !== "number"
        ) {
          throw new EarlyAccessPersistenceError(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment);
        }
        return Object.freeze({
          orderNumber: record.orderNumber,
          settledAt: record.settledAt,
          sku: record.sku,
          quantity: record.quantity,
          payableTotalCents: record.payableTotalCents,
          currency: record.currency,
          trackingCount: record.trackingCount,
          dispatchEventCount: record.dispatchEventCount,
        });
      }),
    );
  }

  async openExceptions(): Promise<readonly EarlyAccessAdminExceptionRow[]> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: FULFILLMENT_OPS_RPC.openExceptions,
      args: {},
    });
    const rows = expectArray(FULFILLMENT_OPS_RPC.openExceptions, raw);
    return Object.freeze(
      rows.map((row) => {
        const record = expectObject(FULFILLMENT_OPS_RPC.openExceptions, row);
        if (
          typeof record.id !== "number" ||
          typeof record.kind !== "string" ||
          typeof record.raisedAt !== "string"
        ) {
          throw new EarlyAccessPersistenceError(FULFILLMENT_OPS_RPC.openExceptions);
        }
        return Object.freeze({
          id: record.id,
          kind: record.kind,
          orderNumber: typeof record.orderNumber === "string" ? record.orderNumber : null,
          detail: record.detail ?? null,
          raisedAt: record.raisedAt,
        });
      }),
    );
  }
}
