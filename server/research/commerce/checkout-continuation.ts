// Payment-authentication continuation for durable checkout executions.
//
// When the provider needs the customer to act (3DS), the coordinator stops the
// execution in `action_required` with the provider reference recorded. This
// module gives the RIGHTFUL BUYER, and only the buyer, what the provider's
// client flow needs (the intent's client secret, read fresh from the provider
// and never stored, logged or placed in a URL by xenios), and a single
// "continue" that re-reads the provider's actual state through the coordinator
// after the customer returns. A redirect, a browser callback or a hopeful
// page is never treated as payment proof; the execution advances only on the
// provider's read-back or a bound webhook.
//
// While the provider still reports the payment as pending, "continue" changes
// nothing and answers authentication_required again, so an uncertain moment
// never turns into a second payment.
import type { Express, Request, Response } from "express";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { DurablePaymentProvider } from "../providers/payment";
import type { CanonicalCheckoutExecutionStore, DurableExecutionOutcome } from "./durable-checkout-executor";
import { subjectOf } from "./routes";

export type CheckoutContinuationState =
  | "pending"
  | "authentication_required"
  | "processing"
  | "completed"
  | "cancelled"
  | "reconciliation_required";

/** What the buyer sees. Amounts are the execution's own integer cents; nothing is recomputed. */
export interface CheckoutContinuationView {
  requestKey: string;
  orderId: string;
  state: CheckoutContinuationState;
  amountCents: number;
  currency: "usd";
  /** Present only in authentication_required: the provider-supported client flow inputs. */
  authentication?: { providerReference: string; clientSecret: string };
}

export type CheckoutContinuationResult =
  | { ok: true; continuation: CheckoutContinuationView }
  | { ok: false; code: "not_found" | "capability_disabled" };

export interface CheckoutContinuationDeps {
  store: Pick<CanonicalCheckoutExecutionStore, "getForMember" | "claim">;
  provider: DurablePaymentProvider;
  executor: { run(memberId: string, requestKey: string): Promise<DurableExecutionOutcome> };
}

function stateOf(record: CheckoutExecutionRecord): CheckoutContinuationState {
  switch (record.phase) {
    case "committed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "action_required":
      return "authentication_required";
    case "reconciliation_required":
      return "reconciliation_required";
    case "authorized":
    case "capturing":
    case "captured":
    case "cancelling":
      return "processing";
    default:
      return "pending";
  }
}

function view(record: CheckoutExecutionRecord, state: CheckoutContinuationState, authentication?: CheckoutContinuationView["authentication"]): CheckoutContinuationView {
  return {
    requestKey: record.requestKey,
    orderId: record.orderId,
    state,
    amountCents: record.amountCents,
    currency: "usd",
    ...(authentication ? { authentication } : {}),
  };
}

export function createCheckoutContinuationService(deps: CheckoutContinuationDeps) {
  async function owned(memberId: string, requestKey: string): Promise<CheckoutExecutionRecord | null> {
    const record = await deps.store.getForMember(memberId, requestKey);
    // The store scopes by member; the re-check makes a foreign record indistinguishable from a missing one.
    return record && record.memberId === memberId && record.requestKey === requestKey ? record : null;
  }

  /**
   * The provider's current answer for a stopped execution. Only a pending
   * payment that names this execution's order and member yields a secret.
   */
  async function authentication(record: CheckoutExecutionRecord): Promise<{ state: CheckoutContinuationState; authentication?: CheckoutContinuationView["authentication"] }> {
    if (record.providerReference === null) return { state: "pending" };
    const snapshot = await deps.provider.retrievePayment(record.providerReference);
    if (!snapshot.ok) return { state: "pending" };
    const payment = snapshot.value;
    if (
      payment.currency !== "usd" ||
      payment.amountCents !== record.amountCents ||
      (payment.orderId !== null && payment.orderId !== record.orderId) ||
      (payment.memberId !== null && payment.memberId !== record.memberId)
    ) {
      return { state: "reconciliation_required" };
    }
    if (payment.status === "pending") {
      return payment.clientSecret
        ? { state: "authentication_required", authentication: { providerReference: record.providerReference, clientSecret: payment.clientSecret } }
        : { state: "pending" };
    }
    if (payment.status === "cancelled") return { state: "cancelled" };
    // authorized / captured / processing: the customer finished; the coordinator must read it back.
    return { state: "processing" };
  }

  function fromOutcome(record: CheckoutExecutionRecord, outcome: DurableExecutionOutcome): CheckoutContinuationState {
    switch (outcome.kind) {
      case "committed":
        return "completed";
      case "cancelled":
        return "cancelled";
      case "action_required":
        return "authentication_required";
      case "reconciliation_required":
        return "reconciliation_required";
      case "missing":
        return stateOf(record);
      default:
        return "pending";
    }
  }

  return {
    async status(memberId: string, requestKey: string): Promise<CheckoutContinuationResult> {
      const record = await owned(memberId, requestKey);
      if (!record) return { ok: false, code: "not_found" };
      if (record.phase !== "action_required") return { ok: true, continuation: view(record, stateOf(record)) };
      const current = await authentication(record);
      return { ok: true, continuation: view(record, current.state, current.authentication) };
    },

    /** The customer says they finished. Verify with the provider, then let the coordinator advance. */
    async continue(memberId: string, requestKey: string): Promise<CheckoutContinuationResult> {
      const record = await owned(memberId, requestKey);
      if (!record) return { ok: false, code: "not_found" };
      if (record.phase === "action_required") {
        const current = await authentication(record);
        if (current.state === "authentication_required") {
          // Still waiting on the customer: no state change, no provider effect, no second payment.
          return { ok: true, continuation: view(record, current.state, current.authentication) };
        }
        if (current.state === "pending" || current.state === "reconciliation_required") {
          return { ok: true, continuation: view(record, current.state) };
        }
        // The provider moved on. Hand the execution back to the coordinator's
        // reconciliation path with a conditional claim; a lost claim means a
        // concurrent continuation already did this.
        const claimed = await deps.store.claim(record.executionId, record.version, "authorizing");
        if (!claimed) return { ok: true, continuation: view(record, "pending") };
      }
      const outcome = await deps.executor.run(memberId, requestKey);
      if (outcome.kind === "action_required") {
        const again = await owned(memberId, requestKey);
        if (again) {
          const current = await authentication(again);
          return { ok: true, continuation: view(again, current.state, current.authentication) };
        }
      }
      const after = (await owned(memberId, requestKey)) ?? record;
      return { ok: true, continuation: view(after, fromOutcome(after, outcome)) };
    },
  };
}

export type CheckoutContinuationService = ReturnType<typeof createCheckoutContinuationService>;

export const CHECKOUT_CONTINUATION_PATHS = {
  status: "/api/research/checkout/executions/:requestKey/continuation",
  continue: "/api/research/checkout/executions/:requestKey/continue",
} as const;

/** The checkout request key shape the member client mints; anything else is not looked up. */
const REQUEST_KEY = /^[A-Za-z0-9_-]{8,120}$/;

export interface CheckoutContinuationGuards {
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

function privateNoStore(res: Response): void {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

/**
 * Registers the two continuation doors behind the canonical active-member guard.
 * The subject is resolved the same way every other commerce route resolves it;
 * nothing in the body or the URL can name another buyer.
 */
export function registerCheckoutContinuationApi(
  app: Express,
  guards: CheckoutContinuationGuards,
  deps: { service: CheckoutContinuationService },
): void {
  const handle = (operation: "status" | "continue") => async (req: Request, res: Response): Promise<void> => {
    privateNoStore(res);
    const memberId = subjectOf(req);
    if (!memberId) {
      res.status(403).json({ ok: false, code: "forbidden", message: "This area requires an active membership." });
      return;
    }
    const requestKey = String(req.params.requestKey ?? "");
    if (!REQUEST_KEY.test(requestKey)) {
      res.status(400).json({ ok: false, code: "invalid_request_key", message: "The checkout reference is not valid." });
      return;
    }
    try {
      const result = operation === "status" ? await deps.service.status(memberId, requestKey) : await deps.service.continue(memberId, requestKey);
      if (!result.ok) {
        res.status(result.code === "not_found" ? 404 : 503).json({ ok: false, code: result.code, message: result.code === "not_found" ? "No checkout in progress matches that reference." : "Payment continuation is not available right now." });
        return;
      }
      res.json({ ok: true, continuation: result.continuation });
    } catch {
      // Never echo provider or store errors: they can carry references and secrets.
      if (!res.headersSent) res.status(503).json({ ok: false, code: "capability_disabled", message: "Payment continuation is not available right now." });
    }
  };
  app.get(CHECKOUT_CONTINUATION_PATHS.status, guards.requireActiveMember, handle("status"));
  app.post(CHECKOUT_CONTINUATION_PATHS.continue, guards.requireActiveMember, handle("continue"));
}
