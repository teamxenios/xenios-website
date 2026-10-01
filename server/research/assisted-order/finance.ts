import { AssistedOrderValidationError, isAssistedOrderStatus, type AssistedOrderStatus } from "../../../shared/research/assisted-order/contract";
import { sha256AssistedOrderHasher } from "./defaults";
import type { AssistedOrderViewer } from "./ports";
import {
  AssistedOrderAuthorizationError,
  AssistedOrderConflictError,
  AssistedOrderNotFoundError,
} from "./service";
import type { SupabaseRpcClient } from "./supabase-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE = /^XRR-[0-9]{8}-[0-9A-F]{10}$/;

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AssistedOrderValidationError(field, `A valid ${field} is required.`);
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new AssistedOrderValidationError(field, `A valid ${field} is required.`);
  }
  return value.toLowerCase();
}

function string(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new AssistedOrderValidationError(field, `A valid ${field} is required.`);
  }
  return value.trim();
}

function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new AssistedOrderValidationError(field, `A positive ${field} is required.`);
  }
  return value as number;
}

function adminActor(viewer: AssistedOrderViewer): { id: string; label: string } {
  if (!viewer.capabilities.has("assisted_orders:manage") || viewer.actorType !== "admin" ||
      !viewer.authUserId || !UUID.test(viewer.authUserId)) {
    throw new AssistedOrderAuthorizationError();
  }
  return { id: viewer.authUserId.toLowerCase(), label: string(viewer.actorLabel, "admin actor", 200) };
}

function customerAuthority(viewer: AssistedOrderViewer, rawStatusToken?: string) {
  if (rawStatusToken !== undefined && (typeof rawStatusToken !== "string" || rawStatusToken.length > 256)) {
    throw new AssistedOrderValidationError("statusToken", "A valid status credential is required.");
  }
  return {
    p_member_id: viewer.actorType === "member" ? viewer.memberId : null,
    p_early_access_session_hash: viewer.earlyAccessSessionHash,
    p_status_token_hash: rawStatusToken ? sha256AssistedOrderHasher.hash(rawStatusToken) : null,
  };
}

function rpcFailure(operation: string, error: NonNullable<Awaited<ReturnType<SupabaseRpcClient["rpc"]>>["error"]>): never {
  if (error.code === "P0001") {
    if (error.details === "ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED") {
      throw new AssistedOrderAuthorizationError();
    }
    throw new AssistedOrderConflictError(
      error.details === "ASSISTED_ORDER_QUOTE_STALE" ? "quote_stale" :
      error.details === "ASSISTED_ORDER_PAYMENT_AMOUNT_CURRENCY_MISMATCH" ? "payment_mismatch" :
      error.details === "ASSISTED_ORDER_PAYMENT_REFERENCE_REUSED" ? "payment_reference_reused" :
      error.details === "ASSISTED_ORDER_PAYMENT_EVIDENCE_REUSED" ? "payment_evidence_reused" :
      "financial_action_refused",
      "The financial action was refused. Refresh the request and review the recorded evidence.",
    );
  }
  if (error.code === "23505") {
    throw new AssistedOrderConflictError("financial_replay_conflict", "This financial reference has already been used.");
  }
  throw new Error(`${operation} is unavailable`);
}

/**
 * A manual ledger adapter must independently resolve an immutable, authorized
 * bank/payment record. A browser string or screenshot is never evidence.
 */
export type AssistedOrderManualEvidenceAuthority = Readonly<{
  verify(input: Readonly<{
    evidenceRef: string;
    requestId: string;
    quoteId: string;
    paymentReference: string;
    observedAmountCents: number;
    observedCurrency: string;
    verifierAuthUserId: string;
  }>): Promise<Readonly<{ observedAt: string }> | null>;
}>;

/** Immutable SQL receipt, not a browser-submitted paid assertion. */
export type AssistedOrderPaymentVerificationReceipt = Readonly<{
  verificationId: string;
  requestId: string;
  state: AssistedOrderStatus;
  verifiedAt: string;
  verifiedBy: string;
  replayed: boolean;
}>;

export class AssistedOrderFinanceService {
  public constructor(
    private readonly rpc: SupabaseRpcClient,
    private readonly manualEvidence: AssistedOrderManualEvidenceAuthority | null,
  ) {}

  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.rpc.rpc(name, args);
    if (response.error) rpcFailure(name, response.error);
    return response.data;
  }

  public async issueQuote(viewer: AssistedOrderViewer, requestId: string, input: unknown): Promise<unknown> {
    const actor = adminActor(viewer);
    const body = object(input, "quote");
    if (!Array.isArray(body.lineDecisions) || body.lineDecisions.length === 0 || body.lineDecisions.length > 100) {
      throw new AssistedOrderValidationError("lineDecisions", "Quote decisions are required for each line.");
    }
    const decisions = body.lineDecisions.map((entry) => {
      const line = object(entry, "lineDecision");
      const decision: Record<string, unknown> = { lineId: uuid(line.lineId, "lineId") };
      if (line.unitPriceCents !== undefined) decision.unitPriceCents = integer(line.unitPriceCents, "unitPriceCents");
      if (line.pricingBasis !== undefined) decision.pricingBasis = string(line.pricingBasis, "pricingBasis", 1000);
      return decision;
    });
    const validUntil = string(body.validUntil, "validUntil", 40);
    if (!Number.isFinite(Date.parse(validUntil))) {
      throw new AssistedOrderValidationError("validUntil", "A valid quote expiry is required.");
    }
    return this.call("research_assisted_order_quote_issue", {
      p_request_id: uuid(requestId, "requestId"),
      p_line_decisions: decisions,
      p_valid_until: validUntil,
      p_actor_id: actor.label,
      p_customer_note: body.customerNote === undefined ? null : string(body.customerNote, "customerNote", 1000),
    });
  }

  public async getQuote(viewer: AssistedOrderViewer, publicReference: string, rawStatusToken?: string): Promise<Record<string, unknown>> {
    if (!REFERENCE.test(publicReference)) throw new AssistedOrderNotFoundError();
    const result = await this.call("research_assisted_order_quote_get", {
      p_public_reference: publicReference,
      ...customerAuthority(viewer, rawStatusToken),
    });
    if (result === null) throw new AssistedOrderNotFoundError();
    return object(result, "quote projection");
  }

  public async acceptQuote(viewer: AssistedOrderViewer, publicReference: string, input: unknown, rawStatusToken?: string): Promise<unknown> {
    const body = object(input, "quote acceptance");
    const quoteId = uuid(body.quoteId, "quoteId");
    const version = integer(body.version, "version");
    const expectedTotalCents = integer(body.expectedTotalCents, "expectedTotalCents");
    const projected = await this.getQuote(viewer, publicReference, rawStatusToken);
    if (projected.quoteId !== quoteId) throw new AssistedOrderNotFoundError();
    if (projected.version !== version || projected.totalCents !== expectedTotalCents) {
      throw new AssistedOrderConflictError("quote_stale", "The quote changed. Refresh before accepting it.");
    }
    return this.call("research_assisted_order_quote_accept", {
      p_quote_id: quoteId,
      p_version: version,
      p_expected_total_cents: expectedTotalCents,
      ...customerAuthority(viewer, rawStatusToken),
    });
  }

  public async observeManual(viewer: AssistedOrderViewer, requestId: string, input: unknown): Promise<unknown> {
    const actor = adminActor(viewer);
    if (!this.manualEvidence) {
      throw new AssistedOrderConflictError("manual_evidence_unavailable", "Independent manual payment evidence is not configured.");
    }
    const body = object(input, "payment observation");
    const request = uuid(requestId, "requestId");
    const quoteId = uuid(body.quoteId, "quoteId");
    const amount = integer(body.observedAmountCents, "observedAmountCents");
    const currency = string(body.observedCurrency, "observedCurrency", 3);
    const reference = string(body.paymentReference, "paymentReference", 80);
    const evidenceRef = string(body.sourceEvidenceRef, "sourceEvidenceRef", 160);
    const independentlyVerified = await this.manualEvidence.verify({
      evidenceRef, requestId: request, quoteId, paymentReference: reference,
      observedAmountCents: amount, observedCurrency: currency,
      verifierAuthUserId: actor.id,
    });
    if (!independentlyVerified || !Number.isFinite(Date.parse(independentlyVerified.observedAt))) {
      throw new AssistedOrderConflictError("manual_evidence_unverified", "Independent payment evidence did not match this request.");
    }
    if (body.supersedesObservationId !== undefined) {
      const corrected = await this.call("research_assisted_order_payment_correct_manual", {
        p_request_id: request,
        p_observation_id: uuid(body.supersedesObservationId, "supersedesObservationId"),
        p_actor_auth_user_id: actor.id,
        p_quote_id: quoteId,
        p_payment_reference: reference,
        p_observed_amount_cents: amount,
        p_observed_currency: currency,
        p_source_evidence_ref: evidenceRef,
        p_observed_at: independentlyVerified.observedAt,
        p_reason: string(body.correctionReason, "correctionReason", 1000),
      });
      if (corrected === null) throw new AssistedOrderNotFoundError();
      return corrected;
    }
    return this.call("research_assisted_order_payment_observe", {
      p_request_id: request,
      p_quote_id: quoteId,
      p_method: "manual",
      p_observed_amount_cents: amount,
      p_observed_currency: currency,
      p_payment_reference: reference,
      p_source_evidence_ref: evidenceRef,
      p_observed_at: independentlyVerified.observedAt,
      p_actor_auth_user_id: actor.id,
      p_provider_name: null,
      p_provider_event_id: null,
      p_provider_payment_id: null,
    });
  }

  public async verifyManual(viewer: AssistedOrderViewer, requestId: string, observationId: string): Promise<AssistedOrderPaymentVerificationReceipt> {
    const actor = adminActor(viewer);
    if (!this.manualEvidence) {
      throw new AssistedOrderConflictError("manual_evidence_unavailable", "Independent manual payment evidence is not configured.");
    }
    const request = uuid(requestId, "requestId");
    const result = await this.call("research_assisted_order_payment_verify_bound", {
      p_request_id: request,
      p_observation_id: uuid(observationId, "observationId"),
      p_verifier_auth_user_id: actor.id,
    });
    if (result === null) throw new AssistedOrderNotFoundError();
    // Fail closed on an incomplete/misbound backend receipt. Downstream effects
    // must never turn a typed id, arbitrary RPC object or request body into fact.
    if (typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Payment verification receipt is unavailable");
    }
    const receipt = result as Record<string, unknown>;
    if (typeof receipt.verificationId !== "string" || !UUID.test(receipt.verificationId) ||
        receipt.requestId !== request || !isAssistedOrderStatus(receipt.state) || typeof receipt.replayed !== "boolean" ||
        (!receipt.replayed && receipt.state !== "paid") ||
        typeof receipt.verifiedAt !== "string" || !Number.isFinite(Date.parse(receipt.verifiedAt)) ||
        typeof receipt.verifiedBy !== "string" || !receipt.verifiedBy || receipt.verifiedBy.length > 512 ||
        receipt.verifiedBy !== receipt.verifiedBy.trim() || /[\u0000-\u001f\u007f]/u.test(receipt.verifiedBy)) {
      throw new Error("Payment verification receipt is unavailable");
    }
    return Object.freeze({
      verificationId: receipt.verificationId.toLowerCase(),
      requestId: request,
      state: receipt.state,
      verifiedAt: new Date(receipt.verifiedAt).toISOString(),
      verifiedBy: receipt.verifiedBy,
      replayed: receipt.replayed,
    });
  }
}
