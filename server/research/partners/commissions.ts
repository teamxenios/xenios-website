// xenios research: the partner commission ledger.
//
// The ledger is APPEND ONLY. An entry is never edited and never deleted. A state
// move, a correction, and a reversal are each a NEW entry that references the one
// before it, so the original record of what was accrued survives every later event
// and an audit can replay the whole history.
//
// A "chain" is every entry sharing a rootId: the accrual that opened it plus each
// entry appended after. The chain HEAD carries the current state. Balances are
// derived by walking the chains, never by keeping a running total that could drift
// away from the entries that justify it.
//
// Founder rules this file is bound by:
//   - Commission derives ONLY from eligible net revenue on an attributed order.
//     There is no recruitment event, no signup bonus, and no parent partner.
//   - Peptide and Quantum lane commission stays disabled. This file never defaults
//     laneCommissionEnabled to true; the caller must pass it honestly.
//   - Money is integer cents.
//   - Fail closed, and accumulate every denial rather than returning on the first.

import {
  computeCommission,
  eligibleNetRevenueCents,
  partnerCanBePaid,
  partnerCanEarn,
  transitionCommission,
  type CommissionContext,
  type CommissionRate,
  type CommissionState,
  type OrderRevenueBreakdown,
  type PartnerState,
} from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * accrual   opens a chain and is the only entry that creates commission value.
 * transition records a state move. It moves no money, so its amountCents is 0.
 * reversal  removes value from a chain. Its amountCents is the portion removed.
 */
export type CommissionEntryKind = "accrual" | "transition" | "reversal";

export interface CommissionLedgerEntry {
  readonly id: string;
  /** The accrual entry that opened this chain. An accrual is its own root. */
  readonly rootId: string;
  readonly previousEntryId: string | null;
  readonly kind: CommissionEntryKind;
  readonly partnerId: string;
  readonly orderId: string;
  /** Accrual: commission earned. Reversal: commission removed. Transition: 0. */
  readonly amountCents: number;
  /** The eligible net revenue the accrual was computed from. Carried for audit. */
  readonly eligibleNetCents: number;
  /** The state of the chain AFTER this entry. */
  readonly state: CommissionState;
  readonly actor: "admin" | "system";
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly payoutBatchId: string | null;
  readonly createdAt: string;
}

export interface CommissionBalance {
  pendingCents: number;
  heldCents: number;
  approvedCents: number;
  payableCents: number;
  paidCents: number;
  disputedCents: number;
  forfeitedCents: number;
  reversedCents: number;
}

// ---------------------------------------------------------------------------
// Denials
// ---------------------------------------------------------------------------

export type CommissionDenialCode =
  | "commissions_disabled"
  | "lane_commission_disabled"
  | "partner_not_active"
  | "no_eligible_revenue"
  | "invalid_rate"
  | "invalid_amount"
  | "entry_not_found"
  | "invalid_transition"
  | "chain_terminal"
  | "partner_not_payable"
  | "missing_actor"
  | "missing_reason"
  | "nothing_to_reverse";

export interface CommissionDenial {
  readonly code: CommissionDenialCode;
  readonly message: string;
}

export type CommissionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly denials: readonly CommissionDenial[] };

function denied<T>(denials: readonly CommissionDenial[]): CommissionResult<T> {
  return { ok: false, denials };
}

function accepted<T>(value: T): CommissionResult<T> {
  return { ok: true, value };
}

export interface AccrualOutcome {
  readonly entry: CommissionLedgerEntry;
  /** True when this call matched an existing accrual instead of creating one. */
  readonly replayed: boolean;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * The persistence boundary. Every method is read or append. There is deliberately
 * no update and no delete, so no storage implementation can be written that edits
 * a ledger entry in place.
 */
export interface CommissionLedgerRepository {
  append(entry: CommissionLedgerEntry): Promise<void>;
  getEntry(entryId: string): Promise<CommissionLedgerEntry | null>;
  /** Entries of one chain, oldest first. */
  listChain(rootId: string): Promise<readonly CommissionLedgerEntry[]>;
  /** Every entry for one partner, oldest first. */
  listByPartner(partnerId: string): Promise<readonly CommissionLedgerEntry[]>;
  /** Accrual entries for one order, oldest first. */
  listAccrualsByOrder(orderId: string): Promise<readonly CommissionLedgerEntry[]>;
  findAccrual(partnerId: string, orderId: string): Promise<CommissionLedgerEntry | null>;
}

export class InMemoryCommissionLedgerRepository implements CommissionLedgerRepository {
  private entries: CommissionLedgerEntry[] = [];

  async append(entry: CommissionLedgerEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getEntry(entryId: string): Promise<CommissionLedgerEntry | null> {
    return this.entries.find((e) => e.id === entryId) ?? null;
  }

  async listChain(rootId: string): Promise<readonly CommissionLedgerEntry[]> {
    return this.entries.filter((e) => e.rootId === rootId);
  }

  async listByPartner(partnerId: string): Promise<readonly CommissionLedgerEntry[]> {
    return this.entries.filter((e) => e.partnerId === partnerId);
  }

  async listAccrualsByOrder(orderId: string): Promise<readonly CommissionLedgerEntry[]> {
    return this.entries.filter((e) => e.orderId === orderId && e.kind === "accrual");
  }

  async findAccrual(partnerId: string, orderId: string): Promise<CommissionLedgerEntry | null> {
    return (
      this.entries.find(
        (e) => e.kind === "accrual" && e.partnerId === partnerId && e.orderId === orderId,
      ) ?? null
    );
  }

  /** Test and inspection helper. Returns a copy so a caller cannot mutate storage. */
  snapshot(): readonly CommissionLedgerEntry[] {
    return this.entries.slice();
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CommissionServiceDeps {
  readonly repository: CommissionLedgerRepository;
  readonly newId: () => string;
  /**
   * Required, not optional. A payout gate that can be forgotten is not a gate, so
   * the service refuses to be constructed without a way to check partner state.
   */
  readonly loadPartnerState: (partnerId: string) => Promise<PartnerState | null>;
}

export interface CommissionService {
  accrue(
    partnerId: string,
    orderId: string,
    breakdown: OrderRevenueBreakdown,
    rate: CommissionRate,
    ctx: CommissionContext,
    asOf: Date,
  ): Promise<CommissionResult<AccrualOutcome>>;
  hold(ledgerId: string, adminId: string, reason: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  approve(ledgerId: string, adminId: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  markPayable(ledgerId: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  markPaid(ledgerId: string, payoutBatchId: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  reverse(ledgerId: string, reason: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  dispute(ledgerId: string, adminId: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  resolveDispute(
    ledgerId: string,
    adminId: string,
    outcome: "approved" | "reversed" | "forfeited",
    reason: string,
    asOf: Date,
  ): Promise<CommissionResult<CommissionLedgerEntry>>;
  forfeit(ledgerId: string, adminId: string, reason: string, asOf: Date): Promise<CommissionResult<CommissionLedgerEntry>>;
  balanceFor(partnerId: string): Promise<CommissionBalance>;
  onOrderRefunded(orderId: string, refundedCents: number, asOf: Date): Promise<CommissionResult<readonly CommissionLedgerEntry[]>>;
}

const TERMINAL: readonly CommissionState[] = ["reversed", "forfeited"];

function isTerminal(state: CommissionState): boolean {
  return TERMINAL.indexOf(state) !== -1;
}

export function createCommissionService(deps: CommissionServiceDeps): CommissionService {
  const { repository, newId, loadPartnerState } = deps;

  /** The chain head carries the current state. Entries are stored oldest first. */
  async function head(rootId: string): Promise<CommissionLedgerEntry | null> {
    const chain = await repository.listChain(rootId);
    return chain.length === 0 ? null : chain[chain.length - 1];
  }

  /** Accrued minus everything already reversed, clamped so it can never go negative. */
  function outstandingOf(chain: readonly CommissionLedgerEntry[]): number {
    let accrued = 0;
    let reversed = 0;
    chain.forEach((e) => {
      if (e.kind === "accrual") accrued += e.amountCents;
      if (e.kind === "reversal") reversed += e.amountCents;
    });
    return Math.max(0, accrued - reversed);
  }

  /**
   * Resolves any entry id to its chain head, so a caller may pass the accrual id or
   * any later entry id and still act on the current state of that commission.
   */
  async function resolveHead(
    ledgerId: string,
  ): Promise<{ ok: true; head: CommissionLedgerEntry } | { ok: false; denials: CommissionDenial[] }> {
    const entry = await repository.getEntry(ledgerId);
    if (!entry) {
      return { ok: false, denials: [{ code: "entry_not_found", message: `No ledger entry ${ledgerId}.` }] };
    }
    const current = await head(entry.rootId);
    if (!current) {
      return { ok: false, denials: [{ code: "entry_not_found", message: `Chain ${entry.rootId} is empty.` }] };
    }
    return { ok: true, head: current };
  }

  /** The single path by which a chain changes state. */
  async function move(
    ledgerId: string,
    to: CommissionState,
    actor: "admin" | "system",
    actorId: string | null,
    reason: string | null,
    asOf: Date,
    payoutBatchId: string | null,
  ): Promise<CommissionResult<CommissionLedgerEntry>> {
    const resolved = await resolveHead(ledgerId);
    if (!resolved.ok) return denied(resolved.denials);
    const current = resolved.head;

    const denials: CommissionDenial[] = [];
    if (actor === "admin" && !actorId) {
      denials.push({ code: "missing_actor", message: "An admin action must name the admin." });
    }
    if (isTerminal(current.state)) {
      denials.push({ code: "chain_terminal", message: `Commission is terminal in state ${current.state}.` });
    }

    const transition = transitionCommission(current.state, to, actor);
    if (!transition.ok) {
      denials.push({ code: "invalid_transition", message: transition.message });
    }
    if (denials.length > 0) return denied(denials);

    const entry: CommissionLedgerEntry = {
      id: newId(),
      rootId: current.rootId,
      previousEntryId: current.id,
      kind: "transition",
      partnerId: current.partnerId,
      orderId: current.orderId,
      amountCents: 0,
      eligibleNetCents: current.eligibleNetCents,
      state: to,
      actor,
      actorId,
      reason,
      payoutBatchId,
      createdAt: asOf.toISOString(),
    };
    await repository.append(entry);
    return accepted(entry);
  }

  /**
   * Appends a reversal. A full reversal also moves the chain to "reversed"; a
   * partial reversal leaves the state alone because the remaining commission is
   * still live.
   *
   * Reversal amounts round UP. Rule 6 rounds DOWN when computing what a partner
   * earns; rounding a reversal down would leave the partner holding a cent they no
   * longer earned, which is the same error in the same direction.
   */
  async function appendReversal(
    current: CommissionLedgerEntry,
    chain: readonly CommissionLedgerEntry[],
    requestedCents: number,
    actor: "admin" | "system",
    actorId: string | null,
    reason: string,
    asOf: Date,
  ): Promise<CommissionResult<CommissionLedgerEntry>> {
    const outstanding = outstandingOf(chain);
    if (outstanding <= 0) {
      return denied([{ code: "nothing_to_reverse", message: "Nothing remains to reverse on this commission." }]);
    }
    const amount = Math.min(outstanding, Math.max(0, Math.ceil(requestedCents)));
    if (amount <= 0) {
      return denied([{ code: "invalid_amount", message: "A reversal must remove at least one cent." }]);
    }

    const full = amount >= outstanding;
    let state = current.state;
    if (full) {
      const transition = transitionCommission(current.state, "reversed", actor);
      if (!transition.ok) {
        return denied([{ code: "invalid_transition", message: transition.message }]);
      }
      state = transition.state;
    }

    const entry: CommissionLedgerEntry = {
      id: newId(),
      rootId: current.rootId,
      previousEntryId: current.id,
      kind: "reversal",
      partnerId: current.partnerId,
      orderId: current.orderId,
      amountCents: amount,
      eligibleNetCents: current.eligibleNetCents,
      state,
      actor,
      actorId,
      reason,
      payoutBatchId: null,
      createdAt: asOf.toISOString(),
    };
    await repository.append(entry);
    return accepted(entry);
  }

  return {
    async accrue(partnerId, orderId, breakdown, rate, ctx, asOf) {
      // Idempotent per (partnerId, orderId). One order accrues one commission, so a
      // replayed webhook returns the original entry rather than creating a second.
      const existing = await repository.findAccrual(partnerId, orderId);
      if (existing) return accepted({ entry: existing, replayed: true });

      // Every gate is evaluated so the caller sees the full reason set, not just the
      // first failure.
      const denials: CommissionDenial[] = [];
      if (!ctx.commissionsEnabled) {
        denials.push({ code: "commissions_disabled", message: "Partner commissions are not enabled." });
      }
      if (!ctx.laneCommissionEnabled) {
        denials.push({
          code: "lane_commission_disabled",
          message: "Commission for this product lane is not activated.",
        });
      }
      if (!partnerCanEarn(ctx.partnerState)) {
        denials.push({ code: "partner_not_active", message: `Partner is ${ctx.partnerState}, not active.` });
      }
      if (!Number.isFinite(rate.basisPoints) || rate.basisPoints < 0) {
        denials.push({ code: "invalid_rate", message: "Commission rate must be a non-negative basis point value." });
      }

      // Checked directly rather than read off computeCommission, which short-circuits
      // on the first failed gate and would hide this reason behind an earlier one.
      if (eligibleNetRevenueCents(breakdown) <= 0) {
        denials.push({ code: "no_eligible_revenue", message: "The order has no eligible net revenue." });
      }
      if (denials.length > 0) return denied(denials);

      const computed = computeCommission(breakdown, rate, ctx);
      if (!computed.earned) {
        return denied([{ code: computed.reason, message: `Commission denied: ${computed.reason}.` }]);
      }

      const id = newId();
      const entry: CommissionLedgerEntry = {
        id,
        rootId: id,
        previousEntryId: null,
        kind: "accrual",
        partnerId,
        orderId,
        amountCents: computed.amountCents,
        eligibleNetCents: computed.eligibleNetCents,
        state: "pending",
        actor: "system",
        actorId: null,
        reason: null,
        payoutBatchId: null,
        createdAt: asOf.toISOString(),
      };
      await repository.append(entry);
      return accepted({ entry, replayed: false });
    },

    async hold(ledgerId, adminId, reason, asOf) {
      if (!reason.trim()) {
        return denied([{ code: "missing_reason", message: "A hold must record why." }]);
      }
      return move(ledgerId, "held", "admin", adminId, reason, asOf, null);
    },

    async approve(ledgerId, adminId, asOf) {
      return move(ledgerId, "approved", "admin", adminId, null, asOf, null);
    },

    async markPayable(ledgerId, asOf) {
      const resolved = await resolveHead(ledgerId);
      if (!resolved.ok) return denied(resolved.denials);
      const state = await loadPartnerState(resolved.head.partnerId);
      if (!state || !partnerCanBePaid(state)) {
        // Fails closed. An unknown partner is treated exactly like an ineligible one.
        return denied([
          {
            code: "partner_not_payable",
            message: `Partner ${resolved.head.partnerId} cannot be paid while ${state ?? "unknown"}.`,
          },
        ]);
      }
      return move(ledgerId, "payable", "system", null, null, asOf, null);
    },

    async markPaid(ledgerId, payoutBatchId, asOf) {
      const resolved = await resolveHead(ledgerId);
      if (!resolved.ok) return denied(resolved.denials);

      const denials: CommissionDenial[] = [];
      if (!payoutBatchId.trim()) {
        denials.push({ code: "missing_reason", message: "Marking paid must name the payout batch." });
      }
      const state = await loadPartnerState(resolved.head.partnerId);
      if (!state || !partnerCanBePaid(state)) {
        denials.push({
          code: "partner_not_payable",
          message: `Partner ${resolved.head.partnerId} cannot be paid while ${state ?? "unknown"}.`,
        });
      }
      if (denials.length > 0) return denied(denials);
      return move(ledgerId, "paid", "system", null, null, asOf, payoutBatchId);
    },

    async reverse(ledgerId, reason, asOf) {
      if (!reason.trim()) {
        return denied([{ code: "missing_reason", message: "A reversal must record why." }]);
      }
      const resolved = await resolveHead(ledgerId);
      if (!resolved.ok) return denied(resolved.denials);
      const chain = await repository.listChain(resolved.head.rootId);
      return appendReversal(resolved.head, chain, outstandingOf(chain), "system", null, reason, asOf);
    },

    async dispute(ledgerId, adminId, asOf) {
      return move(ledgerId, "disputed", "admin", adminId, null, asOf, null);
    },

    async resolveDispute(ledgerId, adminId, outcome, reason, asOf) {
      const resolved = await resolveHead(ledgerId);
      if (!resolved.ok) return denied(resolved.denials);
      if (resolved.head.state !== "disputed") {
        return denied([
          { code: "invalid_transition", message: `Commission is ${resolved.head.state}, not disputed.` },
        ]);
      }
      if (outcome === "reversed") {
        const chain = await repository.listChain(resolved.head.rootId);
        return appendReversal(resolved.head, chain, outstandingOf(chain), "admin", adminId, reason, asOf);
      }
      return move(ledgerId, outcome, "admin", adminId, reason, asOf, null);
    },

    async forfeit(ledgerId, adminId, reason, asOf) {
      if (!reason.trim()) {
        return denied([{ code: "missing_reason", message: "A forfeiture must record why." }]);
      }
      return move(ledgerId, "forfeited", "admin", adminId, reason, asOf, null);
    },

    async balanceFor(partnerId) {
      const entries = await repository.listByPartner(partnerId);

      // Group by chain without spreading a Map, then bucket each chain's remaining
      // value by the state its head carries. Derived every time, never accumulated.
      const chains = new Map<string, CommissionLedgerEntry[]>();
      entries.forEach((e) => {
        const bucket = chains.get(e.rootId);
        if (bucket) bucket.push(e);
        else chains.set(e.rootId, [e]);
      });

      const balance: CommissionBalance = {
        pendingCents: 0,
        heldCents: 0,
        approvedCents: 0,
        payableCents: 0,
        paidCents: 0,
        disputedCents: 0,
        forfeitedCents: 0,
        reversedCents: 0,
      };

      chains.forEach((chain) => {
        const current = chain[chain.length - 1];
        let reversed = 0;
        chain.forEach((e) => {
          if (e.kind === "reversal") reversed += e.amountCents;
        });
        balance.reversedCents += reversed;

        const remaining = outstandingOf(chain);
        if (remaining <= 0) return;
        switch (current.state) {
          case "pending":
            balance.pendingCents += remaining;
            break;
          case "held":
            balance.heldCents += remaining;
            break;
          case "approved":
            balance.approvedCents += remaining;
            break;
          case "payable":
            balance.payableCents += remaining;
            break;
          case "paid":
            balance.paidCents += remaining;
            break;
          case "disputed":
            balance.disputedCents += remaining;
            break;
          case "forfeited":
            balance.forfeitedCents += remaining;
            break;
          case "reversed":
            break;
        }
      });

      return balance;
    },

    async onOrderRefunded(orderId, refundedCents, asOf) {
      if (!Number.isFinite(refundedCents) || refundedCents <= 0) {
        return denied([{ code: "invalid_amount", message: "A refund must be a positive cent amount." }]);
      }

      const accruals = await repository.listAccrualsByOrder(orderId);
      const written: CommissionLedgerEntry[] = [];
      const denials: CommissionDenial[] = [];

      for (const accrual of accruals) {
        const chain = await repository.listChain(accrual.rootId);
        const current = chain[chain.length - 1];
        if (isTerminal(current.state)) continue;
        if (outstandingOf(chain) <= 0) continue;

        // The commission attributable to the refunded revenue, proportional to how
        // much of the eligible net revenue went back. A refund at or beyond the
        // eligible net reverses the whole commission.
        const share =
          accrual.eligibleNetCents <= 0 || refundedCents >= accrual.eligibleNetCents
            ? accrual.amountCents
            : Math.ceil((accrual.amountCents * refundedCents) / accrual.eligibleNetCents);

        const result = await appendReversal(
          current,
          chain,
          share,
          "system",
          null,
          `Order ${orderId} refunded ${refundedCents} cents.`,
          asOf,
        );
        if (result.ok) written.push(result.value);
        else result.denials.forEach((d) => denials.push(d));
      }

      if (denials.length > 0) return denied(denials);
      return accepted(written);
    },
  };
}
