import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ProviderResult } from "../../../../shared/research/capability";
import { AssistedOrderValidationError } from "../../../../shared/research/assisted-order/contract";
import type { AssistedOrderViewer } from "../ports";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, AssistedOrderNotFoundError } from "../service";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "../supabase-repository";
import type { AssistedProviderScope } from "./provider-adapter";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const namespace = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const identifier = z.string().min(1).max(160).refine((value) =>
  value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value));
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const amount = z.number().int().positive().max(100_000_000);
const version = z.number().int().positive().max(2_147_483_647);
const currency = z.string().regex(/^[A-Z]{3}$/);
const scopeSchema = z.object({ provider: namespace, accountId: identifier, mode: z.enum(["test", "live"]) }).strict();
const policySchema = z.object({ revision: namespace, replayGuarantee: z.literal("same_key_same_body"),
  createReplaySeconds: z.number().int().min(1).max(86_400) }).strict();
const authoritySchema = z.object({ schemaVersion: z.literal("assisted_order_provider_execution_v1"),
  transactionIsolation: z.literal("read_committed_only"), durableCreateOwnership: z.literal(true),
  dispatchTiming: z.literal("database_budget_monotonic_v1"),
  providerIdentityBinding: z.literal("write_once"), settlementEnabled: z.literal(false),
  refundEnabled: z.literal(false), liveExecutionEnabled: z.literal(false) }).strict();
const contextShape = {
  schemaVersion: z.literal("assisted_order_provider_execution_context_v1"), requestId: uuid, attemptId: uuid,
  sourceId: namespace, adapterRevision: namespace, scope: scopeSchema, policyRevision: namespace,
  replayGuarantee: z.literal("same_key_same_body"), createReplaySeconds: z.number().int().min(1).max(86_400),
  quoteId: uuid, quoteVersion: version, acceptanceId: uuid, expectedAmountCents: amount, currency,
  creationKey: z.string().regex(/^[a-f0-9]{64}$/), creationStartedAt: instant.nullable(), creationReplayUntil: instant.nullable(),
  providerPaymentId: identifier.nullable(), providerSessionId: identifier.nullable(), state: z.literal("held"),
  nextAction: z.enum(["create", "retrieve", "wait", "reconciliation_required"]),
  claimId: uuid.nullable(), leaseExpiresAt: instant.nullable(),
} as const;
const contextSchema = z.object(contextShape).strict();
const claimSchema = z.object({ ...contextShape, authorized: z.boolean(), replayed: z.boolean(),
  claimIssuedAt: instant.nullable(), dispatchBudgetMs: z.number().int().min(0).max(300_000) }).strict();
type Context = z.infer<typeof contextSchema>;
type Claim = z.infer<typeof claimSchema>;
const objectSchema = z.object({ ...scopeSchema.shape, requestId: uuid, attemptId: uuid, quoteId: uuid,
  quoteVersion: version, acceptanceId: uuid, canonicalOrderId: z.null(), observedAmountCents: amount, currency,
  providerPaymentId: identifier, providerSessionId: identifier.nullable(), state: z.enum(["pending", "authorized"]) });
const resultReceiptSchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_create_result_receipt_v1"), resultId: uuid, claimId: uuid,
  attemptId: uuid, requestId: uuid, state: z.literal("held"), classification: z.enum(["bound", "unknown", "conflict"]),
  reason: z.enum(["exact_binding", "transport_uncertain", "invalid_response", "binding_mismatch", "provider_identity_conflict", "response_conflict"]),
  providerPaymentId: identifier.nullable(), providerSessionId: identifier.nullable(), recordedAt: instant, replayed: z.boolean(),
}).strict();

export type AssistedProviderExecutionPolicy = Readonly<z.infer<typeof policySchema>>;
/** Stable allowlisted create body derived from the durable accepted quote only. */
export type AssistedProviderCreateBody = Readonly<{
  requestId: string; attemptId: string; quoteId: string; quoteVersion: number; acceptanceId: string;
  canonicalOrderId: null; amountCents: number; currency: string;
}>;
/**
 * A provider-specific implementation must normalize independently returned
 * provider fields, including scope and metadata, not echo the input body as
 * evidence. HTTP success or a payment ID alone is insufficient. This stronger
 * port intentionally does not reuse the legacy transport-only session helper.
 * No SDK, provider, credentials or operational policy is configured here.
 */
export type AssistedProviderExecutionSource = Readonly<{
  sourceId: string; adapterRevision: string; scope: AssistedProviderScope; policy: AssistedProviderExecutionPolicy;
  create(input: Readonly<{ body: AssistedProviderCreateBody; idempotencyKey: string; signal: AbortSignal }>): Promise<ProviderResult<unknown>>;
  retrieve(input: Readonly<{ body: AssistedProviderCreateBody; providerPaymentId: string; providerSessionId: string | null;
    signal: AbortSignal }>): Promise<ProviderResult<unknown>>;
}>;
export type AssistedProviderExecutionReceipt = Readonly<{
  schemaVersion: "assisted_order_provider_execution_receipt_v1"; requestId: string; attemptId: string; state: "held";
  outcome: "recorded" | "waiting" | "reconciliation_required"; replayed: boolean;
}>;
type Result = Readonly<{
  schemaVersion: "assisted_order_provider_create_result_v1"; outcome: "object" | "unknown";
  reason: "object_received" | "transport_uncertain" | "invalid_response";
  provider: string | null; accountId: string | null; mode: "test" | "live" | null;
  attemptId: string | null; requestId: string | null; quoteId: string | null; quoteVersion: number | null;
  acceptanceId: string | null; observedAmountCents: number | null; currency: string | null;
  providerPaymentId: string | null; providerSessionId: string | null; state: "pending" | "authorized" | null;
}>;

const unavailable = () => new AssistedOrderConflictError("provider_execution_unavailable", "Provider payment processing remains on hold.");
function assertRpc(response: SupabaseRpcResponse): unknown {
  if (!response || typeof response !== "object") throw unavailable();
  if (response.error) {
    if (response.error.code === "P0001" && response.error.details === "ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED") {
      throw new AssistedOrderAuthorizationError();
    }
    throw unavailable();
  }
  return response.data;
}
async function readRpc(rpc: SupabaseRpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  let response: SupabaseRpcResponse;
  try { response = await rpc.rpc(name, args); } catch { throw unavailable(); }
  return assertRpc(response);
}
function validSource(source: AssistedProviderExecutionSource | null): source is AssistedProviderExecutionSource {
  return !!source && namespace.safeParse(source.sourceId).success && namespace.safeParse(source.adapterRevision).success &&
    scopeSchema.safeParse(source.scope).success && policySchema.safeParse(source.policy).success &&
    typeof source.create === "function" && typeof source.retrieve === "function";
}
function sameScope(a: AssistedProviderScope, b: AssistedProviderScope): boolean {
  return a.provider === b.provider && a.accountId === b.accountId && a.mode === b.mode;
}
function unknown(reason: "transport_uncertain" | "invalid_response"): Result {
  return Object.freeze({ schemaVersion: "assisted_order_provider_create_result_v1", outcome: "unknown", reason,
    provider: null, accountId: null, mode: null, attemptId: null, requestId: null, quoteId: null, quoteVersion: null,
    acceptanceId: null, observedAmountCents: null, currency: null, providerPaymentId: null, providerSessionId: null, state: null });
}
function normalize(response: ProviderResult<unknown>): Result {
  if (!response?.ok) return unknown("transport_uncertain");
  const parsed = objectSchema.safeParse(response.value);
  if (!parsed.success) return unknown("invalid_response");
  const value = parsed.data;
  // Never spread the raw object: provider secrets and transport fields cannot
  // enter SQL, a public response or logs. Well-formed mismatches stay facts for
  // SQL conflict storage; they must not be repaired from request metadata.
  return Object.freeze({ schemaVersion: "assisted_order_provider_create_result_v1", outcome: "object", reason: "object_received",
    provider: value.provider, accountId: value.accountId, mode: value.mode, requestId: value.requestId,
    attemptId: value.attemptId, quoteId: value.quoteId, quoteVersion: value.quoteVersion, acceptanceId: value.acceptanceId,
    observedAmountCents: value.observedAmountCents, currency: value.currency, providerPaymentId: value.providerPaymentId,
    providerSessionId: value.providerSessionId, state: value.state });
}
function publicReceipt(context: Pick<Context, "requestId" | "attemptId">,
  outcome: AssistedProviderExecutionReceipt["outcome"], replayed: boolean): AssistedProviderExecutionReceipt {
  return Object.freeze({ schemaVersion: "assisted_order_provider_execution_receipt_v1", requestId: context.requestId,
    attemptId: context.attemptId, state: "held", outcome, replayed });
}

/** Durable claims own dispatch. This process owns no deduplication or money. */
export class AssistedProviderExecutionService {
  private readonly source: AssistedProviderExecutionSource | null;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  constructor(private readonly rpc: SupabaseRpcClient, source: AssistedProviderExecutionSource | null,
    options: Readonly<{ now?: () => number; timeoutMs?: number }> = {}) {
    this.source = validSource(source) ? Object.freeze({ sourceId: source.sourceId, adapterRevision: source.adapterRevision,
      scope: Object.freeze({ ...source.scope }), policy: Object.freeze({ ...source.policy }),
      create: source.create.bind(source), retrieve: source.retrieve.bind(source) }) : null;
    this.now = options.now ?? Date.now;
    // A small local-test seam, never a browser/provider-controlled duration.
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs! >= 1 && options.timeoutMs! <= 5_000
      ? options.timeoutMs! : 5_000;
  }

  async prepare(viewer: AssistedOrderViewer, requestId: string, attemptId: string, input: unknown): Promise<AssistedProviderExecutionReceipt> {
    if (viewer.actorType !== "admin" || !viewer.capabilities.has("assisted_orders:manage") || !uuid.safeParse(viewer.authUserId).success) {
      throw new AssistedOrderAuthorizationError();
    }
    if (!uuid.safeParse(requestId).success || !uuid.safeParse(attemptId).success || !z.object({}).strict().safeParse(input).success) {
      throw new AssistedOrderValidationError("providerAttempt", "An existing provider attempt and an empty command are required.");
    }
    const source = this.source;
    if (!source) throw unavailable();
    const authority = await readRpc(this.rpc, "research_assisted_order_provider_execution_authority");
    if (!authoritySchema.safeParse(authority).success) throw unavailable();
    const args = Object.freeze({ p_request_id: requestId, p_attempt_id: attemptId, p_source_id: source.sourceId,
      p_adapter_revision: source.adapterRevision, p_expected_scope: source.scope, p_policy_revision: source.policy.revision,
      p_actor_auth_user_id: viewer.authUserId });
    const rawContext = await readRpc(this.rpc, "research_assisted_order_provider_create_context", args);
    if (rawContext === null) throw new AssistedOrderNotFoundError();
    const parsedContext = contextSchema.safeParse(rawContext);
    if (!parsedContext.success || !this.contextMatches(parsedContext.data, requestId, attemptId)) throw unavailable();
    const context = parsedContext.data;
    if (context.nextAction === "wait" || context.nextAction === "reconciliation_required") {
      return publicReceipt(context, context.nextAction === "wait" ? "waiting" : "reconciliation_required", false);
    }
    // Deduct the complete claim roundtrip, including time before SQL issued
    // the claim. This is conservative without assuming synchronized clocks.
    const claimRpcStarted = performance.now();
    if (!Number.isFinite(claimRpcStarted) || claimRpcStarted < 0) throw unavailable();
    const rawClaim = await readRpc(this.rpc, "research_assisted_order_provider_create_claim", { ...args, p_claim_key: randomUUID() });
    const parsedClaim = claimSchema.safeParse(rawClaim);
    if (!parsedClaim.success || !this.contextMatches(parsedClaim.data, requestId, attemptId)) throw unavailable();
    const claim = parsedClaim.data;
    if (!this.sameTerms(context, claim)) throw unavailable();
    if (!claim.authorized) {
      if (claim.claimIssuedAt !== null || claim.dispatchBudgetMs !== 0) throw unavailable();
      return publicReceipt(claim, claim.nextAction === "reconciliation_required" ? "reconciliation_required" : "waiting", claim.replayed);
    }
    if (!claim.claimId || !claim.leaseExpiresAt || !claim.creationStartedAt || !claim.creationReplayUntil || !claim.claimIssuedAt ||
        (claim.nextAction !== "create" && claim.nextAction !== "retrieve")) throw unavailable();
    const deadline = Math.min(Date.parse(claim.leaseExpiresAt),
      claim.nextAction === "create" ? Date.parse(claim.creationReplayUntil) : Infinity);
    if (Date.parse(claim.claimIssuedAt) < Date.parse(claim.creationStartedAt) || claim.dispatchBudgetMs <= 0 ||
        claim.dispatchBudgetMs !== deadline - Date.parse(claim.claimIssuedAt)) throw unavailable();
    let previousMonotonic = claimRpcStarted;
    const remainingBudget = () => {
      const current = performance.now();
      if (!Number.isFinite(current) || current < previousMonotonic) return Number.NEGATIVE_INFINITY;
      previousMonotonic = current;
      return claim.dispatchBudgetMs - (current - claimRpcStarted);
    };
    const remaining = remainingBudget();
    const now = this.now();
    // Wall time may reject conservatively but NEVER determines fresh budget.
    if (remaining <= 0 || !Number.isFinite(now) || now < Date.parse(claim.creationStartedAt) || now >= deadline) {
      return this.append(claim, unknown("transport_uncertain"));
    }
    const body: AssistedProviderCreateBody = Object.freeze({ requestId, attemptId, quoteId: claim.quoteId,
      quoteVersion: claim.quoteVersion, acceptanceId: claim.acceptanceId, canonicalOrderId: null,
      amountCents: claim.expectedAmountCents, currency: claim.currency });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeoutCommit: Promise<AssistedProviderExecutionReceipt> | undefined;
    // Both branches append through the same issued claim. A timeout's unknown
    // must commit before returning. A late response still appends after lease
    // loss/revocation, without attempting a second create or grant lookup.
    // This callback is NOT a durable worker: process death may lose it. The
    // durable unknown/claim survives; SQL permits recovery only under the fixed
    // key guarantee or keeps reconciliation held when that guarantee expires.
    const transport = Promise.resolve().then((): ProviderResult<unknown> | Promise<ProviderResult<unknown>> => {
      // A delayed microtask must not dispatch after the fixed lease/window.
      const dispatchNow = this.now();
      if (remainingBudget() <= 0 || !Number.isFinite(dispatchNow) ||
          dispatchNow < Date.parse(claim.creationStartedAt!) || dispatchNow >= deadline) {
        return { ok: false, code: "REJECTED", message: "Provider processing remains held.", retryable: false };
      }
      return claim.nextAction === "create"
        ? source.create({ body, idempotencyKey: claim.creationKey, signal: controller.signal })
        : source.retrieve({ body, providerPaymentId: claim.providerPaymentId!, providerSessionId: claim.providerSessionId,
          signal: controller.signal });
    });
    const transportSettled = () => { if (timer !== undefined) clearTimeout(timer); };
    const persistTransport = (result: Result) => {
      const appended = this.append(claim, result);
      if (!timeoutCommit) return appended;
      // Once the timeout path starts, a late object cannot outrun its durable
      // unknown receipt. Its independent append may fail; the committed hold
      // is still the response and no background rejection is left unhandled.
      void appended.catch(() => undefined);
      return timeoutCommit;
    };
    const completed = transport.then((response) => {
      transportSettled();
      let result: Result;
      try { result = normalize(response); } catch { result = unknown("invalid_response"); }
      return persistTransport(result);
    }, () => { transportSettled(); return persistTransport(unknown("transport_uncertain")); });
    const timedOut = new Promise<AssistedProviderExecutionReceipt>((resolve, reject) => {
      timer = setTimeout(() => {
        timeoutCommit = this.append(claim, unknown("transport_uncertain"));
        controller.abort();
        timeoutCommit.then(resolve, reject);
      }, Math.min(this.timeoutMs, remaining));
    });
    try {
      // Promise.race installs rejection handlers on late completion as well.
      // A failed append never acknowledges the provider result; existing holds
      // remain and no raw provider/database error is logged or returned.
      return await Promise.race([completed, timedOut]);
    } catch {
      throw unavailable();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private contextMatches(context: Context, requestId: string, attemptId: string): boolean {
    const source = this.source!;
    if (context.requestId !== requestId || context.attemptId !== attemptId || context.sourceId !== source.sourceId ||
        context.adapterRevision !== source.adapterRevision || !sameScope(context.scope, source.scope) ||
        context.policyRevision !== source.policy.revision || context.replayGuarantee !== source.policy.replayGuarantee ||
        context.createReplaySeconds !== source.policy.createReplaySeconds ||
        (context.creationStartedAt === null) !== (context.creationReplayUntil === null) ||
        (context.providerPaymentId === null && context.providerSessionId !== null) ||
        (context.nextAction === "retrieve" && context.providerPaymentId === null) ||
        (context.nextAction === "create" && context.providerPaymentId !== null)) return false;
    return context.creationStartedAt === null || Date.parse(context.creationReplayUntil!) - Date.parse(context.creationStartedAt) ===
      context.createReplaySeconds * 1_000;
  }
  private sameTerms(context: Context, claim: Claim): boolean {
    return ["quoteId", "quoteVersion", "acceptanceId", "expectedAmountCents", "currency", "creationKey"].every((key) =>
      context[key as keyof Context] === claim[key as keyof Claim]) &&
      (context.providerPaymentId === null || context.providerPaymentId === claim.providerPaymentId) &&
      (context.providerSessionId === null || context.providerSessionId === claim.providerSessionId) &&
      (context.creationStartedAt === null || (context.creationStartedAt === claim.creationStartedAt && context.creationReplayUntil === claim.creationReplayUntil));
  }
  private async append(claim: Claim, result: Result): Promise<AssistedProviderExecutionReceipt> {
    const source = this.source!;
    let raw: unknown;
    try {
      raw = assertRpc(await this.rpc.rpc("research_assisted_order_provider_create_result_append", {
        p_claim_id: claim.claimId, p_source_id: source.sourceId, p_adapter_revision: source.adapterRevision,
        p_expected_scope: source.scope, p_policy_revision: source.policy.revision, p_result: result,
      }));
    } catch { throw unavailable(); }
    const parsed = resultReceiptSchema.safeParse(raw);
    if (!parsed.success) throw unavailable();
    const receipt = parsed.data;
    if (receipt.claimId !== claim.claimId || receipt.attemptId !== claim.attemptId || receipt.requestId !== claim.requestId ||
        (receipt.providerPaymentId === null && receipt.providerSessionId !== null)) throw unavailable();
    if (receipt.classification === "bound") {
      if (receipt.reason !== "exact_binding" || result.outcome !== "object" || result.provider !== source.scope.provider ||
          result.accountId !== source.scope.accountId || result.mode !== source.scope.mode || result.requestId !== claim.requestId ||
          result.attemptId !== claim.attemptId || result.quoteId !== claim.quoteId || result.quoteVersion !== claim.quoteVersion ||
          result.acceptanceId !== claim.acceptanceId || result.observedAmountCents !== claim.expectedAmountCents || result.currency !== claim.currency ||
          receipt.providerPaymentId !== result.providerPaymentId || receipt.providerSessionId !== result.providerSessionId ||
          (claim.providerPaymentId !== null && (result.providerPaymentId !== claim.providerPaymentId ||
            (claim.providerSessionId !== null && result.providerSessionId !== claim.providerSessionId)))) {
        throw unavailable();
      }
    } else if (receipt.reason === "exact_binding" ||
        (receipt.classification === "unknown" && result.outcome !== "unknown")) throw unavailable();
    return publicReceipt(claim, receipt.classification === "bound" ? "recorded" : "reconciliation_required", receipt.replayed);
  }
}

export function buildAssistedProviderExecution(input: Readonly<{
  enabled: boolean; rpc: SupabaseRpcClient | null; source: AssistedProviderExecutionSource | null;
}>): AssistedProviderExecutionService | null {
  return input.enabled && input.rpc && validSource(input.source)
    ? new AssistedProviderExecutionService(input.rpc, input.source) : null;
}
