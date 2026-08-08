import type { EarlyAccessCartCurrency } from "@shared/research/early-access-cart";
import { isCartCheckoutNumber } from "./model";
import {
  recordEarlyAccessCartExternalProof,
  settleEarlyAccessCart,
  type EarlyAccessCartSettlementDeps,
} from "./settlement";
import type { CartResponsePort } from "./routes";

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
    const currency: EarlyAccessCartCurrency | "" = body.verifiedCurrency === "USD" ? "USD" : "";
    const nowMs = deps.now();
    const result = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: request.cartCheckoutNumber,
      evidenceRef: typeof body.evidenceRef === "string" ? body.evidenceRef : "",
      externalTransactionId:
        typeof body.externalTransactionId === "string" ? body.externalTransactionId : "",
      verifiedAmountCents:
        typeof body.verifiedAmountCents === "number" ? body.verifiedAmountCents : Number.NaN,
      verifiedCurrency: currency as "USD",
      actorId: request.actor.id,
      at: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : "",
    });

    if (result.committed) {
      response.status(200).json({
        ok: true,
        replayed: false,
        paid: true,
        receiptIssued: true,
        supplierReleased: true,
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
        settlement: result.settlement,
      });
      return;
    }
    const status =
      result.reason === "checkout_unknown"
        ? 404
        : result.reason === "transaction_id_used" || result.reason === "amount_mismatch"
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
