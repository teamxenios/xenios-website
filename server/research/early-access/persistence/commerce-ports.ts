import type { SupplierShipmentRecipient } from "../commerce/supplier-release";
import type {
  EarlyAccessAgreementGate,
  EarlyAccessReferralAttribution,
  EarlyAccessReferralResolver,
  EarlyAccessShippingPolicy,
  EarlyAccessSupplierAssignment,
  EarlyAccessSupplierDirectory,
} from "../routes/ports";
import {
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
    return Object.freeze({
      supplierId: parsed.supplierId,
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
