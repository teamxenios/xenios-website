import { isCartCheckoutNumber } from "./model";
import {
  recordEarlyAccessCartExternalProof,
  settleEarlyAccessCart,
  type EarlyAccessCartSettlementDeps,
} from "./settlement";
import type { CartResponsePort } from "./routes";
import {
  NO_CART_NOTIFICATIONS,
  notifyQuietly,
  type EarlyAccessCartNotifier,
} from "./notifications-port";
import type { EarlyAccessCartCheckoutStore } from "./ports";

export type CartAdminRequest = Readonly<{
  cartCheckoutNumber?: unknown;
  body?: unknown;
  actor?: Readonly<{ id: string }> | null;
}>;

function privateHeaders(response: CartResponsePort): void {
  response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
  response.setHeader?.("Pragma", "no-cache");
  response.setHeader?.("X-Content-Type-Options", "nosniff");
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A named admin records metadata for proof received off platform. No bytes are
 * accepted, no storage object is reserved, and the response cannot claim that
 * a file was uploaded to Xenios.
 */
export function createEarlyAccessCartExternalProofAdminRoute(
  deps: EarlyAccessCartSettlementDeps & Readonly<{ now: () => number }>,
) {
  return async (request: CartAdminRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    if (request.actor === null || request.actor === undefined) {
      response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const body = object(request.body);
    if (body === null) {
      response.status(400).json({ ok: false, code: "REQUEST_INVALID" });
      return;
    }
    const nowMs = deps.now();
    const at = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : "";
    const result = await recordEarlyAccessCartExternalProof(deps, {
      cartCheckoutNumber: request.cartCheckoutNumber,
      sha256: typeof body.sha256 === "string" ? body.sha256 : "",
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: typeof body.byteSize === "number" ? body.byteSize : Number.NaN,
      provenanceNote: typeof body.provenanceNote === "string" ? body.provenanceNote : "",
      actorId: request.actor.id,
      at,
    });
    if (result.committed) {
      response.status(201).json({
        ok: true,
        recorded: true,
        storedOnPlatform: false,
        proof: result.proof,
        paid: false,
        receiptIssued: false,
        supplierReleased: false,
      });
      return;
    }
    const status =
      result.reason === "checkout_unknown"
        ? 404
        : result.reason === "evidence_ref_taken"
          ? 409
          : 400;
    response.status(status).json({
      ok: false,
      code: result.reason,
      storedOnPlatform: false,
      paid: false,
      receiptIssued: false,
      supplierReleased: false,
    });
  };
}

/**
 * The only cart payment-settlement door. It must sit behind the existing named
 * Supabase admin guard. The durable RPC atomically creates the settlement,
 * receipt and every child supplier release exactly once.
 */
export function createEarlyAccessCartConfirmPaymentAdminRoute(
  deps: EarlyAccessCartSettlementDeps &
    Readonly<{
      now: () => number;
      /**
       * Customer mail, fired only on a REAL settlement. The `already_settled`
       * branch below deliberately does not notify: a retry is the same business
       * fact, and the outbox would ignore the duplicate key anyway, but not
       * calling at all makes that intent legible rather than incidental.
       */
      notify?: EarlyAccessCartNotifier;
      /** Reads the checkout the settlement belongs to, for the recipient. */
      checkouts?: EarlyAccessCartCheckoutStore;
    }>,
) {
  return async (request: CartAdminRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    if (request.actor === null || request.actor === undefined) {
      response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const body = object(request.body);
    if (body === null) {
      response.status(400).json({ ok: false, code: "REQUEST_INVALID" });
      return;
    }
    const nowMs = deps.now();
    const result = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: request.cartCheckoutNumber,
      externalTransactionId:
        typeof body.externalTransactionId === "string" ? body.externalTransactionId : "",
      confirmedFundsReceived: body.confirmedFundsReceived === true,
      confirmedAmountAndReference: body.confirmedAmountAndReference === true,
      actorId: request.actor.id,
      at: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : "",
    });

    if (result.committed) {
      // OUTSIDE THE TRANSACTION. The settlement RPC has already committed the
      // settlement, the receipt and every child release atomically; this is a
      // read plus an outbox insert, wrapped so a mail failure cannot undo a
      // payment an operator just verified.
      const settled = result.settlement;
      await notifyQuietly(async () => {
        const checkout = await deps.checkouts?.byCheckoutNumber(settled.cartCheckoutNumber);
        if (!checkout) return;
        await (deps.notify ?? NO_CART_NOTIFICATIONS).settled({
          settlement: settled,
          checkout,
        });
      });
      response.status(200).json({
        ok: true,
        replayed: false,
        paid: true,
        receiptIssued: true,
        supplierReleased: true,
        processingStatus: "processing",
        shipmentStatus: "not_shipped",
        overdue: false,
        paymentVerifiedAt: result.settlement.paymentVerifiedAt ?? result.settlement.settledAt,
        shipByAt: result.settlement.shipByAt ?? null,
        settlement: result.settlement,
      });
      return;
    }
    if (result.reason === "already_settled") {
      response.status(200).json({
        ok: true,
        replayed: true,
        paid: true,
        receiptIssued: true,
        supplierReleased: true,
        processingStatus: "processing",
        shipmentStatus: "not_shipped",
        overdue: false,
        paymentVerifiedAt: result.settlement.paymentVerifiedAt ?? result.settlement.settledAt,
        shipByAt: result.settlement.shipByAt ?? null,
        settlement: result.settlement,
      });
      return;
    }
    const status =
      result.reason === "checkout_unknown"
        ? 404
        : result.reason === "transaction_id_used" ||
            result.reason === "transaction_id_duplicate_canonical" ||
            result.reason === "amount_mismatch" ||
            result.reason === "checkout_superseded" ||
            result.reason === "agreements_not_current" ||
            result.reason === "submission_missing" ||
            result.reason === "submission_unreconciled"
          ? 409
          : 400;
    response.status(status).json({
      ok: false,
      code: result.reason,
      paid: false,
      receiptIssued: false,
      supplierReleased: false,
    });
  };
}
