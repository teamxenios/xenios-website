// Receipt reconciliation over the canonical records. This module neither
// resolves credentials nor imports the outbox, checkout or server root.
//
// Two adapters share ONE reader (committedReads below):
//   * createReceiptRepairPreview: read-only. It cannot write, and refuses any
//     mode but preview. Unchanged in behavior.
//   * createReceiptQueue: disabled by default. Writes only through an injected
//     canonical enqueue, and only under an explicit approval naming the cutoff,
//     the audience, and the reviewed receipt identity policy.
import { ORDER_STATES } from "@shared/research/commerce";
import {
  createReceiptRepair,
  formatUsdCents,
  receiptEventKey,
  RECEIPT_EVENT_TYPE,
  RECEIPT_TEMPLATE_KEY,
  type ReceiptEnqueueInput,
  type ReceiptEnqueueOutcome,
  type CommittedCursor,
  type CommittedExecutionFacts,
  type QueuedEventFacts,
  type ReceiptOrderFacts,
} from "./receipt-repair";

export const RECEIPT_PREVIEW_ORIGIN = "https://xeniostechnology.com";
export const RECEIPT_PREVIEW_ORDER_PATH = "/research/member/orders/";

type Table = "research_checkout_executions" | "research_orders" | "research_members" | "research_notification_outbox";
export interface ReceiptPreviewReadQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: string): ReceiptPreviewReadQuery;
  or(filter: string): ReceiptPreviewReadQuery;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): ReceiptPreviewReadQuery;
  limit(value: number): ReceiptPreviewReadQuery;
}
/** Only read vocabulary is available, even to an accidentally changed caller. */
export interface ReceiptPreviewReadClient {
  from(table: Table): { select(columns: string): ReceiptPreviewReadQuery };
}
export interface ReceiptPreviewInput {
  client: ReceiptPreviewReadClient;
  eligibleAfter: Date;
  siteOrigin: string;
  mode?: "preview" | "queue";
}
export interface ReceiptPreviewOptions { limit?: number; cursor?: CommittedCursor | null }
export interface ReceiptPreviewReport {
  mode: "preview";
  considered: number;
  previewed: number;
  alreadyPresent: number;
  beforeCutoff: number;
  refused: number;
  queued: 0;
  cursor: CommittedCursor | null;
}

type FailureCode = "preview_only" | "invalid_cutoff" | "invalid_origin" | "invalid_client"
  | "invalid_options" | "invalid_limit" | "invalid_cursor" | "source_read_failed"
  | "source_projection_invalid" | "source_identity_mismatch" | "source_order_invalid"
  | "preview_write_forbidden";
export class ReceiptPreviewFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
    this.name = "ReceiptPreviewFailure";
  }
}
function requireFact(value: unknown, code: FailureCode): asserts value {
  if (!value) throw new ReceiptPreviewFailure(code);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireFact(isObject(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)), "source_projection_invalid");
  return value;
}
function integer(value: unknown, minimum = 0): number {
  requireFact(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum, "source_projection_invalid");
  return value;
}
function reference(value: unknown): string | null {
  requireFact(value === null || typeof value === "string" && value.length > 0 && value.length <= 512
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value), "source_projection_invalid");
  return value;
}
function email(value: unknown): string {
  requireFact(typeof value === "string" && value.length <= 320
    && /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(value), "source_projection_invalid");
  return value;
}

/** Keep the original PostgREST literal. Date round-tripping loses microseconds,
 * so compare the complete instant separately in bigint microseconds. The
 * restricted grammar also makes cursor interpolation into `.or` non-ambient. */
function instant(value: unknown, code: FailureCode): { literal: string; micros: bigint } {
  requireFact(typeof value === "string", code);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireFact(m, code);
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  requireFact(year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31
    && hour <= 23 && minute <= 59 && second <= 59, code);
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(epoch);
  requireFact(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, code);
  const zone = m[8]!;
  const zoneHours = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const zoneMinutes = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  requireFact(zoneHours <= 14 && zoneMinutes <= 59 && (zoneHours !== 14 || zoneMinutes === 0), code);
  const offset = (zoneHours * 60 + zoneMinutes) * (zone.startsWith("-") ? -1 : 1);
  const micros = BigInt(epoch) * 1000n - BigInt(offset) * 60_000_000n + BigInt((m[7] ?? "").padEnd(6, "0"));
  return { literal: value, micros };
}
function position(value: unknown): CommittedCursor | null {
  if (value === undefined || value === null) return null;
  requireFact(isObject(value) && Object.keys(value).length === 2 && isUuid(value.executionId), "invalid_cursor");
  const at = instant(value.committedAt, "invalid_cursor");
  return { committedAt: at.literal, executionId: value.executionId };
}
const executionKeys = ["id", "member_id", "order_id", "phase", "amount_cents", "currency", "provider_reference", "committed_at"] as const;
const orderKeys = ["id", "member_id", "state", "payment_reference", "captured_amount_cents", "refunded_cents"] as const;
const eventKeys = ["event_key", "event_type", "template_key", "recipient", "payload"] as const;
const orderUrl = (id: string) => `${RECEIPT_PREVIEW_ORIGIN}${RECEIPT_PREVIEW_ORDER_PATH}${id}`;

/**
 * The reviewed receipt identity policy.
 *
 * The outbox deduplicates on the event key alone, so any other lane that had
 * already told a customer about the same payment under a different key would
 * produce a second receipt. Reviewed against the code: no commerce module
 * enqueues any notification for a research_orders id; the Early Access
 * payment-verified event keys on an Early Access settlement identity, and the
 * founding-membership receipt on a membership subject. Neither is this identity
 * domain, so the reviewed alias list is EMPTY. That is a decision with evidence,
 * distinct from an unchecked default, and a queue refuses any other policy.
 */
export const RECEIPT_IDENTITY_POLICY = Object.freeze({
  version: "commerce-receipt-identity-v1" as const,
  priorAliases: "reviewed_none" as const,
});
export type ReceiptIdentityPolicy = { version: "commerce-receipt-identity-v1"; priorAliases: "reviewed_none" };
const reviewedPriorAliases = (_orderId: string): readonly string[] => [];

async function rowsFrom(build: () => ReceiptPreviewReadQuery): Promise<unknown[]> {
  let response: unknown;
  try { response = await build(); } catch { throw new ReceiptPreviewFailure("source_read_failed"); }
  requireFact(isObject(response) && response.error === null && Array.isArray(response.data), "source_read_failed");
  return response.data;
}
async function singleFrom(build: () => ReceiptPreviewReadQuery): Promise<unknown | null> {
  const result = await rowsFrom(build);
  requireFact(result.length <= 1, "source_projection_invalid");
  return result.length === 0 ? null : result[0];
}

/**
 * The one reader: committed executions by exact-microsecond keyset, then the
 * canonical order, the member's address and any existing outbox row, each bound
 * to the identities this pass actually listed. Each call owns its own bindings,
 * so overlapping passes cannot borrow each other's rows.
 */
function committedReads(client: ReceiptPreviewReadClient, limit: number) {
  const orders = new Map<string, CommittedExecutionFacts>();
  const members = new Set<string>();
  const recipients = new Map<string, string>();
  return {
    memberOf: (orderId: string) => orders.get(orderId)?.memberId,
    async listCommitted(request: { limit: number; after?: CommittedCursor | null }) {
      requireFact(request.limit === limit, "invalid_limit");
      const cursor = position(request.after);
      const batch = await rowsFrom(() => {
        let query = client.from("research_checkout_executions").select(executionKeys.join(","))
          .eq("phase", "committed")
          .order("committed_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true });
        if (cursor) query = query.or(`committed_at.gt.${cursor.committedAt},and(committed_at.eq.${cursor.committedAt},id.gt.${cursor.executionId})`);
        return query.limit(limit);
      });
      requireFact(batch.length <= limit, "source_projection_invalid");
      let previous = cursor ? { micros: instant(cursor.committedAt, "invalid_cursor").micros, id: cursor.executionId } : null;
      const seen = new Set<string>();
      const facts = batch.map(value => {
        const row = exactObject(value, executionKeys);
        requireFact(isUuid(row.id) && isUuid(row.order_id) && isUuid(row.member_id), "source_projection_invalid");
        requireFact(row.phase === "committed" && row.currency === "usd", "source_projection_invalid");
        const at = instant(row.committed_at, "source_projection_invalid");
        requireFact(!seen.has(row.id) && !orders.has(row.order_id), "source_order_invalid");
        requireFact(!previous || at.micros > previous.micros || at.micros === previous.micros && row.id > previous.id, "source_order_invalid");
        const providerReference = reference(row.provider_reference);
        requireFact(providerReference !== null, "source_projection_invalid");
        const fact: CommittedExecutionFacts = { executionId: row.id, orderId: row.order_id, memberId: row.member_id,
          amountCents: integer(row.amount_cents, 1), currency: "usd", providerReference, committedAt: at.literal };
        previous = { micros: at.micros, id: row.id }; seen.add(row.id); orders.set(row.order_id, fact); members.add(row.member_id);
        return fact;
      });
      return facts;
    },
    async readOrder(id: string): Promise<ReceiptOrderFacts | null> {
      const expected = orders.get(id);
      requireFact(expected && isUuid(id), "source_identity_mismatch");
      const value = await singleFrom(() => client.from("research_orders").select(orderKeys.join(",")).eq("id", id).limit(2));
      if (value === null) return null;
      const row = exactObject(value, orderKeys);
      requireFact(row.id === id && row.member_id === expected.memberId, "source_identity_mismatch");
      requireFact(typeof row.state === "string" && (ORDER_STATES as readonly string[]).includes(row.state), "source_projection_invalid");
      const captured = row.captured_amount_cents === null ? undefined : integer(row.captured_amount_cents);
      const refunded = row.refunded_cents === null ? undefined : integer(row.refunded_cents);
      requireFact(captured === undefined || refunded === undefined || refunded <= captured, "source_projection_invalid");
      return { orderId: id, memberId: expected.memberId, state: row.state, providerReference: reference(row.payment_reference),
        ...(captured !== undefined ? { capturedAmountCents: captured } : {}), ...(refunded !== undefined ? { refundedCents: refunded } : {}) };
    },
    async recipientFor(id: string) {
      requireFact(members.has(id) && isUuid(id), "source_identity_mismatch");
      const value = await singleFrom(() => client.from("research_members").select("id,email").eq("id", id).limit(2));
      if (value === null) return null;
      const row = exactObject(value, ["id", "email"]);
      requireFact(row.id === id, "source_identity_mismatch");
      const recipient = email(row.email); recipients.set(id, recipient); return recipient;
    },
    async findQueuedEvent(key: string): Promise<QueuedEventFacts | null> {
      const expected = [...orders.values()].find(fact => receiptEventKey(fact.orderId) === key);
      requireFact(expected, "source_identity_mismatch");
      const value = await singleFrom(() => client.from("research_notification_outbox").select(eventKeys.join(",")).eq("event_key", key).limit(2));
      if (value === null) return null;
      const row = exactObject(value, eventKeys);
      requireFact(row.event_key === key && row.event_type === RECEIPT_EVENT_TYPE && row.template_key === RECEIPT_TEMPLATE_KEY,
        "source_identity_mismatch");
      const recipient = email(row.recipient);
      requireFact(recipient === recipients.get(expected.memberId), "source_identity_mismatch");
      const payload = exactObject(row.payload, ["orderReference", "totalCents", "totalFormatted", "orderUrl"]);
      requireFact(payload.orderReference === expected.orderId && integer(payload.totalCents) === expected.amountCents
        && payload.totalFormatted === formatUsdCents(expected.amountCents) && payload.orderUrl === orderUrl(expected.orderId), "source_identity_mismatch");
      return { eventKey: key, eventType: RECEIPT_EVENT_TYPE, templateKey: RECEIPT_TEMPLATE_KEY, recipient, payload: { ...payload } };
    },
  };
}

function checkedOptions(options: ReceiptPreviewOptions): { limit: number; after: CommittedCursor | null } {
  requireFact(isObject(options) && Object.keys(options).every(key => key === "limit" || key === "cursor"), "invalid_options");
  const limit = options.limit === undefined ? 50 : options.limit;
  requireFact(typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, "invalid_limit");
  return { limit, after: position(options.cursor) };
}

/** No constructor or import performs a read. */
export function createReceiptRepairPreview(input: ReceiptPreviewInput) {
  requireFact(isObject(input) && (input.mode === undefined || input.mode === "preview"), "preview_only");
  requireFact(input.eligibleAfter instanceof Date && Number.isFinite(input.eligibleAfter.getTime()), "invalid_cutoff");
  const cutoff = new Date(input.eligibleAfter.getTime());
  instant(cutoff.toISOString(), "invalid_cutoff");
  requireFact(input.siteOrigin === RECEIPT_PREVIEW_ORIGIN, "invalid_origin");
  requireFact(input.client && typeof input.client.from === "function", "invalid_client");
  const client = input.client;

  return {
    async repair(options: ReceiptPreviewOptions = {}): Promise<ReceiptPreviewReport> {
      const { limit, after } = checkedOptions(options);
      const reads = committedReads(client, limit);
      let unexpectedWrite = false;
      const repair = createReceiptRepair({
        mode: "preview", eligibleAfter: cutoff, orderUrl,
        priorEventKeys: reviewedPriorAliases,
        listCommitted: reads.listCommitted,
        readOrder: reads.readOrder,
        recipientFor: reads.recipientFor,
        findQueuedEvent: reads.findQueuedEvent,
        async enqueueOnce() { unexpectedWrite = true; throw new ReceiptPreviewFailure("preview_write_forbidden"); },
      });
      const report = await repair.repair({ limit, cursor: after });
      requireFact(!unexpectedWrite && report.queued === 0, "preview_write_forbidden");
      return { mode: "preview", considered: report.considered, previewed: report.previewed, alreadyPresent: report.alreadyPresent,
        beforeCutoff: report.entries.filter(entry => entry.code === "before_cutoff").length, refused: report.refused.length, queued: 0,
        cursor: report.cursor ? { ...report.cursor } : null };
    },
  };
}

// ---------------------------------------------------------------------------
// Queue mode. Disabled by default, and unavailable without an approval.
// ---------------------------------------------------------------------------

/**
 * What a queue run needs approved. A queue insertion can cause a real email
 * through the existing dispatcher, so every field here is a communication
 * decision: which payments, from when, to whom, under which identity policy.
 */
export interface ReceiptQueueApproval {
  /** Digest of the recorded communication approval this run acts under. */
  approvalSha256: string;
  /** Payments committed before this instant are never queued. */
  eligibleAfter: Date;
  /** The approval stops covering writes at this instant, mid-pass included. */
  expiresAt: Date;
  audience: "all_committed_after_cutoff" | { memberIds: readonly string[] };
  identityPolicy: ReceiptIdentityPolicy;
}

export interface ReceiptQueueInput {
  enabled?: boolean;
  client: ReceiptPreviewReadClient;
  siteOrigin: string;
  approval: ReceiptQueueApproval | null;
  /** The canonical enqueueNotificationOnce. The outbox stays the only queue. */
  enqueue(input: ReceiptEnqueueInput): Promise<ReceiptEnqueueOutcome>;
  now(): Date;
}

export type ReceiptQueueUnavailable =
  | "invalid_origin" | "invalid_client" | "approval_missing" | "approval_invalid"
  | "approval_expired" | "identity_policy_unreviewed" | "audience_invalid";

export type ReceiptQueueReport =
  | { mode: "queue"; status: "disabled" }
  | { mode: "queue"; status: "unavailable"; code: ReceiptQueueUnavailable }
  | { mode: "queue"; status: "ran"; considered: number; queued: number; alreadyPresent: number; beforeCutoff: number;
      outOfAudience: number; refused: number; cursor: CommittedCursor | null };

export function createReceiptQueue(input: ReceiptQueueInput) {
  return {
    async run(options: ReceiptPreviewOptions = {}): Promise<ReceiptQueueReport> {
      if (!isObject(input) || input.enabled !== true) return { mode: "queue", status: "disabled" };
      const refuse = (code: ReceiptQueueUnavailable): ReceiptQueueReport => ({ mode: "queue", status: "unavailable", code });
      if (input.siteOrigin !== RECEIPT_PREVIEW_ORIGIN) return refuse("invalid_origin");
      if (!input.client || typeof input.client.from !== "function" || typeof input.enqueue !== "function"
        || typeof input.now !== "function") return refuse("invalid_client");
      const approval = input.approval;
      if (approval === null || approval === undefined) return refuse("approval_missing");
      if (!isObject(approval) || typeof approval.approvalSha256 !== "string" || !/^[a-f0-9]{64}$/.test(approval.approvalSha256)
        || !(approval.eligibleAfter instanceof Date) || !Number.isFinite(approval.eligibleAfter.getTime())
        || !(approval.expiresAt instanceof Date) || !Number.isFinite(approval.expiresAt.getTime())) return refuse("approval_invalid");
      const policy: unknown = approval.identityPolicy;
      if (!isObject(policy) || Object.keys(policy).length !== 2 || policy.version !== RECEIPT_IDENTITY_POLICY.version
        || policy.priorAliases !== RECEIPT_IDENTITY_POLICY.priorAliases) return refuse("identity_policy_unreviewed");
      let audience: Set<string> | "all";
      if (approval.audience === "all_committed_after_cutoff") audience = "all";
      else if (isObject(approval.audience) && Array.isArray(approval.audience.memberIds)
        && approval.audience.memberIds.length >= 1 && approval.audience.memberIds.length <= 1000
        && approval.audience.memberIds.every(isUuid) && new Set(approval.audience.memberIds).size === approval.audience.memberIds.length) {
        audience = new Set(approval.audience.memberIds);
      } else return refuse("audience_invalid");
      const expiresAt = approval.expiresAt.getTime();
      const expired = () => {
        const at = input.now();
        return !(at instanceof Date) || !Number.isFinite(at.getTime()) || at.getTime() >= expiresAt;
      };
      if (expired()) return refuse("approval_expired");

      const { limit, after } = checkedOptions(options);
      const reads = committedReads(input.client, limit);
      const outside = new Set<string>();
      const repair = createReceiptRepair({
        mode: "queue",
        eligibleAfter: new Date(approval.eligibleAfter.getTime()),
        orderUrl,
        priorEventKeys: reviewedPriorAliases,
        listCommitted: reads.listCommitted,
        // Audience is enforced before the order is even read. The row is still
        // listed, so the cursor passes it rather than stalling on it.
        async readOrder(orderId) {
          const member = reads.memberOf(orderId);
          if (audience !== "all" && (member === undefined || !audience.has(member))) {
            outside.add(orderId);
            throw new ReceiptPreviewFailure("source_identity_mismatch");
          }
          return reads.readOrder(orderId);
        },
        recipientFor: reads.recipientFor,
        findQueuedEvent: reads.findQueuedEvent,
        async enqueueOnce(event) {
          // Re-checked at the write: an approval that expires mid-pass stops
          // covering the next insertion, and that order still owes a receipt.
          if (expired()) return "unavailable";
          if (event.eventType !== RECEIPT_EVENT_TYPE || event.templateKey !== RECEIPT_TEMPLATE_KEY
            || event.eventKey !== receiptEventKey(String(event.payload.orderReference))) return "unavailable";
          try {
            return await input.enqueue({ ...event, payload: { ...event.payload } });
          } catch {
            return "unavailable";
          }
        },
      });
      const report = await repair.repair({ limit, cursor: after });
      const isOutside = (entry: { orderId: string }) => outside.has(entry.orderId);
      return {
        mode: "queue", status: "ran",
        considered: report.considered,
        queued: report.queued,
        alreadyPresent: report.alreadyPresent,
        beforeCutoff: report.entries.filter(entry => entry.code === "before_cutoff").length,
        outOfAudience: report.entries.filter(isOutside).length,
        refused: report.refused.filter(entry => !isOutside(entry)).length,
        cursor: report.cursor ? { ...report.cursor } : null,
      };
    },
  };
}
