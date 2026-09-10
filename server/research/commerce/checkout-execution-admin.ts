// What operations sees when a customer's payment did not simply succeed.
//
// The customer's continuation door already tells THEM the truth: waiting on the
// bank, being verified, cancelled, done. Operations had no matching view. For
// an order whose payment parked, the admin order list showed
// `checkout_pending` with no reason, so the one person who could act could not
// see what to act on. The founder's milestone requires the customer and
// operations to see the same outcome; this is the operations half.
//
// It is a READ. It moves no money, changes no state and takes no decision. It
// answers, for one order the admin is already looking at: which execution owns
// its payment, what phase that execution is in, what the provider reference is,
// whether a local commit failed and why, and what a human should do next.
//
// What it deliberately never returns: a client secret (the customer's continuation
// door is the only place that exists, and only while the provider is actually
// waiting on them), a payment-method reference, a request body digest, or any
// raw provider payload. An operator does not need those to act, and an admin
// surface is a place credentials leak from.
import type { Express, Request, Response } from "express";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { adminIdOf } from "./routes";

/** What an operator can do about this execution right now. */
export type CheckoutExecutionAdvice =
  | "none_settled"
  | "waiting_on_customer"
  | "waiting_on_provider"
  | "verify_with_provider"
  | "reconcile_captured_payment"
  | "resume_cancellation";

export interface CheckoutExecutionAdminView {
  executionId: string;
  orderId: string;
  memberId: string;
  phase: CheckoutExecutionRecord["phase"];
  amountCents: number;
  currency: "usd";
  /** The provider's own identifier for the payment, so an operator can open it there. */
  providerReference: string | null;
  /** When the first authorization was attempted, which bounds what a replay can still do. */
  authorizationAttemptedAt: string | null;
  /** Set when the payment succeeded but the local transaction did not complete. */
  localCommitFailure: string | null;
  committedAt: string | null;
  settledAt: string | null;
  /** True when money is known to have moved at the provider. */
  moneyTaken: boolean;
  advice: CheckoutExecutionAdvice;
}

export type CheckoutExecutionAdminResult =
  | { ok: true; execution: CheckoutExecutionAdminView }
  | { ok: false; code: "not_found" };

/**
 * The phases in which money is known to have been taken. `captured` and
 * `committed` both mean the provider took it; the difference is only whether
 * our own records caught up.
 */
const MONEY_TAKEN: readonly CheckoutExecutionRecord["phase"][] = ["captured", "committed"];

export function adviseOn(record: CheckoutExecutionRecord): CheckoutExecutionAdvice {
  switch (record.phase) {
    case "committed":
      return "none_settled";
    case "cancelled":
      // Cancelled at the provider but not yet settled locally: the order and the
      // holds are still waiting on the settlement step.
      return record.settledAt === null ? "resume_cancellation" : "none_settled";
    case "captured":
      // The money is taken and the local transaction has not completed. This is
      // the case that must never be left alone.
      return "reconcile_captured_payment";
    case "action_required":
      return "waiting_on_customer";
    case "cancelling":
      return "resume_cancellation";
    case "reconciliation_required":
      return record.localCommitFailure ? "reconcile_captured_payment" : "verify_with_provider";
    default:
      // reserved, authorizing, authorized, capturing: an attempt is in flight or
      // was interrupted; the provider's own record is the truth.
      return "waiting_on_provider";
  }
}

export function toAdminView(record: CheckoutExecutionRecord): CheckoutExecutionAdminView {
  return {
    executionId: record.executionId,
    orderId: record.orderId,
    memberId: record.memberId,
    phase: record.phase,
    amountCents: record.amountCents,
    currency: "usd",
    providerReference: record.providerReference,
    authorizationAttemptedAt: record.authorizationAttemptedAt,
    localCommitFailure: record.localCommitFailure ?? null,
    committedAt: record.committedAt ?? null,
    settledAt: record.settledAt,
    moneyTaken: MONEY_TAKEN.includes(record.phase) || Boolean(record.localCommitFailure),
    advice: adviseOn(record),
  };
}

export interface CheckoutExecutionAdminDeps {
  /** The execution that owns this order's payment, if one does. */
  findByOrder(orderId: string): Promise<CheckoutExecutionRecord | null>;
}

export function createCheckoutExecutionAdminService(deps: CheckoutExecutionAdminDeps) {
  return {
    async forOrder(orderId: string): Promise<CheckoutExecutionAdminResult> {
      const record = await deps.findByOrder(orderId);
      // An order with no execution is an ordinary order placed through the
      // assisted path. That is not an error and not a payment problem.
      if (!record) return { ok: false, code: "not_found" };
      return { ok: true, execution: toAdminView(record) };
    },
  };
}

export type CheckoutExecutionAdminService = ReturnType<typeof createCheckoutExecutionAdminService>;

export const CHECKOUT_EXECUTION_ADMIN_PATH = "/api/admin/research/orders/:orderId/payment-execution";

const ORDER_ID = /^[A-Za-z0-9_-]{1,120}$/;

export interface CheckoutExecutionAdminGuards {
  requireAdmin: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

/**
 * Registers the operations read behind the canonical admin guard. It is a read:
 * there is no POST here and nothing this route can be made to change.
 */
export function registerCheckoutExecutionAdminApi(
  app: Express,
  guards: CheckoutExecutionAdminGuards,
  deps: { service: CheckoutExecutionAdminService },
): void {
  app.get(CHECKOUT_EXECUTION_ADMIN_PATH, guards.requireAdmin, async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    // The guard establishes the admin; reading it here keeps the identity on the
    // same footing as every other admin route in this lane.
    adminIdOf(req);
    const orderId = String(req.params.orderId ?? "");
    if (!ORDER_ID.test(orderId)) {
      res.status(400).json({ ok: false, code: "order_not_found", message: "That order reference is not valid." });
      return;
    }
    try {
      const result = await deps.service.forOrder(orderId);
      if (!result.ok) {
        res.status(404).json({ ok: false, code: "not_found", message: "No durable payment execution belongs to that order." });
        return;
      }
      res.json({ ok: true, execution: result.execution });
    } catch {
      // Never echo a store or provider error: they carry references and secrets.
      if (!res.headersSent) res.status(503).json({ ok: false, code: "capability_disabled", message: "Payment execution details are not available right now." });
    }
  });
}
