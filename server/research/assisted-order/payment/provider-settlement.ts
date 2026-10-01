import { z } from "zod";
import { AssistedOrderValidationError } from "../../../../shared/research/assisted-order/contract";
import type { AssistedOrderViewer } from "../ports";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, AssistedOrderNotFoundError } from "../service";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "../supabase-repository";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const namespace = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const identifier = z.string().min(1).max(160).refine((value) =>
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const actorLabel = z.string().min(1).max(512).refine((value) =>
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const sourceSchema = z.object({ sourceId: namespace, adapterRevision: namespace,
  scope: z.object({ provider: namespace, accountId: identifier, mode: z.enum(["test", "live"]) }).strict(),
  policyRevision: namespace }).strict();
const commandSchema = z.object({}).strict();
const authoritySchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_settlement_v1"),
  transactionIsolation: z.literal("read_committed_only"),
  settlementPolicy: z.literal("separate_scoped_admin_capture_v1"),
  effectsPolicy: z.literal("canonical_verification_outbox_admin_v2"),
  eligibilityPolicy: z.literal("reviewed_lineage_no_new_facts_v1"), historicalAdoption: z.literal(false),
}).strict();
const receiptSchema = z.object({
  schemaVersion: z.literal("assisted_order_provider_settlement_receipt_v1"),
  settlementId: uuid, requestId: uuid, journalId: uuid, attemptId: uuid,
  sourceId: namespace, adapterRevision: namespace, policyRevision: namespace,
  quoteId: uuid, quoteVersion: z.number().int().positive().max(2_147_483_647), acceptanceId: uuid,
  verificationId: uuid, verifiedAt: instant, verifiedBy: actorLabel, state: z.literal("verified"), replayed: z.boolean(),
}).strict();

/** Server-only reviewed source/policy selection, never a browser claim. */
export type AssistedProviderSettlementSource = Readonly<z.infer<typeof sourceSchema>>;
/** A recorded verification receipt is NOT a claim of current fulfillment eligibility. */
export type AssistedProviderSettlementReceipt = Readonly<Pick<z.infer<typeof receiptSchema>,
  "schemaVersion" | "settlementId" | "requestId" | "journalId" | "verificationId" | "verifiedAt" | "state" | "replayed">>;

const unavailable = () => new AssistedOrderConflictError("provider_settlement_unavailable", "Provider payment settlement remains on hold.");
async function readRpc(rpc: SupabaseRpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  let response: SupabaseRpcResponse;
  try { response = await rpc.rpc(name, args); } catch { throw unavailable(); }
  if (!response || typeof response !== "object") throw unavailable();
  if (response.error) {
    if (response.error.code === "P0001" && response.error.details === "ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED") {
      throw new AssistedOrderAuthorizationError();
    }
    throw unavailable();
  }
  return response.data;
}

/**
 * An explicit, verified admin command selects one already authenticated,
 * durable captured journal entry. SQL independently checks its complete
 * source, scope, grant, quote, acceptance and financial graph, then atomically
 * writes the canonical observation, verification, paid event and held outbox.
 * No callback impersonates an admin; no provider call or evidence fabrication
 * occurs here. The composition remains disabled with a null source.
 */
export class AssistedProviderSettlementService {
  private readonly source: AssistedProviderSettlementSource | null;
  constructor(private readonly rpc: SupabaseRpcClient, source: AssistedProviderSettlementSource | null) {
    const parsed = sourceSchema.safeParse(source);
    this.source = parsed.success ? Object.freeze({ ...parsed.data, scope: Object.freeze(parsed.data.scope) }) : null;
  }

  async settle(viewer: AssistedOrderViewer, requestId: string, journalId: string, input: unknown): Promise<AssistedProviderSettlementReceipt> {
    if (viewer.actorType !== "admin" || !viewer.capabilities.has("assisted_orders:manage") || !uuid.safeParse(viewer.authUserId).success) {
      throw new AssistedOrderAuthorizationError();
    }
    if (!uuid.safeParse(requestId).success || !uuid.safeParse(journalId).success || !commandSchema.safeParse(input).success) {
      throw new AssistedOrderValidationError("providerSettlement", "An existing provider event and an empty command are required.");
    }
    const source = this.source;
    if (!source) throw unavailable();
    const authority = await readRpc(this.rpc, "research_assisted_order_provider_settlement_authority");
    if (!authoritySchema.safeParse(authority).success) throw unavailable();
    const raw = await readRpc(this.rpc, "research_assisted_order_provider_settlement_commit", {
      p_request_id: requestId, p_journal_id: journalId, p_source_id: source.sourceId,
      p_adapter_revision: source.adapterRevision, p_expected_scope: source.scope,
      p_policy_revision: source.policyRevision, p_actor_auth_user_id: viewer.authUserId,
    });
    if (raw === null) throw new AssistedOrderNotFoundError();
    const parsed = receiptSchema.safeParse(raw);
    if (!parsed.success || parsed.data.requestId !== requestId || parsed.data.journalId !== journalId ||
        parsed.data.sourceId !== source.sourceId || parsed.data.adapterRevision !== source.adapterRevision ||
        parsed.data.policyRevision !== source.policyRevision) throw unavailable();
    const receipt = parsed.data;
    // Do not expose actor labels, provider account/source/policy identifiers,
    // amounts or raw evidence. HTTP uses these two canonical IDs for F4 recovery.
    return Object.freeze({ schemaVersion: receipt.schemaVersion, settlementId: receipt.settlementId,
      requestId: receipt.requestId, journalId: receipt.journalId, verificationId: receipt.verificationId,
      verifiedAt: receipt.verifiedAt, state: receipt.state, replayed: receipt.replayed });
  }
}

export function buildAssistedProviderSettlement(input: Readonly<{
  enabled: boolean; rpc: SupabaseRpcClient | null; source: AssistedProviderSettlementSource | null;
}>): AssistedProviderSettlementService | null {
  return input.enabled && input.rpc && sourceSchema.safeParse(input.source).success
    ? new AssistedProviderSettlementService(input.rpc, input.source) : null;
}
