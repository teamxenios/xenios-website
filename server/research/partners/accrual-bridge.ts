// xenios research: the affiliate commission accrual bridge.
//
// One narrow, PURE seam between a canonical payment-settlement fact and the
// Gen 2 commission ledger. It is deliberately unmounted: this module exports a
// factory and nothing else — no route table, no express handler, no HTTP shape
// of any kind — so there is no path by which a browser request can reach it.
// The Early Access settlement seam (the only caller) invokes it server-side
// after payment verification; the integration doc records exactly where.
//
// The rules it enforces, in order:
//
//   1. NOTHING ACCRUES WITHOUT AN ACTIVE PROGRAM. The bridge accepts the
//      result of resolveAffiliateProgram directly; a null program (the flag is
//      not exactly "true") refuses every fact. Activation stays founder-gated.
//   2. UNPAID NEVER ACCRUES. The fact type cannot be constructed without
//      `paymentSettled: true` and the payment provider's own settlement
//      reference; an empty reference is refused at runtime as well. Belief
//      that money moved is not evidence that it did.
//   3. RATES COME ONLY FROM CONFIG. programRateBasisPoints selects 20%/7.5%
//      (or whatever the config says) and a zero rate — a repeat order outside
//      the founder's months 2-12 window — is a refusal, never a 0-cent entry.
//   4. THE LEDGER SERVICE IS THE ONLY WRITER. Accrual goes through
//      createCommissionService (idempotent per partner+order, every gate
//      evaluated), then the founder's maturation hold moves it pending -> held
//      as the system actor. A replayed fact returns the original accrual and
//      appends nothing.

import type { OrderRevenueBreakdown, PartnerState } from "@shared/research/distribution";
import {
  programRateBasisPoints,
  type AffiliateProgramConfig,
  type ProgramOrderOrdinal,
} from "@shared/research/affiliate-program/config";
import {
  createCommissionService,
  type CommissionLedgerEntry,
  type CommissionLedgerRepository,
  type CommissionResult,
} from "./commissions";

/**
 * A canonical settled-payment fact for one attributed order.
 *
 * `paymentSettled` is the literal `true`: an unsettled payment cannot even be
 * expressed as this type, so "unpaid never accrues" holds at compile time and
 * the reference check below holds it at runtime.
 */
export type AffiliateSettlementFact = Readonly<{
  /** The canonical order reference (the assisted-order requestId / order id). */
  orderRef: string;
  /** The attributed partner, from the server-derived attribution ref. */
  partnerId: string;
  /**
   * Eligible net revenue in integer cents, computed upstream by the canonical
   * eligibleNetRevenueCents over the real order breakdown. This bridge embeds
   * it verbatim; it never re-derives eligibility.
   */
  basisCents: number;
  /** First attributed order, or a repeat order in the referred relationship. */
  ordinal: ProgramOrderOrdinal;
  /** Required for a repeat order: months since the first order (first = 1). */
  monthsSinceFirstOrder?: number;
  paymentSettled: true;
  /** The payment provider's own settlement reference. Proof, not belief. */
  paymentReference: string;
  /**
   * Whether commission is activated for this order's product lane. Passed
   * honestly by the caller; peptide and Quantum stay false until the founder
   * activates them, and this bridge never defaults it.
   */
  laneCommissionEnabled: boolean;
  settledAt: Date;
}>;

export type AffiliateAccrualOutcome = Readonly<{
  accrual: CommissionLedgerEntry;
  /** Null exactly when the fact replayed: the first event already held it. */
  hold: CommissionLedgerEntry | null;
  replayed: boolean;
}>;

export type AffiliateAccrualBridgeDeps = Readonly<{
  /**
   * The parsed program, straight from resolveAffiliateProgram(env). Null is a
   * legal input meaning "not activated", and every fact is then refused — the
   * bridge never substitutes the seed for a missing activation.
   */
  program: AffiliateProgramConfig | null;
  /** The durable Gen 2 ledger (resolveCommissionLedgerStore at composition). */
  ledger: CommissionLedgerRepository;
  loadPartnerState: (partnerId: string) => Promise<PartnerState | null>;
  newId: () => string;
}>;

export type AffiliateAccrualBridge = Readonly<{
  onSettledPayment(
    fact: AffiliateSettlementFact,
  ): Promise<CommissionResult<AffiliateAccrualOutcome>>;
}>;

export function createAffiliateAccrualBridge(
  deps: AffiliateAccrualBridgeDeps,
): AffiliateAccrualBridge {
  const commissions = createCommissionService({
    repository: deps.ledger,
    newId: deps.newId,
    loadPartnerState: deps.loadPartnerState,
  });

  return Object.freeze({
    async onSettledPayment(fact) {
      const program = deps.program;
      if (!program) {
        return {
          ok: false,
          denials: [
            {
              code: "commissions_disabled",
              message:
                "The affiliate program is not activated; nothing accrues without the founder-gated flag.",
            },
          ],
        };
      }

      if (fact.paymentReference.trim().length === 0) {
        return {
          ok: false,
          denials: [
            {
              code: "payout_proof_missing",
              message:
                "A settlement must carry the payment provider's own reference; commission never accrues on belief.",
            },
          ],
        };
      }

      const basisPoints = programRateBasisPoints(
        program,
        fact.ordinal,
        fact.monthsSinceFirstOrder,
      );
      if (basisPoints <= 0) {
        return {
          ok: false,
          denials: [
            {
              code: "invalid_rate",
              message:
                "The program pays no rate for this order (repeat outside the configured window); no entry is written.",
            },
          ],
        };
      }

      const state = await deps.loadPartnerState(fact.partnerId);
      if (state === null) {
        // Fails closed: an unknown partner is treated exactly like an
        // ineligible one, mirroring markPayable.
        return {
          ok: false,
          denials: [
            {
              code: "partner_not_active",
              message: `Partner ${fact.partnerId} is unknown; commission cannot accrue.`,
            },
          ],
        };
      }

      // The settlement fact already carries the canonical eligible net
      // revenue, so the breakdown is its identity embedding: gross = basis and
      // every deduction 0, which makes eligibleNetRevenueCents(breakdown)
      // exactly basisCents. Non-integer or negative values are refused by the
      // service's own integer-cents gate.
      const breakdown: OrderRevenueBreakdown = {
        grossItemsCents: fact.basisCents,
        taxCents: 0,
        shippingCents: 0,
        discountsCents: 0,
        storeCreditAppliedCents: 0,
        refundedCents: 0,
        chargebackCents: 0,
        ineligibleCategoryCents: 0,
      };

      const accrued = await commissions.accrue(
        fact.partnerId,
        fact.orderRef,
        breakdown,
        { role: "affiliate", basisPoints },
        {
          partnerState: state,
          // The program parse above IS the commissions activation for this
          // bridge; the lane flag is the caller's honest per-lane answer.
          commissionsEnabled: true,
          laneCommissionEnabled: fact.laneCommissionEnabled,
        },
        fact.settledAt,
      );
      if (!accrued.ok) return accrued;

      if (accrued.value.replayed) {
        // Idempotent: the first event already accrued and held this chain.
        // Appending a second hold would be a second entry for the same fact.
        return {
          ok: true,
          value: { accrual: accrued.value.entry, hold: null, replayed: true },
        };
      }

      const held = await commissions.holdForMaturation(
        accrued.value.entry.id,
        `Maturation hold: ${program.holdDays} days after settled payment and fulfillment (payment ${fact.paymentReference.trim()}).`,
        fact.settledAt,
      );
      if (!held.ok) return { ok: false, denials: held.denials };

      return {
        ok: true,
        value: { accrual: accrued.value.entry, hold: held.value, replayed: false },
      };
    },
  });
}
