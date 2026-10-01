import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssistedOrderDispositionReceipt } from "../../../shared/research/assisted-order/financial-disposition";
import { AssistedOrderValidationError } from "../../../shared/research/assisted-order/contract";
import type { AssistedOrderViewer } from "./ports";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, AssistedOrderNotFoundError } from "./service";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "./supabase-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid = z.string().regex(UUID);
const sourceNamespace = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const text = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const timestamp = z.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)));
const canonicalTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const contextSchema = z.object({
  schemaVersion: z.literal("assisted_order_no_funds_context_v1"),
  requestId: uuid, publicReference: z.string().regex(/^XRR-\d{8}-[0-9A-F]{10}$/),
  fromStatus: z.enum(["reviewing", "payment_pending", "payment_review"]),
  quoteId: uuid, quoteVersion: z.number().int().positive(), acceptanceId: uuid,
  totalCents: cents, currency: z.literal("USD"), graphFingerprint: fingerprint,
  observations: z.array(z.object({
    observationId: uuid, quoteId: uuid, method: z.literal("manual"),
    paymentReference: text(80), sourceEvidenceRef: text(160), observedAmountCents: cents,
    observedCurrency: z.string().regex(/^[A-Z]{3}$/), observedAt: timestamp, recordedAt: timestamp,
    observedByAuthUserId: uuid.nullable(),
  }).strict()).max(100),
  corrections: z.array(z.object({
    observationId: uuid, replacementId: uuid, reason: text(1000), correctedBy: uuid, correctedAt: timestamp,
  }).strict()).max(100),
  existingDispositionId: uuid.nullable(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.observations.map((row) => row.observationId));
  const edges = new Map(value.corrections.map((row) => [row.observationId, row.replacementId]));
  const malformed = ids.size !== value.observations.length ||
    value.observations.some((row) => row.quoteId !== value.quoteId) ||
    edges.size !== value.corrections.length ||
    new Set(value.corrections.map((row) => row.replacementId)).size !== value.corrections.length ||
    value.corrections.some((row) => !ids.has(row.observationId) || !ids.has(row.replacementId));
  let cycle = false;
  for (const start of edges.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined) {
      if (visited.has(current)) { cycle = true; break; }
      visited.add(current);
      current = edges.get(current);
    }
  }
  if (malformed || cycle) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid financial graph" });
});

export type AssistedOrderNoFundsContext = z.infer<typeof contextSchema>;
const sourceReceiptSchema = z.object({
  schemaVersion: z.literal("assisted_order_no_funds_receipt_v1"),
  sourceNamespace, sourceReceiptId: text(160),
  requestId: uuid, quoteId: uuid, graphFingerprint: fingerprint,
  outcome: z.literal("never_received"), finality: z.literal("terminal"), checkedAt: canonicalTimestamp,
}).strict();
export type AssistedOrderNoFundsSourceReceipt = Readonly<z.infer<typeof sourceReceiptSchema>>;

/** Independent immutable source evidence, not a browser assertion or balance. */
export type AssistedOrderNoFundsEvidenceAuthority = Readonly<{
  /** Configured server-side, never selected by the browser or a source result. */
  sourceNamespace: string;
  resolve(input: Readonly<{
    context: AssistedOrderNoFundsContext;
    evidenceHandle: string;
    actorAuthUserId: string;
    signal: AbortSignal;
  }>): Promise<AssistedOrderNoFundsSourceReceipt | null>;
}>;

const commitSchema = z.object({
  dispositionId: uuid, requestId: uuid, quoteId: uuid, graphFingerprint: fingerprint,
  kind: z.literal("no_funds"), state: z.literal("cancelled"),
  resolvedAt: canonicalTimestamp, resolvedBy: text(512), replayed: z.boolean(),
}).strict();
const commandSchema = z.object({ evidenceHandle: text(160), intent: z.literal("cancel") }).strict();
const SOURCE_TIMEOUT_MS = 5_000;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function conflict(code: string, message = "The financial disposition remains on hold."): never {
  throw new AssistedOrderConflictError(code, message);
}
function rpcError(response: SupabaseRpcResponse): void {
  const error = response.error;
  if (!error) return;
  if (error.details === "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED") throw new AssistedOrderAuthorizationError();
  if (error.code === "PGRST202") conflict("financial_disposition_not_ready");
  if (error.code === "P0001" || error.code === "23505") {
    conflict(error.details === "ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE"
      ? "financial_disposition_stale" : "financial_disposition_refused");
  }
  throw new Error("Financial disposition authority unavailable");
}

export class AssistedOrderDispositionService {
  constructor(private readonly rpc: SupabaseRpcClient, private readonly evidence: AssistedOrderNoFundsEvidenceAuthority | null) {}

  async cancelWithNoFunds(viewer: AssistedOrderViewer, requestId: string, input: unknown): Promise<AssistedOrderDispositionReceipt> {
    // This UUID is stamped by the existing verified admin guard. A capability,
    // label, body field or status credential alone cannot become a scoped grant.
    if (viewer.actorType !== "admin" || !viewer.capabilities.has("assisted_orders:manage") ||
        typeof viewer.authUserId !== "string" || !UUID.test(viewer.authUserId.toLowerCase())) throw new AssistedOrderAuthorizationError();
    const actorId = viewer.authUserId.toLowerCase();
    const command = commandSchema.safeParse(input);
    if (!command.success) throw new AssistedOrderValidationError("disposition", "An evidence handle and explicit cancellation intent are required.");
    if (typeof requestId !== "string" || !UUID.test(requestId.toLowerCase())) throw new AssistedOrderValidationError("requestId", "A valid request is required.");
    if (!this.evidence) conflict("financial_disposition_evidence_unavailable", "Independent no-funds evidence is not configured.");
    const configuredSource = sourceNamespace.safeParse(this.evidence.sourceNamespace);
    if (!configuredSource.success) conflict("financial_disposition_evidence_unavailable");
    const canonicalRequest = requestId.toLowerCase();
    const response = await this.rpc.rpc("research_assisted_order_disposition_context", {
      p_request_id: canonicalRequest, p_actor_auth_user_id: actorId, p_source_namespace: configuredSource.data,
    });
    rpcError(response); // The SQL scoped grant is checked before source access.
    if (response.data === null) throw new AssistedOrderNotFoundError();
    const parsed = contextSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.requestId !== canonicalRequest) throw new Error("Financial disposition context unavailable");
    const context = freeze(parsed.data);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raw: unknown;
    try {
      raw = await Promise.race([
        this.evidence.resolve({ context, evidenceHandle: command.data.evidenceHandle, actorAuthUserId: actorId, signal: controller.signal }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("source timeout")); }, SOURCE_TIMEOUT_MS); }),
      ]);
    } catch {
      conflict("financial_disposition_evidence_unavailable");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const source = sourceReceiptSchema.safeParse(raw);
    if (!source.success || source.data.sourceNamespace !== configuredSource.data ||
        source.data.requestId !== canonicalRequest || source.data.quoteId !== context.quoteId ||
        source.data.graphFingerprint !== context.graphFingerprint) conflict("financial_disposition_evidence_unverified");
    const receipt = freeze(source.data);
    const idempotencyKey = createHash("sha256").update(JSON.stringify([
      "assisted-order-no-funds:v1", receipt.sourceNamespace, receipt.sourceReceiptId, canonicalRequest, context.graphFingerprint,
    ])).digest("hex");
    const committed = await this.rpc.rpc("research_assisted_order_disposition_commit_cancel", {
      p_request_id: canonicalRequest, p_quote_id: context.quoteId, p_expected_graph_fingerprint: context.graphFingerprint,
      p_actor_auth_user_id: actorId, p_idempotency_key: idempotencyKey, p_intent: "cancel", p_receipt: receipt,
    });
    rpcError(committed);
    const result = commitSchema.safeParse(committed.data);
    if (!result.success || result.data.requestId !== canonicalRequest || result.data.quoteId !== context.quoteId ||
        result.data.graphFingerprint !== context.graphFingerprint ||
        (context.existingDispositionId !== null && result.data.dispositionId !== context.existingDispositionId)) {
      throw new Error("Financial disposition receipt unavailable");
    }
    const { dispositionId, kind, state, resolvedAt, replayed } = result.data;
    return Object.freeze({ dispositionId, requestId: canonicalRequest, kind, state, resolvedAt, replayed });
  }
}
