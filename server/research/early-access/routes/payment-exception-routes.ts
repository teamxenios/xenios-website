/**
 * The overpayment resolution door and the refund record.
 *
 * An overpayment classifies correctly and then has nowhere to go. The
 * likeliest customer payment error is paying the UNDISCOUNTED subtotal: the
 * invoice shows both numbers on one page, and a three-unit bundle makes the
 * larger one the wrong one. That customer is not careless, they read their
 * own invoice. Their money is real, it sits in the founder's account, and
 * until these doors existed the order could not advance, could not be
 * refunded and could not be rejected: an operational dead end with a real
 * person's money in it.
 *
 * These doors RECORD. They never settle. An overpayment exception does not
 * verify a payment, does not create a receipt, does not release a supplier
 * and does not accrue commission; confirmation remains the only settlement
 * path and still refuses PAYMENT_OVERPAID until the excess is resolved. A
 * refund reverses money a human confirmed arrived, so its ceiling is the
 * VERIFIED amount from the settlement, never a price list.
 */

import { recordOverpaymentException } from "../commerce/payment-exception";
import { reconcilePayment } from "../commerce/payment-reconciliation";
import { recordRefund } from "../commerce/refund";
import type { EarlyAccessAdminRouteDependencies } from "./admin-routes";
import { resolveEarlyAccessAdmin, recordEarlyAccessAudit } from "./admin-routes";
import {
  applyPrivateHeaders,
  fail,
  project,
  send,
  stampOf,
  type ResponsePort,
} from "./http";
import { isEarlyAccessOrderNumber } from "./order-number";

function unavailable(response: ResponsePort): void {
  fail(response, 503, "UNAVAILABLE");
}

export function createEarlyAccessOverpaymentExceptionRoute(
  deps: EarlyAccessAdminRouteDependencies,
) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveEarlyAccessAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const now = stampOf(caller.nowMs);

      if (!isEarlyAccessOrderNumber(request?.orderNumber)) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }
      const orderNumber = request.orderNumber as string;
      const placement = await deps.store.placementByOrderNumber(orderNumber);
      if (placement === null) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }
      if (deps.store.recordOverpaymentException === undefined) {
        unavailable(response);
        return;
      }

      const body = project(request?.body, [
        "receivedAmountCents",
        "receivedCurrency",
        "action",
        "reason",
        "approvedCreditRef",
      ]);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }

      // The EXPECTED side comes from the order's immutable snapshot, exactly
      // as it does at confirmation. Only what arrived comes from the human.
      const reconciled = reconcilePayment({
        money: placement.order.money,
        observedAmountCents: body.receivedAmountCents,
        observedCurrency: body.receivedCurrency,
      });
      if (!reconciled.ok) {
        fail(response, 422, "RECONCILIATION_INVALID", { code: reconciled.code });
        return;
      }
      if (reconciled.value.classification !== "OVERPAYMENT") {
        // Recording an overpayment for something that is not one would put a
        // false fact about a customer's money into an append-only trail.
        fail(response, 409, "NOT_OVERPAID", {
          classification: reconciled.value.classification,
        });
        return;
      }

      const recorded = recordOverpaymentException({
        orderId: orderNumber,
        reconciliation: reconciled.value,
        actor: { id: caller.actor.actorId, role: caller.actor.role },
        reason: body.reason,
        grantedAt: now,
        ...(body.action === undefined ? {} : { action: body.action }),
        ...(body.approvedCreditRef === undefined
          ? {}
          : { approvedCreditRef: body.approvedCreditRef }),
      });
      if (!recorded.ok) {
        fail(response, 422, "EXCEPTION_INVALID", { code: recorded.code });
        return;
      }

      const stored = await deps.store.recordOverpaymentException(orderNumber, recorded.value);
      if (!stored) {
        // One arrival of money gets one recorded exception. A second is a
        // replay, and the first record stands.
        fail(response, 409, "EXCEPTION_ALREADY_RECORDED");
        return;
      }

      await recordEarlyAccessAudit(deps, {
        event: "early_access.payment.overpayment_exception",
        orderNumber,
        actor: caller.actor.actorId,
        at: now,
        detail: {
          role: caller.actor.role,
          expectedAmountCents: recorded.value.expectedAmountCents,
          receivedAmountCents: recorded.value.receivedAmountCents,
          excessCents: recorded.value.excessCents,
          action: recorded.value.action,
          resolution: recorded.value.resolution,
        },
      });

      send(response, 201, {
        ok: true,
        exception: {
          exceptionId: recorded.value.exceptionId,
          orderNumber,
          expectedAmountCents: recorded.value.expectedAmountCents,
          receivedAmountCents: recorded.value.receivedAmountCents,
          excessCents: recorded.value.excessCents,
          action: recorded.value.action,
          resolution: recorded.value.resolution,
        },
        // Stated rather than implied: nothing about the order moved.
        settled: false,
        paymentState: placement.paymentState,
      });
    } catch {
      unavailable(response);
    }
  };
}

export function createEarlyAccessRefundRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveEarlyAccessAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const now = stampOf(caller.nowMs);

      if (!isEarlyAccessOrderNumber(request?.orderNumber)) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }
      const orderNumber = request.orderNumber as string;
      if (deps.store.appendRefund === undefined || deps.store.refunds === undefined) {
        unavailable(response);
        return;
      }

      const settlement = await deps.store.settlement(orderNumber);
      if (settlement === null) {
        // Nothing was ever verified as received, so there is nothing to
        // reverse. Refunding an unverified order would invent a payment.
        fail(response, 409, "NOT_VERIFIED");
        return;
      }

      // A recorded overpayment exception is what permits a refund ABOVE the
      // payable total, so it is loaded and passed rather than assumed.
      const exception =
        deps.store.overpaymentException === undefined
          ? null
          : await deps.store.overpaymentException(orderNumber);
      const trail = await deps.store.refunds(orderNumber);
      // A malformed row must not silently DISABLE the ceiling: NaN compares
      // false against everything, so summing it would let any refund
      // through. An unreadable trail refuses instead.
      let priorRefundedCents = 0;
      for (const entry of trail) {
        const amount = (entry as { amountCents?: unknown }).amountCents;
        if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
          fail(response, 409, "REFUND_TRAIL_UNREADABLE");
          return;
        }
        priorRefundedCents += amount;
      }
      const body = project(request?.body, ["amountCents", "reason"]);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }

      // The domain owns the ceiling: it reads the VERIFIED order projection
      // (the number a named human confirmed arrived) and the prior trail,
      // and refuses anything above verified minus already-refunded. The
      // route supplies the facts and never the arithmetic.
      const recorded = recordRefund({
        verifiedOrder: settlement.verifiedOrder,
        refunds: trail,
        actor: { id: caller.actor.actorId, role: caller.actor.role },
        amountCents: body.amountCents,
        currency: settlement.ledgerEntry.currency,
        reason: body.reason,
        refundedAt: now,
        ...(exception === null ? {} : { overpaymentException: exception }),
      });
      if (!recorded.ok) {
        fail(response, 422, "REFUND_INVALID", { code: recorded.code });
        return;
      }

      // Compare-and-swap at the write: the ceiling above was computed from a
      // trail of exactly this length, so a trail that grew in between makes
      // it stale. The loser of a double-click re-reads rather than paying
      // out a second time against the same received money.
      const appended = await deps.store.appendRefund(
        orderNumber,
        recorded.value,
        trail.length + 1,
      );
      if (!appended.appended) {
        fail(
          response,
          409,
          appended.reason === "sequence_moved"
            ? "REFUND_SEQUENCE_MOVED"
            : "REFUND_ALREADY_RECORDED",
        );
        return;
      }

      await recordEarlyAccessAudit(deps, {
        event: "early_access.payment.refund_recorded",
        orderNumber,
        actor: caller.actor.actorId,
        at: now,
        detail: {
          role: caller.actor.role,
          amountCents: recorded.value.amountCents,
          currency: recorded.value.currency,
          priorRefundedCents,
          sequence: recorded.value.sequence,
        },
      });

      send(response, 201, {
        ok: true,
        refund: {
          refundId: recorded.value.refundId,
          orderNumber,
          amountCents: recorded.value.amountCents,
          currency: recorded.value.currency,
          sequence: recorded.value.sequence,
        },
      });
    } catch {
      unavailable(response);
    }
  };
}
