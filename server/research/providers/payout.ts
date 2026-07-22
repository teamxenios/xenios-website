// xenios research: partner payout provider boundary.
//
// Built with no live payout rail, on purpose. The production default is Disabled,
// which returns a structured refusal rather than throwing, so an admin payout
// screen can report an honest capability error instead of half-settling a batch.
//
// The invariant this file protects: a commission entry becomes paid ONLY on a
// provider reference returned by an actual ProviderResult. There is no code path
// where xenios decides on its own that money left the account.
//
// Founder rules encoded here: commission reaching a payout comes only from an
// attributed order (see shared/research/distribution.ts). Nothing in this file
// reads or expresses a partner hierarchy, and there is no recruiting payout type.

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";
import type { CommissionState, PartnerState } from "@shared/research/distribution";
import { partnerCanBePaid } from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

export interface CreatePayoutInput {
  /** Groups one run of partner payments so a retry settles the same set. */
  batchId: string;
  partnerId: string;
  /** Minor units. Always summed server-side from payable ledger entries. */
  amountCents: number;
  currency: "usd";
  /** Required. Replaying the same key must never send a second payment. */
  idempotencyKey: string;
  /** The commission ledger rows this payment settles. */
  ledgerEntryIds: readonly string[];
  memo?: string;
}

export type PayoutStatus = "pending" | "paid" | "failed" | "cancelled";

export interface PayoutRecord {
  providerReference: string;
  batchId: string;
  partnerId: string;
  amountCents: number;
  currency: "usd";
  status: PayoutStatus;
}

export interface PayoutWebhookVerification {
  eventId: string;
  eventType: string;
  providerReference?: string;
  /** The provider-signed payload, already verified. */
  verified: true;
}

export interface PayoutProvider {
  readonly name: string;

  createPayout(input: CreatePayoutInput): Promise<ProviderResult<PayoutRecord>>;
  getPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>>;
  cancelPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>>;
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<ProviderResult<PayoutWebhookVerification>>;
}

/**
 * The only sanctioned way to move a ledger entry to paid.
 *
 * A caller must hand the real ProviderResult here rather than its own belief that
 * a payment succeeded, so an optimistic update cannot mark money sent that never
 * left. A success without a reference is treated as not paid.
 */
export type SettledPayoutResult = { ok: true; value: PayoutRecord; providerReference?: string };

export function canMarkPaid(result: ProviderResult<PayoutRecord>): result is SettledPayoutResult {
  if (!result.ok) return false;
  const ref = result.value.providerReference;
  return typeof ref === "string" && ref.length > 0 && result.value.status === "paid";
}

// ---------------------------------------------------------------------------
// Disabled (the production default)
// ---------------------------------------------------------------------------

export class DisabledPayoutProvider implements PayoutProvider {
  readonly name = "disabled";

  async createPayout() {
    return providerDisabled<PayoutRecord>("affiliate_payouts");
  }
  async getPayout() {
    return providerDisabled<PayoutRecord>("affiliate_payouts");
  }
  async cancelPayout() {
    return providerDisabled<PayoutRecord>("affiliate_payouts");
  }
  async verifyWebhook() {
    return providerDisabled<PayoutWebhookVerification>("affiliate_payouts");
  }
}

// ---------------------------------------------------------------------------
// Test provider (never available in production)
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory provider for tests and local development.
 *
 * It models what matters for money: idempotent batch payment, no second send for a
 * replayed key, cancellation only while pending, and webhook replay protection. It
 * refuses to construct in production so it cannot become a live payout path by a
 * configuration mistake.
 */
export class TestPayoutProvider implements PayoutProvider {
  readonly name = "test";

  private payouts = new Map<string, PayoutRecord>();
  private byIdempotencyKey = new Map<string, string>();
  private byBatchPartner = new Map<string, string>();
  private seenWebhookEvents = new Map<string, true>();
  private counter = 0;

  constructor(options: { allowInProduction?: boolean } = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowInProduction) {
      throw new Error("TestPayoutProvider is not available in production");
    }
  }

  async createPayout(input: CreatePayoutInput): Promise<ProviderResult<PayoutRecord>> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return providerMisconfigured<PayoutRecord>("Payout amount must be a positive integer number of cents.");
    }
    if (input.ledgerEntryIds.length === 0) {
      return providerMisconfigured<PayoutRecord>("A payout must settle at least one ledger entry.");
    }

    // Idempotency: the same key returns the original payout, never a second send.
    const existingRef = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingRef) {
      return providerOk(this.payouts.get(existingRef)!, existingRef);
    }

    // A second payout for the same partner within one batch is a double pay even
    // when the caller generated a fresh key, so it is refused outright.
    const batchKey = `${input.batchId}::${input.partnerId}`;
    if (this.byBatchPartner.has(batchKey)) {
      return {
        ok: false,
        code: "REJECTED",
        message: "Partner already has a payout in this batch.",
        retryable: false,
      };
    }

    const ref = `test_payout_${++this.counter}`;
    const record: PayoutRecord = {
      providerReference: ref,
      batchId: input.batchId,
      partnerId: input.partnerId,
      amountCents: input.amountCents,
      currency: "usd",
      status: "paid",
    };
    this.payouts.set(ref, record);
    this.byIdempotencyKey.set(input.idempotencyKey, ref);
    this.byBatchPartner.set(batchKey, ref);
    return providerOk(record, ref);
  }

  async getPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>> {
    const record = this.payouts.get(providerReference);
    if (!record) {
      return { ok: false, code: "REJECTED", message: "Unknown payout.", retryable: false };
    }
    return providerOk(record, providerReference);
  }

  async cancelPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>> {
    const record = this.payouts.get(providerReference);
    if (!record) {
      return { ok: false, code: "REJECTED", message: "Unknown payout.", retryable: false };
    }
    if (record.status === "paid") {
      return { ok: false, code: "REJECTED", message: "Cannot cancel a paid payout.", retryable: false };
    }
    if (record.status === "cancelled") {
      return { ok: false, code: "REJECTED", message: "Payout already cancelled.", retryable: false };
    }
    const cancelled: PayoutRecord = { ...record, status: "cancelled" };
    this.payouts.set(providerReference, cancelled);
    return providerOk(cancelled, providerReference);
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<ProviderResult<PayoutWebhookVerification>> {
    if (!signatureHeader) {
      return { ok: false, code: "REJECTED", message: "Missing signature header.", retryable: false };
    }
    if (signatureHeader !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    let parsed: { id?: string; type?: string; providerReference?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    if (!parsed.id || !parsed.type) {
      return { ok: false, code: "REJECTED", message: "Webhook missing id or type.", retryable: false };
    }
    if (this.seenWebhookEvents.has(parsed.id)) {
      return { ok: false, code: "REJECTED", message: "Duplicate webhook event.", retryable: false };
    }
    this.seenWebhookEvents.set(parsed.id, true);
    return providerOk({
      eventId: parsed.id,
      eventType: parsed.type,
      providerReference: parsed.providerReference,
      verified: true as const,
    });
  }
}

// ---------------------------------------------------------------------------
// Real adapter shell
// ---------------------------------------------------------------------------

/**
 * The real payout adapter, deliberately unimplemented.
 *
 * It exists so resolution, configuration validation, and batching policy are all
 * complete and testable before a payout credential is ever requested. Every method
 * returns a MISCONFIGURED refusal rather than a stub success, so an accidental
 * production enablement without the implementation fails loudly and pays nobody.
 *
 * ACTIVATION: implement against the chosen payout rail, then set the credentials
 * named in `requiredEnvironmentVariables`. Do not implement before Samuel has
 * chosen the rail and given written approval for live partner payouts.
 */
export class RealPayoutAdapter implements PayoutProvider {
  readonly name = "real";

  static readonly requiredEnvironmentVariables = ["PAYOUT_PROVIDER", "PAYOUT_API_KEY"] as const;

  private notImplemented<T>(): ProviderResult<T> {
    return providerMisconfigured<T>(
      "The live payout adapter is not implemented. Partner payouts remain disabled pending rail selection and written approval.",
    );
  }

  async createPayout() {
    return this.notImplemented<PayoutRecord>();
  }
  async getPayout() {
    return this.notImplemented<PayoutRecord>();
  }
  async cancelPayout() {
    return this.notImplemented<PayoutRecord>();
  }
  async verifyWebhook() {
    return this.notImplemented<PayoutWebhookVerification>();
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Chooses the provider. Defaults to Disabled.
 *
 * The test provider is reachable only outside production, so a stray environment
 * value cannot turn a live deployment into a fake-payout deployment that reports
 * partners as paid when nothing moved.
 */
export function resolvePayoutProvider(env: NodeJS.ProcessEnv = process.env): PayoutProvider {
  if (env.RESEARCH_AFFILIATE_PAYOUTS_ENABLED !== "true") return new DisabledPayoutProvider();

  const selected = env.PAYOUT_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledPayoutProvider();
    return new TestPayoutProvider();
  }
  if (selected === "live") return new RealPayoutAdapter();
  return new DisabledPayoutProvider();
}

// ---------------------------------------------------------------------------
// Batching policy
// ---------------------------------------------------------------------------

/**
 * The minimum balance before a partner is paid.
 *
 * Configurable, not a published permanent tier. It exists to keep per-payment rail
 * fees from consuming a small balance, and a balance under it stays owed rather
 * than being forfeited.
 */
export const MINIMUM_PAYOUT_CENTS = 5000;

export type PartnerTaxStatus = "missing" | "submitted" | "verified";
export type PayoutMethodStatus = "missing" | "unverified" | "verified";

export type PayoutDenialReason =
  | "partner_not_active"
  | "tax_status_missing"
  | "below_minimum"
  | "payout_status_unverified"
  | "entry_under_dispute"
  | "entry_on_hold";

export interface PayoutEligibility {
  ok: boolean;
  reasons: PayoutDenialReason[];
}

export interface EligibilityFlags {
  payoutMethodStatus?: PayoutMethodStatus;
  underDispute?: boolean;
  onHold?: boolean;
}

/**
 * Decides whether a partner balance may be paid.
 *
 * Fails closed and accumulates every reason rather than returning on the first, so
 * an admin sees the whole list and fixes it in one pass instead of discovering the
 * blockers one payout run at a time.
 *
 * `payoutMethodStatus` defaults to "missing" deliberately: a caller that has not
 * told us the payout method is verified has not proven it, and silence must not
 * read as approval.
 */
export function eligibleForPayout(
  partnerState: PartnerState,
  taxStatus: PartnerTaxStatus,
  payableCents: number,
  minimumCents: number = MINIMUM_PAYOUT_CENTS,
  flags: EligibilityFlags = {},
): PayoutEligibility {
  const reasons: PayoutDenialReason[] = [];

  if (!partnerCanBePaid(partnerState)) reasons.push("partner_not_active");
  if (taxStatus !== "verified") reasons.push("tax_status_missing");
  if ((flags.payoutMethodStatus ?? "missing") !== "verified") reasons.push("payout_status_unverified");
  if (!Number.isFinite(payableCents) || payableCents < minimumCents) reasons.push("below_minimum");
  if (flags.underDispute === true) reasons.push("entry_under_dispute");
  if (flags.onHold === true) reasons.push("entry_on_hold");

  return { ok: reasons.length === 0, reasons };
}

export interface PayoutBatchEntry {
  ledgerId: string;
  partnerId: string;
  partnerState: PartnerState;
  taxStatus: PartnerTaxStatus;
  payoutMethodStatus: PayoutMethodStatus;
  commissionState: CommissionState;
  /** Integer minor units. */
  amountCents: number;
  /** ISO. The entry is not batchable until its hold has elapsed. */
  payableAt: string;
  underDispute: boolean;
  onHold: boolean;
}

export interface PayoutBatchGroup {
  partnerId: string;
  amountCents: number;
  ledgerIds: string[];
}

export interface ExcludedPayoutEntry {
  ledgerId: string;
  partnerId: string;
  reasons: PayoutDenialReason[];
}

export interface PayoutBatch {
  included: PayoutBatchGroup[];
  excluded: ExcludedPayoutEntry[];
}

/**
 * Groups payable commission entries into per-partner payments.
 *
 * Two passes on purpose. Entry-level blockers (state, hold, dispute) are applied
 * first so a blocked entry never inflates the partner total, then the partner-level
 * gate runs on what actually survived. An excluded entry keeps its reasons, so the
 * admin queue can explain every dollar that did not go out.
 *
 * `asOf` is passed in rather than read from the clock, so a batch is reproducible.
 */
export function buildBatch(entries: readonly PayoutBatchEntry[], asOf: Date): PayoutBatch {
  const asOfMs = asOf.getTime();
  const excluded: ExcludedPayoutEntry[] = [];
  const survivors = new Map<string, PayoutBatchEntry[]>();

  entries.forEach((entry) => {
    const reasons: PayoutDenialReason[] = [];

    // Only a payable commission may become paid. Anything else is still moving.
    if (entry.commissionState !== "payable") reasons.push("entry_on_hold");
    if (entry.onHold) reasons.push("entry_on_hold");
    if (entry.underDispute) reasons.push("entry_under_dispute");

    const payableMs = new Date(entry.payableAt).getTime();
    if (!Number.isFinite(payableMs) || payableMs > asOfMs) reasons.push("entry_on_hold");

    if (reasons.length > 0) {
      excluded.push({ ledgerId: entry.ledgerId, partnerId: entry.partnerId, reasons: dedupe(reasons) });
      return;
    }

    const bucket = survivors.get(entry.partnerId);
    if (bucket) bucket.push(entry);
    else survivors.set(entry.partnerId, [entry]);
  });

  const included: PayoutBatchGroup[] = [];

  survivors.forEach((partnerEntries, partnerId) => {
    // Round DOWN on the total so a stray fractional cent upstream can never invent
    // value for a partner.
    let total = 0;
    partnerEntries.forEach((e) => {
      total += Math.floor(e.amountCents);
    });

    // Every entry is checked, not just the first one in the list. Entries carry a
    // snapshot of the partner, and if two snapshots disagree the batch must fail
    // closed on the worst of them, or a payment would depend on row order.
    const reasons: PayoutDenialReason[] = [];
    partnerEntries.forEach((e) => {
      const perEntry = eligibleForPayout(e.partnerState, e.taxStatus, total, MINIMUM_PAYOUT_CENTS, {
        payoutMethodStatus: e.payoutMethodStatus,
      });
      perEntry.reasons.forEach((reason) => reasons.push(reason));
    });
    const eligibility: PayoutEligibility = { ok: reasons.length === 0, reasons: dedupe(reasons) };

    if (!eligibility.ok) {
      partnerEntries.forEach((e) => {
        excluded.push({ ledgerId: e.ledgerId, partnerId, reasons: eligibility.reasons.slice() });
      });
      return;
    }

    const ledgerIds: string[] = [];
    partnerEntries.forEach((e) => ledgerIds.push(e.ledgerId));
    included.push({ partnerId, amountCents: total, ledgerIds });
  });

  // Deterministic order so two runs over the same data produce the same batch.
  included.sort((a, b) => a.partnerId.localeCompare(b.partnerId));
  excluded.sort((a, b) => a.ledgerId.localeCompare(b.ledgerId));

  return { included, excluded };
}

function dedupe(reasons: readonly PayoutDenialReason[]): PayoutDenialReason[] {
  const out: PayoutDenialReason[] = [];
  reasons.forEach((r) => {
    if (out.indexOf(r) === -1) out.push(r);
  });
  return out;
}
