import { isEarlyAccessPaymentOptionCode } from "@shared/research/early-access-payment-options";

import { buildCommissionHold } from "../commerce/commission-event";
import { isBoundedText, isSafeIdentifier } from "../commerce/input-guards";
import {
  receiptIntentIdFor,
  verificationUniqueKeyFor,
} from "../commerce/payment-verification";
import {
  describeFulfillment,
  describeSupplierRelease,
  describeTrackingUpdate,
} from "../commerce/release-service";
import { decideManualPayment } from "../commerce/verification-service";
import { applyPrivateHeaders, fail, project, readInstant, send, stampOf, type ResponsePort } from "./http";
import { isEarlyAccessOrderNumber } from "./order-number";
import type {
  EarlyAccessAdminActor,
  EarlyAccessAdminDirectory,
  EarlyAccessAuditSink,
} from "./ports";
import type {
  EarlyAccessCommerceStore,
  EarlyAccessDispatchEvent,
  EarlyAccessPlacement,
  EarlyAccessSettlement,
} from "./store";

/**
 * The operator half of Early Access commerce: the payments review queue, the one
 * action that accepts money, and the supplier dispatch trail behind it.
 *
 * These routes live OUTSIDE /api/research on purpose. The shared research wall
 * exists to decide who may reach a customer surface, and an admin surface is not
 * a customer surface: it sits behind the existing Supabase admin guard, which
 * verifies a real admin JWT against the one configured address. Putting them
 * under the research prefix would mean two different gates arguing about one
 * door, and the weaker one answering first.
 *
 * THE ORDERING CONSTRAINT THIS FILE HOLDS. Nothing ships before a named human
 * confirmed the money arrived, and the confirmation produces every downstream
 * fact exactly once. `payment-verification.ts` makes the decision unrepeatable
 * within one ledger and derives every downstream id from the ORDER id;
 * `release-service.ts` refuses a packet unless a real approval row authorizes it;
 * and the store's commit turns all of that into one durable write. A dispatch
 * that fails afterwards is recorded as a failed attempt and changes none of it.
 */

export interface EarlyAccessAdminRouteDependencies {
  readonly store: EarlyAccessCommerceStore;
  readonly admins: EarlyAccessAdminDirectory;
  readonly audit: EarlyAccessAuditSink;
  /** Epoch milliseconds. */
  readonly now: () => number;
}

type AdminCaller =
  | Readonly<{ ok: true; actor: EarlyAccessAdminActor; nowMs: number }>
  | Readonly<{ ok: false }>;

/**
 * Resolve the acting admin.
 *
 * The email arrives from `requireSupabaseAdmin`, which has already verified the
 * JWT: it is never read from a body or a header here. Being an admin at all is
 * still not enough, because only a founder or an operations admin may accept
 * money, and that second question is what this answers.
 */
async function resolveAdmin(
  deps: EarlyAccessAdminRouteDependencies,
  adminEmail: unknown,
  response: ResponsePort,
): Promise<AdminCaller> {
  const nowMs = readInstant(deps.now);
  if (nowMs === null) {
    fail(response, 503, "UNAVAILABLE");
    return Object.freeze({ ok: false as const });
  }
  if (typeof adminEmail !== "string" || adminEmail.trim().length === 0) {
    fail(response, 403, "ACTOR_NOT_PERMITTED");
    return Object.freeze({ ok: false as const });
  }
  const actor = await deps.admins.resolve(adminEmail);
  if (actor === null || !isSafeIdentifier(actor.actorId)) {
    fail(response, 403, "ACTOR_NOT_PERMITTED");
    return Object.freeze({ ok: false as const });
  }
  return Object.freeze({ ok: true as const, actor, nowMs });
}

function unavailable(response: ResponsePort): void {
  try {
    fail(response, 503, "UNAVAILABLE");
  } catch {
    // The response port itself is broken.
  }
}

async function recordAudit(
  deps: EarlyAccessAdminRouteDependencies,
  event: Parameters<EarlyAccessAuditSink["record"]>[0],
): Promise<void> {
  try {
    await deps.audit.record(event);
  } catch {
    // A broken sink must not change an outcome that is already durable.
  }
}

// ---------------------------------------------------------------------------
// GET the review queue
// ---------------------------------------------------------------------------

/**
 * What an operator needs to decide, and nothing they do not.
 *
 * The queue carries the amount owed, the proof that is CURRENT, and how long the
 * order has been waiting. It does not carry the shipping address, the affiliate,
 * or the storage handles of superseded proofs: the decision is about whether a
 * payment arrived, and a queue is the widest-angle view of the order book that
 * exists.
 */
export function createEarlyAccessPaymentQueueRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (request: { adminEmail?: unknown }, response: ResponsePort): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;

      const waiting = await deps.store.awaitingReview();
      const items = await Promise.all(
        waiting.map(async (placement) => {
          const proofs = await deps.store.proofs(placement.orderNumber);
          const current = proofs.length === 0 ? null : proofs[proofs.length - 1];
          return {
            orderNumber: placement.orderNumber,
            placedAt: placement.placedAt,
            paymentState: placement.paymentState,
            payableTotalCents: placement.order.money.payableTotalCents,
            currency: placement.order.money.currency,
            sku: placement.order.order.line.sku,
            quantity: placement.order.order.line.quantity,
            paymentReference: placement.invoice.paymentReference,
            proofCount: proofs.length,
            currentProof:
              current === undefined || current === null
                ? null
                : {
                    // The reference the admin must ECHO back on confirm, which is
                    // what proves they decided against the proof that is current
                    // rather than one the customer already replaced.
                    reviewedProofRef: current.record.storageRef,
                    filename: current.record.filename,
                    contentType: current.record.contentType,
                    byteSize: current.record.byteSize,
                    sha256: current.sha256,
                    method: current.record.method,
                    submittedAt: current.record.uploadedAt,
                  },
          };
        }),
      );

      send(response, 200, { ok: true, items });
    } catch {
      unavailable(response);
    }
  };
}

// ---------------------------------------------------------------------------
// POST confirm payment received and release order
// ---------------------------------------------------------------------------

const CONFIRM_BODY_KEYS = [
  "idempotencyKey",
  "reviewedProofRef",
  "amountConfirmedCents",
  "currency",
  "externalTransactionId",
  "method",
  "reason",
] as const;

function settlementView(settlement: EarlyAccessSettlement): Record<string, unknown> {
  return {
    orderNumber: settlement.orderNumber,
    settledAt: settlement.settledAt,
    payment: {
      state: "payment_verified",
      verifiedAt: settlement.verification.decidedAt,
      verifiedByActorId: settlement.verification.actorId,
      verifiedByActorRole: settlement.verification.actorRole,
    },
    receipt: { ...settlement.receipt },
    ledgerEntry: { ...settlement.ledgerEntry },
    supplierOrder: { ...settlement.supplierOrder },
    outbox: { ...settlement.outbox },
    commission: settlement.commission === null ? null : { ...settlement.commission },
  };
}

/**
 * Confirm that a manual payment arrived, and release the order.
 *
 * The whole point of the route is the word "and". Verified payment, paid order,
 * ledger row, receipt, supplier order, outbox row, commission hold, and the audit
 * event are one fact. Two callers pressing the button at the same moment converge
 * on ONE of them: the loser reads the winner's settlement and answers with it, so
 * both humans see the same receipt id and one box ships.
 */
export function createEarlyAccessConfirmPaymentRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
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

      const body = project(request?.body, CONFIRM_BODY_KEYS);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }
      if (!isSafeIdentifier(body.externalTransactionId)) {
        fail(response, 400, "REQUEST_INVALID", { field: "externalTransactionId" });
        return;
      }
      if (body.method !== null && !isEarlyAccessPaymentOptionCode(body.method)) {
        fail(response, 400, "METHOD_UNSUPPORTED");
        return;
      }
      if (!isBoundedText(body.reason, 500) || body.reason.trim().length < 8) {
        fail(response, 400, "REASON_INSUFFICIENT");
        return;
      }

      // THE AMOUNT THE HUMAN IS CONFIRMING IS THE AMOUNT THE CUSTOMER OWED. Not
      // the pre-discount subtotal, and not a number they typed freely: the
      // confirmation must be of the payable total on the invoice the customer
      // was actually sent, or the ledger records a payment for something else.
      if (
        body.amountConfirmedCents !== placement.order.money.payableTotalCents ||
        body.currency !== placement.order.money.currency
      ) {
        fail(response, 422, "PAYABLE_TOTAL_INVALID", {
          payableTotalCents: placement.order.money.payableTotalCents,
          currency: placement.order.money.currency,
        });
        return;
      }

      const settled = await deps.store.settlement(orderNumber);
      if (settled !== null) {
        // Already confirmed. Report the original rather than deciding again, so a
        // second press cannot produce a second receipt or a second supplier order.
        send(response, 200, { ok: true, applied: false, settlement: settlementView(settled) });
        return;
      }

      const [proofs, decisions] = await Promise.all([
        deps.store.proofs(orderNumber),
        deps.store.verifications(orderNumber),
      ]);

      const decided = decideManualPayment({
        order: placement.order.order,
        proofs: proofs.map((intake) => intake.record),
        decisions: [...decisions],
        actor: { id: caller.actor.actorId, role: caller.actor.role },
        decision: "approve",
        reason: body.reason,
        reviewedProofRef: body.reviewedProofRef,
        // The amount the human confirmed is the amount the customer OWED: the
        // payable total on the money snapshot, never the pre-discount subtotal.
        // The 422 above already refused anything else, so this is that same
        // number rather than a second reading of it. The domain's money gate
        // classifies against `order.money.payableTotalCents`, so passing the
        // subtotal here reads a discounted order as an OVERPAYMENT and refuses a
        // correct payment. The translation this replaced did exactly that.
        amountVerifiedCents: placement.order.money.payableTotalCents,
        currency: placement.order.money.currency,
        idempotencyKey: body.idempotencyKey,
        now,
        ...(body.method === undefined || body.method === null ? {} : { method: body.method }),
      });
      if (!decided.ok) {
        confirmRefusal(response, decided.code);
        return;
      }
      const verification = decided.value.verification;
      const verifiedOrder = verification.verifiedOrder;
      if (decided.value.append === null || verifiedOrder === null) {
        // A replay or a no-op with nothing stored behind it. The store is the
        // authority on what exists, and it says nothing does.
        fail(response, 409, "VERIFICATION_INCONSISTENT");
        return;
      }
      const entry = decided.value.append;

      // THE SUPPLIER ORDER. `describeSupplierRelease` re-derives the authorizing
      // approval from the trail rather than trusting the projection, so a packet
      // exists only where a real approval row does.
      const release = describeSupplierRelease({
        verifiedOrder,
        decisions: [entry],
        supplier: {
          supplierId: placement.supplier.supplierId,
          supplierSku: placement.supplier.supplierSku,
          recipient: placement.shipTo,
        },
        actorId: caller.actor.actorId,
        releasedAt: now,
      });
      if (!release.ok) {
        fail(response, 409, "SUPPLIER_RELEASE_REFUSED", { reason: release.code });
        return;
      }

      // THE COMMISSION. An attribution that cannot be credited is recorded as
      // absent, not as a failure: the money has arrived, and refusing to record
      // that because an affiliate credit did not compute would be the wrong
      // failure to choose.
      let commission = null;
      let commissionRefusal: string | null = null;
      if (placement.attribution !== null) {
        const hold = buildCommissionHold(verifiedOrder, { ...placement.attribution });
        if (hold.ok) commission = hold.value;
        else commissionRefusal = hold.code;
      }

      const settlement: EarlyAccessSettlement = Object.freeze({
        orderNumber,
        verification: entry,
        verifiedOrder,
        receipt: Object.freeze({
          // Derived from the order id, so one order can only ever carry one.
          receiptId: receiptIntentIdFor(orderNumber),
          orderNumber,
          payableTotalCents: placement.order.money.payableTotalCents,
          currency: placement.order.money.currency,
          issuedAt: now,
          issuedByActorId: caller.actor.actorId,
        }),
        ledgerEntry: Object.freeze({
          entryId: verificationUniqueKeyFor(orderNumber),
          orderNumber,
          amountCents: placement.order.money.payableTotalCents,
          currency: placement.order.money.currency,
          externalTransactionId: body.externalTransactionId,
          recordedAt: now,
          recordedByActorId: caller.actor.actorId,
        }),
        supplierOrder: release.value.record,
        supplierPacket: release.value.packet,
        outbox: Object.freeze({
          outboxId: `early-access-payment-confirmed:${orderNumber}`,
          orderNumber,
          kind: "early_access_payment_confirmed" as const,
          queuedAt: now,
        }),
        commission,
        settledAt: now,
      });

      const committed = await deps.store.commitSettlement(settlement);
      if (!committed.committed) {
        if (committed.reason === "already_settled") {
          // The concurrent press. Both callers answer with the same settlement,
          // which is what "converge on one final result" has to mean at the wire.
          send(response, 200, {
            ok: true,
            applied: false,
            settlement: settlementView(committed.settlement),
          });
          return;
        }
        if (committed.reason === "transaction_id_used") {
          // One arrival of money pays one order. Nothing was written.
          fail(response, 409, "TRANSACTION_ALREADY_USED");
          return;
        }
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }

      await recordAudit(deps, {
        event: "early_access.payment.confirmed",
        orderNumber,
        actor: caller.actor.actorId,
        at: now,
        detail: {
          role: caller.actor.role,
          payableTotalCents: placement.order.money.payableTotalCents,
          currency: placement.order.money.currency,
          reviewedProofId: entry.reviewedProofId,
          externalTransactionId: body.externalTransactionId,
          receiptId: settlement.receipt.receiptId,
          supplierReleaseId: settlement.supplierOrder.releaseId,
          commissionHeld: commission !== null,
          commissionRefusal,
        },
      });

      send(response, 201, { ok: true, applied: true, settlement: settlementView(settlement) });
    } catch {
      unavailable(response);
    }
  };
}

/** Surface a verification refusal with the action the operator must take. */
function confirmRefusal(response: ResponsePort, code: string): void {
  if (code === "proof_missing") {
    fail(response, 409, "PROOF_REQUIRED");
    return;
  }
  if (code === "proof_ref_mismatch") {
    fail(response, 409, "PROOF_REF_STALE");
    return;
  }
  if (code === "amount_mismatch" || code === "currency_mismatch") {
    fail(response, 422, "PAYABLE_TOTAL_INVALID");
    return;
  }
  if (code === "forbidden") {
    fail(response, 403, "ACTOR_NOT_PERMITTED");
    return;
  }
  if (code === "order_already_verified" || code === "idempotency_conflict") {
    fail(response, 409, "ALREADY_DECIDED");
    return;
  }
  if (code === "payment_rejected_needs_new_proof") {
    fail(response, 409, "PAYMENT_REJECTED_NEEDS_NEW_PROOF");
    return;
  }
  if (code === "idempotency_key_invalid" || code === "reason_insufficient") {
    fail(response, 400, "REQUEST_INVALID", { reason: code });
    return;
  }
  fail(response, 400, "REQUEST_INVALID", { reason: code });
}

// ---------------------------------------------------------------------------
// Supplier release and tracking
// ---------------------------------------------------------------------------

type SettledOrder = Readonly<{ placement: EarlyAccessPlacement; settlement: EarlyAccessSettlement }>;

/**
 * The order, its settlement, or nothing.
 *
 * THIS IS THE ORDERING GATE. Every supplier route below goes through it, so
 * there is exactly one place where "has a human confirmed the money" is asked,
 * and no dispatch step can be reached by an order that has not been through it.
 */
async function settledOrder(
  deps: EarlyAccessAdminRouteDependencies,
  orderNumber: unknown,
  response: ResponsePort,
): Promise<SettledOrder | null> {
  if (!isEarlyAccessOrderNumber(orderNumber)) {
    fail(response, 404, "ORDER_NOT_FOUND");
    return null;
  }
  const placement = await deps.store.placementByOrderNumber(orderNumber);
  if (placement === null) {
    fail(response, 404, "ORDER_NOT_FOUND");
    return null;
  }
  const settlement = await deps.store.settlement(orderNumber);
  if (settlement === null) {
    fail(response, 409, "PAYMENT_NOT_VERIFIED");
    return null;
  }
  return Object.freeze({ placement, settlement });
}

function dispatchView(
  settlement: EarlyAccessSettlement,
  dispatch: Awaited<ReturnType<EarlyAccessCommerceStore["dispatch"]>>,
): Record<string, unknown> {
  return {
    supplierOrder: { ...settlement.supplierOrder },
    events: dispatch.events.map((event) => ({ ...event })),
    tracking: dispatch.tracking.map((entry) => ({ ...entry })),
    fulfillment: dispatch.fulfillment === null ? null : { ...dispatch.fulfillment },
  };
}

/**
 * Read the supplier order and the packet to send.
 *
 * The packet is returned here because the manual fallback is a first-class path:
 * an operator reads it off this response and sends it to the supplier by hand.
 * It is the only response in this file that carries the shipping address, which
 * is exactly the field a supplier needs and nobody else does.
 */
export function createEarlyAccessSupplierOrderReadRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;

      const dispatch = await deps.store.dispatch(found.settlement.orderNumber);
      send(response, 200, {
        ok: true,
        packet: { ...found.settlement.supplierPacket },
        ...dispatchView(found.settlement, dispatch),
      });
    } catch {
      unavailable(response);
    }
  };
}

/**
 * Ensure the supplier order exists, and never create a second one.
 *
 * The confirmation already created it, so this is the retry an operator reaches
 * for when a dispatch failed and they are not sure what state things are in. It
 * answers with the existing supplier order every time. A second release would be
 * a duplicate order to the supplier, which is a second box against one payment.
 */
export function createEarlyAccessSupplierOrderEnsureRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;

      send(response, 200, {
        ok: true,
        created: false,
        supplierOrder: { ...found.settlement.supplierOrder },
        packet: { ...found.settlement.supplierPacket },
      });
    } catch {
      unavailable(response);
    }
  };
}

const NOTIFICATION_BODY_KEYS = ["channel", "recipient", "reference", "outcome"] as const;
const ACKNOWLEDGEMENT_BODY_KEYS = ["reference", "acknowledgedBy"] as const;
const PACKING_BODY_KEYS = ["reference"] as const;

const DISPATCH_CHANNELS = ["email", "portal", "phone", "manual"] as const;

/**
 * Record one attempt to get the packet to the supplier.
 *
 * A `failed` outcome is a normal, expected value. It is recorded and it changes
 * NOTHING about the payment: the money arrived, the customer is owed a box, and
 * a bounced email is a reason to try again rather than a reason to un-take
 * somebody's money. There is deliberately no branch here that touches the
 * payment state or the supplier order.
 */
export function createEarlyAccessSupplierNotificationRoute(
  deps: EarlyAccessAdminRouteDependencies,
) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;

      const body = project(request?.body, NOTIFICATION_BODY_KEYS);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }
      if (
        typeof body.channel !== "string" ||
        !(DISPATCH_CHANNELS as readonly string[]).includes(body.channel)
      ) {
        fail(response, 400, "REQUEST_INVALID", { field: "channel" });
        return;
      }
      if (!isBoundedText(body.recipient, 200)) {
        fail(response, 400, "REQUEST_INVALID", { field: "recipient" });
        return;
      }
      if (body.outcome !== "sent" && body.outcome !== "failed") {
        fail(response, 400, "REQUEST_INVALID", { field: "outcome" });
        return;
      }
      if (body.reference !== undefined && body.reference !== null && !isBoundedText(body.reference, 200)) {
        fail(response, 400, "REQUEST_INVALID", { field: "reference" });
        return;
      }

      await appendDispatchEvent(deps, response, found, caller.actor, stampOf(caller.nowMs), {
        kind: "notification_attempt",
        channel: body.channel,
        recipient: body.recipient,
        reference: body.reference === undefined || body.reference === null ? null : (body.reference as string),
        outcome: body.outcome,
      });
    } catch {
      unavailable(response);
    }
  };
}

/** The supplier said they have it. Recorded, named, and timestamped. */
export function createEarlyAccessSupplierAcknowledgementRoute(
  deps: EarlyAccessAdminRouteDependencies,
) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;

      const body = project(request?.body, ACKNOWLEDGEMENT_BODY_KEYS);
      if (body === null || !isBoundedText(body.reference, 200) || !isBoundedText(body.acknowledgedBy, 200)) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }

      await appendDispatchEvent(deps, response, found, caller.actor, stampOf(caller.nowMs), {
        kind: "acknowledgement",
        channel: null,
        recipient: body.acknowledgedBy,
        reference: body.reference,
        outcome: "recorded",
      });
    } catch {
      unavailable(response);
    }
  };
}

/** The unit is packed. Still not shipped, and still no tracking number. */
export function createEarlyAccessSupplierPackingRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;

      const body = project(request?.body, PACKING_BODY_KEYS);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }
      if (body.reference !== undefined && body.reference !== null && !isBoundedText(body.reference, 200)) {
        fail(response, 400, "REQUEST_INVALID", { field: "reference" });
        return;
      }

      await appendDispatchEvent(deps, response, found, caller.actor, stampOf(caller.nowMs), {
        kind: "packing",
        channel: null,
        recipient: null,
        reference: body.reference === undefined || body.reference === null ? null : (body.reference as string),
        outcome: "recorded",
      });
    } catch {
      unavailable(response);
    }
  };
}

async function appendDispatchEvent(
  deps: EarlyAccessAdminRouteDependencies,
  response: ResponsePort,
  found: SettledOrder,
  actor: EarlyAccessAdminActor,
  at: string,
  fields: Readonly<{
    kind: EarlyAccessDispatchEvent["kind"];
    channel: string | null;
    recipient: string | null;
    reference: string | null;
    outcome: EarlyAccessDispatchEvent["outcome"];
  }>,
): Promise<void> {
  const dispatch = await deps.store.dispatch(found.settlement.orderNumber);
  const event: EarlyAccessDispatchEvent = Object.freeze({
    orderNumber: found.settlement.orderNumber,
    kind: fields.kind,
    channel: fields.channel,
    recipient: fields.recipient,
    reference: fields.reference,
    outcome: fields.outcome,
    actorId: actor.actorId,
    at,
    sequence: dispatch.events.length + 1,
  });
  const committed = await deps.store.commitDispatchEvent(event);
  if (!committed.committed) {
    fail(response, 409, "DISPATCH_TRAIL_MOVED");
    return;
  }

  await recordAudit(deps, {
    event: `early_access.supplier.${fields.kind}`,
    orderNumber: found.settlement.orderNumber,
    actor: actor.actorId,
    at,
    detail: { channel: fields.channel, outcome: fields.outcome, reference: fields.reference },
  });

  const after = await deps.store.dispatch(found.settlement.orderNumber);
  send(response, 201, {
    ok: true,
    // Stated explicitly because it is the property that matters: a failed
    // dispatch does not un-take the money.
    paymentState: "payment_verified",
    ...dispatchView(found.settlement, after),
  });
}

const TRACKING_BODY_KEYS = ["carrier", "trackingNumber"] as const;

/** Record a carrier and a tracking number against the one supplier release. */
export function createEarlyAccessSupplierTrackingRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;
      const now = stampOf(caller.nowMs);

      const body = project(request?.body, TRACKING_BODY_KEYS);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }

      const dispatch = await deps.store.dispatch(found.settlement.orderNumber);
      const described = describeTrackingUpdate({
        release: { ...found.settlement.supplierOrder },
        tracking: dispatch.tracking.map((entry) => ({ ...entry })),
        carrier: body.carrier,
        trackingNumber: body.trackingNumber,
        actorId: caller.actor.actorId,
        recordedAt: now,
      });
      if (!described.ok) {
        fail(response, 400, "REQUEST_INVALID", { reason: described.code });
        return;
      }

      const committed = await deps.store.commitTracking(described.value);
      if (!committed.committed) {
        fail(response, 409, "DISPATCH_TRAIL_MOVED");
        return;
      }

      await recordAudit(deps, {
        event: "early_access.supplier.tracking",
        orderNumber: found.settlement.orderNumber,
        actor: caller.actor.actorId,
        at: now,
        detail: { carrier: described.value.carrier, sequence: described.value.sequence },
      });

      const after = await deps.store.dispatch(found.settlement.orderNumber);
      send(response, 201, {
        ok: true,
        paymentState: "payment_verified",
        ...dispatchView(found.settlement, after),
      });
    } catch {
      unavailable(response);
    }
  };
}

/**
 * Mark the order shipped.
 *
 * `describeFulfillment` can also build a commission hold, and it is deliberately
 * given NO attribution here: the hold was created once at confirmation, and
 * creating a second one now would credit an affiliate twice for one payment.
 * Fulfilling twice returns the original and writes nothing, at both layers.
 */
export function createEarlyAccessSupplierShippedRoute(deps: EarlyAccessAdminRouteDependencies) {
  return async (
    request: { adminEmail?: unknown; orderNumber?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveAdmin(deps, request?.adminEmail, response);
      if (!caller.ok) return;
      const found = await settledOrder(deps, request?.orderNumber, response);
      if (found === null) return;
      const now = stampOf(caller.nowMs);

      const dispatch = await deps.store.dispatch(found.settlement.orderNumber);
      const described = describeFulfillment({
        verifiedOrder: { ...found.settlement.verifiedOrder },
        release: { ...found.settlement.supplierOrder },
        tracking: dispatch.tracking.map((entry) => ({ ...entry })),
        fulfillments: dispatch.fulfillment === null ? [] : [{ ...dispatch.fulfillment }],
        attribution: null,
        actorId: caller.actor.actorId,
        fulfilledAt: now,
      });
      if (!described.ok) {
        if (described.code === "tracking_missing") {
          fail(response, 409, "TRACKING_REQUIRED");
          return;
        }
        fail(response, 400, "REQUEST_INVALID", { reason: described.code });
        return;
      }
      if (described.value.append === null) {
        send(response, 200, {
          ok: true,
          shipped: false,
          paymentState: "payment_verified",
          ...dispatchView(found.settlement, dispatch),
        });
        return;
      }

      const committed = await deps.store.commitFulfillment(described.value.append);
      if (!committed.committed) {
        // Another caller shipped it first. Report theirs; write nothing.
        const after = await deps.store.dispatch(found.settlement.orderNumber);
        send(response, 200, {
          ok: true,
          shipped: false,
          paymentState: "payment_verified",
          ...dispatchView(found.settlement, after),
        });
        return;
      }

      await recordAudit(deps, {
        event: "early_access.supplier.shipped",
        orderNumber: found.settlement.orderNumber,
        actor: caller.actor.actorId,
        at: now,
        detail: { trackingNumber: described.value.record.trackingNumber },
      });

      const after = await deps.store.dispatch(found.settlement.orderNumber);
      send(response, 201, {
        ok: true,
        shipped: true,
        paymentState: "payment_verified",
        ...dispatchView(found.settlement, after),
      });
    } catch {
      unavailable(response);
    }
  };
}
