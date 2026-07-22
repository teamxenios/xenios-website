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
  type ProviderFailureCode,
  type ProviderResult,
} from "@shared/research/capability";
import type { CommissionState, PartnerState } from "@shared/research/distribution";
import { partnerCanBePaid } from "@shared/research/distribution";
import { assertNoSyntheticDataInProduction } from "../commerce/production-guards";
import { asJsonObject, unrecognizedProviderStatus, verifyStripeSignature } from "./payment";

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
  /**
   * The partner's provider payout account reference (a token issued by the
   * provider's own onboarding surface, never bank details held by xenios).
   * Optional at the interface so the disabled and test providers stay
   * unchanged; the real adapter refuses to send without a valid one.
   */
  payoutAccountReference?: string;
  /**
   * The named admin who approved sending this payment. Optional at the
   * interface; the real adapter refuses to send without one, because the
   * approval doctrine names a human at every point money moves.
   */
  approvedBy?: string;
  /**
   * ISO. The commission ledger enforces the hold upstream; the real adapter
   * re-checks and refuses an item whose hold has not elapsed, so neither side
   * alone can pay early.
   */
  holdUntil?: string;
}

/**
 * "reversed" is provider-reported state only. A reversal never mutates the
 * paid ledger row: the commission ledger records a NEW reversal event upstream
 * (append-only), and this status is how the adapter reports what the provider
 * says happened.
 */
export type PayoutStatus = "pending" | "paid" | "failed" | "cancelled" | "reversed";

export interface PayoutRecord {
  providerReference: string;
  batchId: string;
  partnerId: string;
  amountCents: number;
  currency: "usd";
  status: PayoutStatus;
  /**
   * The commission ledger rows this payment settled, read back from the
   * provider's own record (the metadata echo for the real adapter). A payout
   * proof is valid ONLY for these entries: without them, one genuine payout
   * result could be replayed as proof to mark any number of the partner's
   * ledger entries paid, including value the payout never covered.
   */
  ledgerEntryIds: readonly string[];
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
  // A proof that names no settled ledger entries proves nothing about any
  // entry, so it can never mark one paid (fail closed on a provider that did
  // not echo the settlement set back).
  if (!Array.isArray(result.value.ledgerEntryIds) || result.value.ledgerEntryIds.length === 0) return false;
  return typeof ref === "string" && ref.length > 0 && result.value.status === "paid";
}

/**
 * True only when the proof's own settlement set names the given ledger entry.
 * The consumer marking an entry paid must call this per entry (in addition to
 * matching partner and batch), so a $50 payout that settled e1 and e2 can
 * never be replayed as proof to settle e3.
 */
export function proofSettlesEntry(proof: SettledPayoutResult, ledgerEntryId: string): boolean {
  return proof.value.ledgerEntryIds.includes(ledgerEntryId);
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
      ledgerEntryIds: [...input.ledgerEntryIds],
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
// Real adapter wire contract
// ---------------------------------------------------------------------------

/**
 * The wire contract for the payout rail, mirroring the StripeTransport pattern
 * in payment.ts: the transport is the one injectable seam, so every test runs
 * against canned responses and no test can reach the network by default. No
 * rail has been chosen yet; PAYOUT_API_BASE names the endpoint when one is,
 * and until then the factory resolves to Disabled.
 */
export interface PayoutProviderRequest {
  method: "GET" | "POST";
  /** Path under the API base, e.g. "/v1/payouts". */
  path: string;
  /** JSON body for POST requests. */
  body?: Record<string, unknown>;
  /** Sent as the provider's Idempotency-Key header. Always the caller's key, never invented. */
  idempotencyKey?: string;
}

export interface PayoutProviderResponse {
  status: number;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  body: unknown;
}

export type PayoutTransport = (request: PayoutProviderRequest) => Promise<PayoutProviderResponse>;

/**
 * The production transport. The API key lives only inside this closure, so it
 * never sits on adapter config, never reaches a ProviderResult message, and
 * nothing serializable carries it. Inert until a resolver constructs it from a
 * complete environment behind the payouts flag.
 */
export function buildFetchPayoutTransport(apiKey: string, apiBase: string): PayoutTransport {
  const base = apiBase.replace(/\/+$/, "");
  return async (request) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
    };
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    let body: string | undefined;
    if (request.body) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(request.body);
    }
    const response = await fetch(`${base}${request.path}`, {
      method: request.method,
      headers,
      body,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { status: response.status, body: parsed };
  };
}

/**
 * Maps a payout rail error response to the provider-result vocabulary.
 * Credential problems are MISCONFIGURED (a capability state, not an outage),
 * throttling and provider outages are RETRYABLE, and everything else (refusals,
 * invalid requests) is terminal REJECTED, so a caller retries only what a retry
 * can actually fix and never re-sends a payment the provider refused.
 */
export function mapPayoutFailure<T>(status: number, body: unknown): ProviderResult<T> {
  const error = asJsonObject(asJsonObject(body)?.error);
  const message =
    typeof error?.message === "string" && error.message !== ""
      ? error.message
      : `Provider returned HTTP ${status}.`;
  if (status === 401 || status === 403) return providerMisconfigured<T>(message);
  if (status === 429 || status >= 500) {
    return { ok: false, code: "RETRYABLE", message, retryable: true };
  }
  return { ok: false, code: "REJECTED", message, retryable: false };
}

/** A transport-level failure (network, DNS, timeout). Always retryable. */
export function payoutTransportFailure<T>(): ProviderResult<T> {
  return {
    ok: false,
    code: "RETRYABLE",
    message: "The payout provider could not be reached.",
    retryable: true,
  };
}

/**
 * Provider payout status to domain status vocabulary. Anything absent from this
 * table is refused explicitly rather than passed through, so a new provider
 * status can never leak an unknown word into commission logic or be guessed
 * into "paid".
 */
const PAYOUT_STATUS_DOMAIN: Record<string, PayoutStatus> = {
  pending: "pending",
  in_transit: "pending",
  paid: "paid",
  failed: "failed",
  canceled: "cancelled",
  cancelled: "cancelled",
  reversed: "reversed",
};

/**
 * Provider event types translated to the domain event vocabulary. An unlisted
 * provider type passes through untranslated, which the webhook handler
 * acknowledges and ignores: a new provider event can never move a commission
 * by accident.
 */
const PAYOUT_EVENT_TYPES: Record<string, string> = {
  "payout.paid": "payout.paid",
  "payout.failed": "payout.failed",
  "payout.canceled": "payout.cancelled",
  "payout.reversed": "payout.reversed",
};

// ---------------------------------------------------------------------------
// Account references, the emergency switch, and audit
// ---------------------------------------------------------------------------

const PAYOUT_ACCOUNT_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;

/**
 * Batch and partner ids participate in the derived idempotency key
 * `payout:<batchId>:<partnerId>`, so an id carrying the ':' delimiter could
 * collide two distinct (batch, partner) pairs onto one key and hand partner
 * A's payout back as the idempotent result for partner B. The shape check
 * refuses the delimiter (and anything else outside a plain token) before any
 * key is derived.
 */
const PAYOUT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function isValidPayoutId(id: unknown): id is string {
  return typeof id === "string" && PAYOUT_ID_PATTERN.test(id);
}

/**
 * A payout account reference is a provider-issued token, never bank details.
 * The shape check refuses whitespace, empty strings, and anything long or odd
 * enough to be a pasted secret or an injection attempt, before it ever reaches
 * a request body.
 */
export function isValidPayoutAccountReference(reference: unknown): reference is string {
  return typeof reference === "string" && PAYOUT_ACCOUNT_REFERENCE_PATTERN.test(reference);
}

export const PAYOUT_EMERGENCY_DISABLE_VARIABLE = "PAYOUTS_EMERGENCY_DISABLED";

/**
 * The kill switch. When PAYOUTS_EMERGENCY_DISABLED=true, every payout
 * operation refuses regardless of any other configuration, flag, or provider
 * selection. It is read at call time by default, so flipping it stops a
 * running process without a restart.
 */
export function payoutsEmergencyDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PAYOUTS_EMERGENCY_DISABLED === "true";
}

export type PayoutAuditEventType =
  | "payout_batch_refused"
  | "payout_item_refused"
  | "payout_created"
  | "payout_create_failed"
  | "payout_reconciled"
  | "payout_cancel_requested"
  | "payout_webhook_verified"
  | "payout_webhook_rejected"
  | "payout_emergency_refusal";

/**
 * One audit event per consequential adapter decision. Carries identifiers and
 * amounts only: never a credential, never a signature, never a raw provider
 * body, so the audit sink is safe to persist and to read.
 */
export interface PayoutAuditEvent {
  type: PayoutAuditEventType;
  at: string;
  batchId?: string;
  partnerId?: string;
  providerReference?: string;
  approvedBy?: string;
  amountCents?: number;
  detail?: string;
}

export type PayoutAuditRecorder = (event: PayoutAuditEvent) => void;

// ---------------------------------------------------------------------------
// Batch input and per-item results
// ---------------------------------------------------------------------------

export interface PayoutBatchItemInput {
  partnerId: string;
  /** Provider-issued payout account token. Validated before any request is sent. */
  payoutAccountReference: string;
  /** Minor units. Always summed server-side from payable ledger entries. */
  amountCents: number;
  currency: "usd";
  /** The commission ledger rows this payment settles. */
  ledgerEntryIds: readonly string[];
  /**
   * ISO. buildBatch already excludes an unelapsed hold upstream; the adapter
   * re-checks and refuses, so a caller that skipped the batching policy still
   * cannot pay early.
   */
  holdUntil?: string;
  memo?: string;
}

export interface CreatePayoutBatchInput {
  /** Groups one run of partner payments so a retry settles the same set. */
  batchId: string;
  /**
   * The named admin who approved this run. Required: the adapter refuses the
   * whole batch without one, because model output or a scheduler must never be
   * the thing that authorizes money leaving.
   */
  approvedBy: string;
  items: readonly PayoutBatchItemInput[];
}

export type PayoutItemFailure = {
  partnerId: string;
  ok: false;
  code: ProviderFailureCode;
  message: string;
  retryable: boolean;
};

export type PayoutItemOutcome = { partnerId: string; ok: true; payout: PayoutRecord } | PayoutItemFailure;

export interface PayoutBatchResult {
  batchId: string;
  items: PayoutItemOutcome[];
}

export type PayoutReconciliationItem =
  | { providerReference: string; ok: true; payout: PayoutRecord }
  | { providerReference: string; ok: false; code: ProviderFailureCode; message: string; retryable: boolean };

export interface PayoutBatchReconciliation {
  batchId: string;
  items: PayoutReconciliationItem[];
}

// ---------------------------------------------------------------------------
// Real adapter configuration
// ---------------------------------------------------------------------------

export interface RealPayoutConfig {
  apiKey: string;
  webhookSecret: string;
  /** The payout rail's API origin. Names the rail once one is chosen. */
  apiBase: string;
  /** Injected in every test. Defaults to the fetch transport only at resolution time. */
  transport?: PayoutTransport;
  /** Injectable clock (milliseconds) for hold and webhook tolerance tests. */
  now?: () => number;
  toleranceSeconds?: number;
  /** Injected audit sink. Defaults to a no-op so the adapter never throws on audit. */
  audit?: PayoutAuditRecorder;
  /** Injected kill-switch check. Defaults to reading the process environment at call time. */
  emergencyDisabled?: () => boolean;
}

/**
 * Reports what is missing by VARIABLE NAME only. A value never appears in the
 * result, so this structure is safe to surface in admin diagnostics.
 */
export function validatePayoutConfig(
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; apiKey: string; webhookSecret: string; apiBase: string }
  | { ok: false; missingEnvironmentVariables: string[] } {
  const apiKey = env.PAYOUT_API_KEY;
  const webhookSecret = env.PAYOUT_WEBHOOK_SECRET;
  const apiBase = env.PAYOUT_API_BASE;
  const missing: string[] = [];
  if (!apiKey) missing.push("PAYOUT_API_KEY");
  if (!webhookSecret) missing.push("PAYOUT_WEBHOOK_SECRET");
  if (!apiBase) missing.push("PAYOUT_API_BASE");
  if (!apiKey || !webhookSecret || !apiBase) return { ok: false, missingEnvironmentVariables: missing };
  return { ok: true, apiKey, webhookSecret, apiBase };
}

/** Default tolerance for payout webhook timestamps, matching the payment rail. */
export const PAYOUT_WEBHOOK_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Real adapter
// ---------------------------------------------------------------------------

/**
 * The real payout adapter over an injected transport.
 *
 * It constructs ONLY with a complete configuration; `resolvePayoutProvider`
 * returns Disabled when anything is missing, so an accidental production
 * enablement without credentials degrades to a truthful capability refusal.
 * No rail has been chosen and no credential exists, so in every current
 * environment this class is never constructed: the code is complete and
 * tested against the injected transport, and nothing can send by accident.
 *
 * Money safety inside the adapter, independent of upstream checks:
 * - the emergency switch beats every other input, on every operation
 * - a batch without a named approving admin is refused whole
 * - an item whose hold has not elapsed is refused (the ledger enforced it
 *   upstream; the adapter double-checks)
 * - the idempotency key for an item is derived from the batch id, so a retried
 *   batch settles the same payments instead of sending twice
 * - no response status outside the explicit table is ever treated as success
 * - a reversal is only ever REPORTED; the append-only commission ledger
 *   records the reversal as a new event upstream
 */
export class RealPayoutAdapter implements PayoutProvider {
  readonly name = "real";

  static readonly requiredEnvironmentVariables = [
    "PAYOUT_PROVIDER",
    "PAYOUT_API_KEY",
    "PAYOUT_WEBHOOK_SECRET",
    "PAYOUT_API_BASE",
  ] as const;

  private readonly transport: PayoutTransport;
  private readonly webhookSecret: string;
  private readonly now: () => number;
  private readonly toleranceSeconds: number;
  private readonly audit: PayoutAuditRecorder;
  private readonly isEmergencyDisabled: () => boolean;
  /**
   * Event id -> when it was seen (ms). A stale timestamp is already rejected
   * beyond the tolerance window, so entries older than twice the window are
   * pruned on every insert; the map stays bounded on a long-lived process
   * instead of growing one entry per accepted event forever.
   */
  private readonly seenWebhookEvents = new Map<string, number>();

  constructor(config: RealPayoutConfig) {
    if (!config.apiKey || !config.webhookSecret || !config.apiBase) {
      throw new Error(
        "RealPayoutAdapter requires an API key, a webhook secret, and an API base. " +
          "Use resolvePayoutProvider, which falls back to Disabled when they are absent.",
      );
    }
    this.transport = config.transport ?? buildFetchPayoutTransport(config.apiKey, config.apiBase);
    this.webhookSecret = config.webhookSecret;
    this.now = config.now ?? Date.now;
    this.toleranceSeconds = config.toleranceSeconds ?? PAYOUT_WEBHOOK_TOLERANCE_SECONDS;
    this.audit = config.audit ?? (() => {});
    this.isEmergencyDisabled = config.emergencyDisabled ?? (() => payoutsEmergencyDisabled(process.env));
  }

  private record(event: Omit<PayoutAuditEvent, "at">): void {
    try {
      this.audit({ ...event, at: new Date(this.now()).toISOString() });
    } catch {
      // The audit sink must never take a refusal path down with it.
    }
  }

  /**
   * Checked first in EVERY operation. The refusal names the switch so an
   * operator reading a log knows exactly which lever is pulled, and the code
   * is DISABLED so callers treat it as a capability state, never a retryable
   * outage.
   */
  private emergencyRefusal<T>(context: string, ids: { batchId?: string; partnerId?: string } = {}): ProviderResult<T> {
    this.record({
      type: "payout_emergency_refusal",
      batchId: ids.batchId,
      partnerId: ids.partnerId,
      detail: context,
    });
    return {
      ok: false,
      code: "DISABLED",
      message: `EMERGENCY_DISABLED: partner payouts are switched off (${PAYOUT_EMERGENCY_DISABLE_VARIABLE}=true). Refusing ${context}.`,
      retryable: false,
    };
  }

  private async call(request: PayoutProviderRequest): Promise<PayoutProviderResponse | null> {
    try {
      return await this.transport(request);
    } catch {
      return null;
    }
  }

  /**
   * Parses a provider payout object into the domain record. Fails closed on a
   * missing id, an unmapped status, a non-integer amount, or a currency other
   * than usd: nothing outside the explicit vocabulary is ever passed upstream.
   */
  private toPayoutRecord(body: unknown, context: string): ProviderResult<PayoutRecord> {
    const payout = asJsonObject(body);
    const reference = typeof payout?.id === "string" && payout.id !== "" ? payout.id : undefined;
    if (!payout || !reference) {
      return unrecognizedProviderStatus<PayoutRecord>(context, "response without an id");
    }
    const status = PAYOUT_STATUS_DOMAIN[String(payout.status)];
    if (!status) return unrecognizedProviderStatus<PayoutRecord>(context, payout.status);
    if (payout.currency !== "usd") {
      return unrecognizedProviderStatus<PayoutRecord>(context, `currency ${String(payout.currency)}`);
    }
    const amount = payout.amount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      return unrecognizedProviderStatus<PayoutRecord>(context, "response without an integer amount");
    }
    // The metadata echo binds the record back to what THIS payment settled.
    // Attribution of record still lives in the caller's own store keyed by the
    // provider reference, but the settlement set must come from the provider's
    // own record: absent metadata reads back as an empty set, which canMarkPaid
    // refuses, so a proof is never wider than what the provider confirms.
    const metadata = asJsonObject(payout.metadata);
    const batchId = typeof metadata?.batchId === "string" ? metadata.batchId : "";
    const partnerId = typeof metadata?.partnerId === "string" ? metadata.partnerId : "";
    const ledgerEntryIds =
      typeof metadata?.ledgerEntryIds === "string" && metadata.ledgerEntryIds !== ""
        ? metadata.ledgerEntryIds.split(",").filter((id) => id !== "")
        : [];
    return providerOk(
      {
        providerReference: reference,
        batchId,
        partnerId,
        amountCents: amount,
        currency: "usd" as const,
        status,
        ledgerEntryIds,
      },
      reference,
    );
  }

  /** True when the hold is absent or has elapsed against the injected clock. Unparseable fails closed. */
  private holdElapsed(holdUntil: string | undefined): boolean {
    if (holdUntil === undefined) return true;
    const holdMs = new Date(holdUntil).getTime();
    return Number.isFinite(holdMs) && holdMs <= this.now();
  }

  private refuseItem(
    input: { batchId: string; partnerId: string },
    message: string,
  ): ProviderResult<PayoutRecord> {
    this.record({
      type: "payout_item_refused",
      batchId: input.batchId,
      partnerId: input.partnerId,
      detail: message,
    });
    return { ok: false, code: "REJECTED", message, retryable: false };
  }

  async createPayout(input: CreatePayoutInput): Promise<ProviderResult<PayoutRecord>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutRecord>("payout creation", input);
    }
    if (!input.approvedBy || input.approvedBy.trim() === "") {
      return this.refuseItem(input, "A payout requires a named approving admin (approvedBy). Refusing to send.");
    }
    if (!isValidPayoutId(input.batchId) || !isValidPayoutId(input.partnerId)) {
      return this.refuseItem(
        input,
        "The batch id or partner id is malformed (ids are plain tokens; the ':' key delimiter is refused).",
      );
    }
    if (!isValidPayoutAccountReference(input.payoutAccountReference)) {
      return this.refuseItem(input, "The partner payout account reference is missing or malformed.");
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return this.refuseItem(input, "Payout amount must be a positive integer number of cents.");
    }
    if (input.ledgerEntryIds.length === 0) {
      return this.refuseItem(input, "A payout must settle at least one ledger entry.");
    }
    if (!this.holdElapsed(input.holdUntil)) {
      return this.refuseItem(input, "The payout hold period has not elapsed. The entry stays owed, not sent.");
    }
    if (!input.idempotencyKey) {
      return this.refuseItem(input, "A payout requires an idempotency key.");
    }

    const response = await this.call({
      method: "POST",
      path: "/v1/payouts",
      body: {
        amount: input.amountCents,
        currency: input.currency,
        destination: input.payoutAccountReference,
        ...(input.memo ? { memo: input.memo } : {}),
        metadata: {
          batchId: input.batchId,
          partnerId: input.partnerId,
          approvedBy: input.approvedBy,
          ledgerEntryIds: input.ledgerEntryIds.join(","),
        },
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (!response) return payoutTransportFailure();
    if (response.status !== 200) {
      const failure = mapPayoutFailure<PayoutRecord>(response.status, response.body);
      this.record({
        type: "payout_create_failed",
        batchId: input.batchId,
        partnerId: input.partnerId,
        amountCents: input.amountCents,
        detail: failure.ok ? undefined : failure.message,
      });
      return failure;
    }
    const record = this.toPayoutRecord(response.body, "payout creation");
    if (!record.ok) {
      this.record({
        type: "payout_create_failed",
        batchId: input.batchId,
        partnerId: input.partnerId,
        amountCents: input.amountCents,
        detail: record.message,
      });
      return record;
    }
    this.record({
      type: "payout_created",
      batchId: input.batchId,
      partnerId: input.partnerId,
      providerReference: record.value.providerReference,
      approvedBy: input.approvedBy,
      amountCents: input.amountCents,
    });
    return record;
  }

  /**
   * Creates one run of partner payments with per-item results.
   *
   * The item idempotency key is derived from the batch id and partner id, so a
   * retried batch (a crash, a timeout, an operator re-run) asks the provider to
   * settle the SAME payments; the provider's idempotency makes the retry read
   * back the original payout instead of sending a second one.
   *
   * One item's failure never aborts the others: an admin sees exactly which
   * partners were paid and which need attention, with a retryable flag that
   * distinguishes a provider outage from a terminal refusal.
   */
  async createPayoutBatch(input: CreatePayoutBatchInput): Promise<ProviderResult<PayoutBatchResult>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutBatchResult>("payout batch creation", { batchId: input.batchId });
    }
    if (!input.approvedBy || input.approvedBy.trim() === "") {
      this.record({
        type: "payout_batch_refused",
        batchId: input.batchId,
        detail: "missing approvedBy",
      });
      return {
        ok: false,
        code: "REJECTED",
        message: "A payout batch requires a named approving admin (approvedBy). Refusing the whole batch.",
        retryable: false,
      };
    }
    if (!isValidPayoutId(input.batchId)) {
      this.record({ type: "payout_batch_refused", batchId: input.batchId, detail: "malformed batch id" });
      return {
        ok: false,
        code: "REJECTED",
        message:
          "The batch id is malformed (ids are plain tokens; the ':' key delimiter is refused). Refusing the whole batch.",
        retryable: false,
      };
    }
    if (input.items.length === 0) {
      this.record({ type: "payout_batch_refused", batchId: input.batchId, detail: "empty batch" });
      return { ok: false, code: "REJECTED", message: "A payout batch must contain at least one item.", retryable: false };
    }
    const partnerIds = new Set<string>();
    for (const item of input.items) {
      if (partnerIds.has(item.partnerId)) {
        this.record({
          type: "payout_batch_refused",
          batchId: input.batchId,
          partnerId: item.partnerId,
          detail: "duplicate partner in batch",
        });
        return {
          ok: false,
          code: "REJECTED",
          message: `Partner ${item.partnerId} appears twice in one batch. Refusing the whole batch as a double pay.`,
          retryable: false,
        };
      }
      partnerIds.add(item.partnerId);
    }

    const items: PayoutItemOutcome[] = [];
    for (const item of input.items) {
      const result = await this.createPayout({
        batchId: input.batchId,
        partnerId: item.partnerId,
        amountCents: item.amountCents,
        currency: item.currency,
        idempotencyKey: `payout:${input.batchId}:${item.partnerId}`,
        ledgerEntryIds: item.ledgerEntryIds,
        memo: item.memo,
        payoutAccountReference: item.payoutAccountReference,
        approvedBy: input.approvedBy,
        holdUntil: item.holdUntil,
      });
      if (result.ok) {
        items.push({ partnerId: item.partnerId, ok: true, payout: result.value });
      } else {
        items.push({
          partnerId: item.partnerId,
          ok: false,
          code: result.code,
          message: result.message,
          retryable: result.retryable,
        });
      }
    }
    return providerOk({ batchId: input.batchId, items });
  }

  async getPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutRecord>("payout retrieval");
    }
    const response = await this.call({
      method: "GET",
      path: `/v1/payouts/${encodeURIComponent(providerReference)}`,
    });
    if (!response) return payoutTransportFailure();
    if (response.status !== 200) return mapPayoutFailure(response.status, response.body);
    const record = this.toPayoutRecord(response.body, "payout retrieval");
    if (record.ok) {
      this.record({
        type: "payout_reconciled",
        providerReference: record.value.providerReference,
        batchId: record.value.batchId || undefined,
        partnerId: record.value.partnerId || undefined,
        detail: record.value.status,
      });
    }
    return record;
  }

  /**
   * Reconciliation: fetches current provider state for every reference in a
   * batch. Reporting only. A "reversed" or "failed" status here maps to a NEW
   * commission ledger event upstream (the ledger is append-only); the adapter
   * never mutates history and never decides money moved.
   */
  async reconcileBatch(
    batchId: string,
    providerReferences: readonly string[],
  ): Promise<ProviderResult<PayoutBatchReconciliation>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutBatchReconciliation>("payout batch reconciliation", { batchId });
    }
    const items: PayoutReconciliationItem[] = [];
    for (const providerReference of providerReferences) {
      const result = await this.getPayout(providerReference);
      if (result.ok) {
        items.push({ providerReference, ok: true, payout: result.value });
      } else {
        items.push({
          providerReference,
          ok: false,
          code: result.code,
          message: result.message,
          retryable: result.retryable,
        });
      }
    }
    return providerOk({ batchId, items });
  }

  async cancelPayout(providerReference: string): Promise<ProviderResult<PayoutRecord>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutRecord>("payout cancellation");
    }
    this.record({ type: "payout_cancel_requested", providerReference });
    const response = await this.call({
      method: "POST",
      path: `/v1/payouts/${encodeURIComponent(providerReference)}/cancel`,
    });
    if (!response) return payoutTransportFailure();
    if (response.status !== 200) return mapPayoutFailure(response.status, response.body);
    const record = this.toPayoutRecord(response.body, "payout cancellation");
    if (!record.ok) return record;
    if (record.value.status !== "cancelled") {
      return unrecognizedProviderStatus<PayoutRecord>("payout cancellation", record.value.status);
    }
    return record;
  }

  /**
   * The cryptographic boundary for provider events. The header format is the
   * same signed scheme as the payment rail (`t=<unix seconds>,v1=<hex hmac>`,
   * HMAC-SHA256 over `${t}.${rawBody}`), verified in constant time with a
   * staleness window, plus in-process replay refusal of a seen event id as
   * defense in depth ahead of the caller's durable event store.
   */
  async verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<ProviderResult<PayoutWebhookVerification>> {
    if (this.isEmergencyDisabled()) {
      return this.emergencyRefusal<PayoutWebhookVerification>("payout webhook verification");
    }
    const reject = (message: string): ProviderResult<PayoutWebhookVerification> => {
      this.record({ type: "payout_webhook_rejected", detail: message });
      return { ok: false, code: "REJECTED", message, retryable: false };
    };
    if (!signatureHeader) return reject("Missing signature header.");
    const failure = verifyStripeSignature(
      rawBody,
      signatureHeader,
      this.webhookSecret,
      this.now(),
      this.toleranceSeconds,
    );
    if (failure === "malformed") return reject("Malformed signature header.");
    if (failure === "stale") return reject("Webhook timestamp is outside the tolerance window.");
    if (failure) return reject("Invalid signature.");

    let event: Record<string, unknown> | null = null;
    try {
      event = asJsonObject(JSON.parse(rawBody));
    } catch {
      event = null;
    }
    if (!event) return reject("Malformed webhook body.");
    const eventId = typeof event.id === "string" && event.id !== "" ? event.id : undefined;
    const eventType = typeof event.type === "string" && event.type !== "" ? event.type : undefined;
    if (!eventId || !eventType) return reject("Webhook missing id or type.");
    if (this.seenWebhookEvents.has(eventId)) return reject("Duplicate webhook event.");
    const nowMs = this.now();
    const horizonMs = nowMs - this.toleranceSeconds * 2 * 1000;
    this.seenWebhookEvents.forEach((seenAtMs, seenId) => {
      if (seenAtMs < horizonMs) this.seenWebhookEvents.delete(seenId);
    });
    this.seenWebhookEvents.set(eventId, nowMs);

    const dataObject = asJsonObject(asJsonObject(event.data)?.object);
    const objectId = typeof dataObject?.id === "string" && dataObject.id !== "" ? dataObject.id : undefined;
    const topLevelReference =
      typeof event.providerReference === "string" && event.providerReference !== ""
        ? event.providerReference
        : undefined;
    const providerReference = objectId ?? topLevelReference;

    this.record({
      type: "payout_webhook_verified",
      providerReference,
      detail: PAYOUT_EVENT_TYPES[eventType] ?? eventType,
    });
    return providerOk<PayoutWebhookVerification>({
      eventId,
      eventType: PAYOUT_EVENT_TYPES[eventType] ?? eventType,
      providerReference,
      verified: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Chooses the provider. Defaults to Disabled.
 *
 * The emergency switch is checked FIRST and beats everything, including the
 * enable flag and the provider selection, so one variable stops payouts dead.
 * The test provider is reachable only outside production, so a stray
 * environment value cannot turn a live deployment into a fake-payout
 * deployment that reports partners as paid when nothing moved. The real
 * adapter is returned only from a complete configuration; a partial one falls
 * back to Disabled rather than constructing a half-configured adapter.
 */
export function resolvePayoutProvider(env: NodeJS.ProcessEnv = process.env): PayoutProvider {
  if (payoutsEmergencyDisabled(env)) return new DisabledPayoutProvider();
  if (env.RESEARCH_AFFILIATE_PAYOUTS_ENABLED !== "true") return new DisabledPayoutProvider();

  const selected = env.PAYOUT_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledPayoutProvider();
    return new TestPayoutProvider();
  }
  if (selected === "live") {
    const config = validatePayoutConfig(env);
    if (!config.ok) return new DisabledPayoutProvider();
    // The synthetic-data guard: a live payout adapter must never construct
    // over sandbox fixtures while the process is production-like. Throws
    // loudly BEFORE the adapter (and any provider call) exists.
    assertNoSyntheticDataInProduction(
      { payoutConfig: { apiBase: config.apiBase, apiKey: config.apiKey, webhookSecret: config.webhookSecret } },
      env,
    );
    return new RealPayoutAdapter({
      apiKey: config.apiKey,
      webhookSecret: config.webhookSecret,
      apiBase: config.apiBase,
      emergencyDisabled: () => payoutsEmergencyDisabled(env),
    });
  }
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
