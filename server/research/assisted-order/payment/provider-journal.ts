import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProviderResult } from "../../../../shared/research/capability";
import { AssistedOrderValidationError } from "../../../../shared/research/assisted-order/contract";
import type { AssistedOrderViewer } from "../ports";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, AssistedOrderNotFoundError } from "../service";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "../supabase-repository";
import type { AssistedProviderEnvelope, AssistedProviderScope } from "./provider-adapter";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const namespace = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const identifier = z.string().min(1).max(160).refine((value) =>
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const integer = z.number().int().min(1).max(2_147_483_647);
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const currency = z.string().regex(/^[A-Z]{3}$/);
const kind = z.enum(["pending", "authorized", "captured", "failed", "cancelled", "refunded",
  "dispute_opened", "dispute_won", "dispute_lost"]);
const commandSchema = z.object({ quoteId: uuid, quoteVersion: integer, acceptanceId: uuid }).strict();
const attemptSchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_attempt_v1"), attemptId: uuid, requestId: uuid,
  quoteId: uuid, quoteVersion: integer, acceptanceId: uuid, sourceId: namespace,
  expectedAmountCents: cents.refine((value) => value > 0), currency,
  state: z.literal("held"), reservedAt: timestamp, replayed: z.boolean(),
}).strict();
const journalSchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_journal_receipt_v1"), journalId: uuid,
  sourceId: namespace, state: z.literal("held"), classification: z.enum(["bound", "quarantined", "conflict"]),
  reason: z.enum(["exact_binding", "unknown_attempt", "missing_event_identity", "binding_mismatch", "amount_currency_mismatch",
    "unsupported_financial_effect", "terminal_request", "event_identity_conflict", "payment_identity_conflict", "source_revoked"]),
  requestId: uuid.nullable(), attemptId: uuid.nullable(), receivedAt: timestamp,
  replayed: z.boolean(),
}).strict().refine((value) => (value.requestId === null) === (value.attemptId === null) &&
  (value.classification === "bound" ? value.reason === "exact_binding" && value.attemptId !== null : value.reason !== "exact_binding"));
const uncertaintySchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_uncertainty_v1"), requestId: uuid, held: z.boolean(),
  reason: z.enum(["provider_attempt_held", "provider_unbound_event_held"]).nullable(),
}).strict().refine((value) => value.held === (value.reason !== null));
const authoritySchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_journal_v1"), settlementEnabled: z.literal(false),
  refundEnabled: z.literal(false), liveExecutionEnabled: z.literal(false),
}).strict();

/**
 * The configured adapter authenticates original bytes, timestamp, account and
 * test/live scope before returning normalized facts. No browser flag can fill
 * this port. Existing provider transport adapters can implement it without
 * exposing createAttempt, refund or cancellation execution here.
 */
export type AssistedProviderJournalSource = Readonly<{
  sourceId: string;
  adapterRevision: string;
  scope: AssistedProviderScope;
  authenticateEvent(envelope: AssistedProviderEnvelope): Promise<ProviderResult<unknown>>;
}>;
export type AssistedProviderHeldAttempt = Readonly<z.infer<typeof attemptSchema>>;
export type AssistedProviderJournalReceipt = Readonly<z.infer<typeof journalSchema>>;
export type AssistedProviderIngressResult =
  | Readonly<{ ok: true; receipt: AssistedProviderJournalReceipt }>
  | Readonly<{ ok: false; code: "unavailable" | "invalid_envelope" | "unauthenticated" | "persistence_unavailable" }>;

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const fail = (code: Extract<AssistedProviderIngressResult, { ok: false }>["code"]): AssistedProviderIngressResult => ({ ok: false, code });
const plain = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function optional<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
function sourceValid(source: AssistedProviderJournalSource | null): source is AssistedProviderJournalSource {
  return !!source && namespace.safeParse(source.sourceId).success && namespace.safeParse(source.adapterRevision).success &&
    namespace.safeParse(source.scope?.provider).success && identifier.safeParse(source.scope?.accountId).success &&
    (source.scope.mode === "test" || source.scope.mode === "live") && typeof source.authenticateEvent === "function";
}
function assertRpc(response: SupabaseRpcResponse): void {
  if (!response.error) return;
  if (response.error.details === "ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED") throw new AssistedOrderAuthorizationError();
  throw new AssistedOrderConflictError("provider_journal_unavailable", "Provider payment processing remains unavailable.");
}

/**
 * Durable storage and conservative uncertainty only. This service cannot create
 * a provider session, observation, verification, paid status, refund, mail or
 * fulfillment event. The production composition passes a null source.
 */
export class AssistedProviderJournalService {
  private readonly source: AssistedProviderJournalSource | null;
  constructor(private readonly rpc: SupabaseRpcClient, source: AssistedProviderJournalSource | null) {
    // Snapshot configuration so an adapter cannot alter its SQL authority while
    // authentication is in flight. Keep its implementation receiver intact.
    this.source = sourceValid(source) ? Object.freeze({
      sourceId: source.sourceId, adapterRevision: source.adapterRevision,
      scope: Object.freeze({ ...source.scope }), authenticateEvent: source.authenticateEvent.bind(source),
    }) : null;
  }

  async reserveHeld(viewer: AssistedOrderViewer, requestId: string, input: unknown): Promise<AssistedProviderHeldAttempt> {
    if (viewer.actorType !== "admin" || !viewer.capabilities.has("assisted_orders:manage") ||
        !uuid.safeParse(viewer.authUserId).success) throw new AssistedOrderAuthorizationError();
    const command = commandSchema.safeParse(input);
    if (!uuid.safeParse(requestId).success || !command.success) {
      throw new AssistedOrderValidationError("providerAttempt", "An exact accepted quote is required.");
    }
    if (!this.source) throw new AssistedOrderConflictError("provider_journal_unavailable", "Card payments are not configured.");
    await this.assertAuthority();
    const { quoteId, quoteVersion, acceptanceId } = command.data;
    const response = await this.rpc.rpc("research_assisted_order_provider_attempt_reserve", {
      p_request_id: requestId, p_quote_id: quoteId, p_quote_version: quoteVersion, p_acceptance_id: acceptanceId,
      p_source_id: this.source.sourceId, p_actor_auth_user_id: viewer.authUserId,
      p_adapter_revision: this.source.adapterRevision, p_expected_scope: this.source.scope,
      p_idempotency_key: digest(JSON.stringify(["provider-held:v1", requestId, quoteId, quoteVersion, acceptanceId, this.source.sourceId])),
    });
    assertRpc(response);
    if (response.data === null) throw new AssistedOrderNotFoundError();
    const parsed = attemptSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.requestId !== requestId || parsed.data.quoteId !== quoteId ||
        parsed.data.quoteVersion !== quoteVersion || parsed.data.acceptanceId !== acceptanceId ||
        parsed.data.sourceId !== this.source.sourceId) throw new Error("Provider reservation receipt unavailable");
    return Object.freeze(parsed.data);
  }

  async uncertainty(requestId: string): Promise<Readonly<z.infer<typeof uncertaintySchema>>> {
    if (!uuid.safeParse(requestId).success) throw new Error("Provider uncertainty unavailable");
    const response = await this.rpc.rpc("research_assisted_order_provider_uncertainty", { p_request_id: requestId });
    assertRpc(response);
    const parsed = uncertaintySchema.safeParse(response.data);
    if (!parsed.success || parsed.data.requestId !== requestId) throw new Error("Provider uncertainty unavailable");
    return Object.freeze(parsed.data);
  }

  async receiveAuthenticated(envelope: AssistedProviderEnvelope): Promise<AssistedProviderIngressResult> {
    if (!this.source) return fail("unavailable");
    // Exact bytes are volatile. Enforce bounds before copying or invoking an
    // authenticator; no JSON reserialization, raw request log or durable body.
    if (!(envelope?.rawBody instanceof Uint8Array) || envelope.rawBody.byteLength === 0 ||
        envelope.rawBody.byteLength > 262_144 || !plain(envelope.headers) ||
        Object.keys(envelope.headers).length > 64 || Object.entries(envelope.headers).some(([key, value]) =>
          key.length > 128 || (value !== undefined && (typeof value !== "string" || value.length > 8192)))) return fail("invalid_envelope");
    const rawBody = Uint8Array.from(envelope.rawBody);
    const payloadSha256 = digest(rawBody);
    const headers = Object.freeze({ ...envelope.headers });
    let result: ProviderResult<unknown>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        this.source.authenticateEvent({ rawBody, headers }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("authentication unavailable")), 5_000); }),
      ]);
      // The adapter must authenticate the bytes it was given, not mutate them
      // and leave a receipt claiming a digest for different bytes.
      if (!result?.ok || digest(rawBody) !== payloadSha256) return fail("unauthenticated");
    } catch {
      return fail("unauthenticated");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    try {
      const event = plain(result.value) ?? {};
      const validScope = event.provider === this.source.scope.provider && event.accountId === this.source.scope.accountId && event.mode === this.source.scope.mode;
      // Invalid authenticated facts are quarantined instead of being discarded
      // as evidence of no funds. Invalid scope strips all binding claims and
      // becomes a global uncertainty hold. SQL, not these claims, resolves IDs.
      const claims = validScope ? event : {};
      const malformedOptional = ([
        [claims.canonicalOrderId, uuid], [claims.providerSessionId, identifier], [claims.adjustmentId, identifier],
      ] as const).some(([value, schema]) => value !== null && value !== undefined && !schema.safeParse(value).success);
      const fact = Object.freeze({
        schemaVersion: "assisted_order_provider_event_v1", eventId: optional(identifier, event.eventId), payloadSha256,
        // A malformed optional claim is not the same as an absent one. Keep
        // the authenticated digest, but do not turn it into an exact binding.
        kind: malformedOptional ? "unknown" : optional(kind, claims.kind) ?? "unknown", occurredAt: optional(timestamp, claims.occurredAt),
        claimedAttemptId: optional(uuid, claims.attemptId), claimedRequestId: optional(uuid, claims.requestId),
        claimedQuoteId: optional(uuid, claims.quoteId), claimedAcceptanceId: optional(uuid, claims.acceptanceId),
        claimedCanonicalOrderId: optional(uuid, claims.canonicalOrderId), claimedQuoteVersion: optional(integer, claims.quoteVersion),
        providerPaymentId: optional(identifier, claims.providerPaymentId), providerSessionId: optional(identifier, claims.providerSessionId),
        adjustmentId: optional(identifier, claims.adjustmentId), observedAmountCents: optional(cents, claims.observedAmountCents),
        currency: optional(currency, claims.currency),
      });
      await this.assertAuthority();
      const response = await this.rpc.rpc("research_assisted_order_provider_event_append", {
        p_source_id: this.source.sourceId, p_adapter_revision: this.source.adapterRevision, p_event: fact,
        p_expected_scope: this.source.scope,
      });
      assertRpc(response);
      const parsed = journalSchema.safeParse(response.data);
      if (!parsed.success || parsed.data.sourceId !== this.source.sourceId ||
          (parsed.data.classification === "bound" && (parsed.data.attemptId !== fact.claimedAttemptId ||
            parsed.data.requestId !== fact.claimedRequestId || parsed.data.attemptId === null || parsed.data.requestId === null))) return fail("persistence_unavailable");
      return { ok: true, receipt: Object.freeze(parsed.data) };
    } catch {
      // Deliberately omit upstream messages, body, headers and provider facts.
      // A callback may acknowledge only this durable receipt, never auth alone.
      return fail("persistence_unavailable");
    }
  }

  private async assertAuthority(): Promise<void> {
    const response = await this.rpc.rpc("research_assisted_order_provider_journal_authority");
    assertRpc(response);
    if (!authoritySchema.safeParse(response.data).success) throw new Error("Provider journal authority unavailable");
  }
}

export function buildAssistedProviderJournal(input: Readonly<{
  enabled: boolean; rpc: SupabaseRpcClient | null; source: AssistedProviderJournalSource | null;
}>): AssistedProviderJournalService | null {
  return input.enabled && input.rpc && sourceValid(input.source)
    ? new AssistedProviderJournalService(input.rpc, input.source) : null;
}
