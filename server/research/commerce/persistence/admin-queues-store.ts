// ---------------------------------------------------------------------------
// Persistent admin review queues for commerce (Track B, wave 17).
//
// This store serves the routes dependency `adminQueues.commerce()` with the
// ten commerce queue kinds. It follows the same posture as the member-platform
// admin queues (server/research/admin-queues.ts): reads are DEFENSIVE (a table
// another wave owns that does not exist yet reads as an empty queue, never a
// 500), writes are LOUD (an admin flag that vanishes silently is the worse
// failure), and summaries are built from an ALLOWLIST of fields. No recipient
// name, no address, no phone, no health data, no assessment or Blueprint
// content ever enters a queue item.
//
// WHERE EACH QUEUE'S OPEN STATE LIVES. Most kinds have no table of their own,
// because the schema already encodes their open state in the owning domain
// table (the partial indexes in migrations 21, 22, 25, and 26 exist exactly
// for these scans). Deriving the read from the owning table means the queue
// can never disagree with the domain, and CANNOT BE DISMISSED AROUND: a
// derived item leaves the queue only when the owning table changes, which only
// the owning domain's own guarded action can do.
//
//   large_order_review       DERIVED research_orders, state manual_review
//                            (research_orders_review_idx). Resolution is the
//                            orders domain's approve or cancel transition,
//                            recorded append-only in research_order_state_events.
//   refund_review            DERIVED research_claims, open states, resolution
//                            refund or partial_refund (money about to move).
//   replacement_review       DERIVED research_claims, open states, resolution
//                            replacement (product about to ship again).
//                            An open claim with NO resolution yet is claim
//                            triage, which precedes this split; it reaches an
//                            admin through the claims surface, not by this
//                            store guessing which queue it will land in.
//   supplier_document_review DERIVED research_inventory_lots joined to
//                            research_lot_quality_documents: a live lot whose
//                            quality documents are missing or unconfirmed
//                            (lots default to quarantined until this passes).
//   inventory_release        DERIVED the same join: a quarantined or held lot
//                            whose documents ARE complete and whose excursion
//                            state does not block release, awaiting the human
//                            release decision.
//   fulfillment_failure      DERIVED research_fulfillment_orders, state
//                            rejected, exception, or on_hold
//                            (research_fulfillment_open_idx).
//   payout_review            DERIVED research_payout_batches, state built or
//                            failed (built and never sent, or sent and failed;
//                            both need a human before money moves again).
//   fraud_review             DERIVED research_store_credit_ledger, state
//                            fraud_flagged. There is NO API here or anywhere
//                            in this layer that marks a fraud or payment
//                            review satisfied; the flag leaves the queue only
//                            when the fraud domain reverses the entry.
//   recall_response          DERIVED research_inventory_lots, recalled true.
//                            The schema has no completion marker for the
//                            response work (tracing shipments, notifying), so
//                            this is the ONE kind whose derived items can be
//                            acknowledged here, by writing a resolution row
//                            that names the actor and the evidence. The lot
//                            row itself is never touched.
//   payment_review           QUEUED ONLY. No domain table encodes "a payment
//                            event needs human eyes", so the payment webhook
//                            and orders domains enqueue explicit items.
//
// THE PERSISTED QUEUE-ITEM TABLE. Explicit items (payment_review, manual
// escalations, recall acknowledgements) persist in research_admin_queue_items.
// KNOWN SCHEMA GAP: no migration provisions that table yet; the defensive read
// treats its absence as an empty queue, and enqueue or resolve against a
// missing table fails loudly rather than dropping admin work. A resolution is
// a terminal status transition stamped with actor and timestamp (guarded on
// status open, so two admins cannot both resolve one item), or, for a derived
// recall, a NEW resolved row. History is never deleted; there is no delete
// method in the port at all.
//
// Building this does NOT enable commerce. The store is an additive seam; the
// wiring that consumes it stays behind the default-false commerce flag.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

export const COMMERCE_QUEUE_KINDS = [
  "large_order_review",
  "payment_review",
  "refund_review",
  "replacement_review",
  "supplier_document_review",
  "inventory_release",
  "fulfillment_failure",
  "payout_review",
  "fraud_review",
  "recall_response",
] as const;

export type CommerceQueueKind = (typeof COMMERCE_QUEUE_KINDS)[number];

/** The one kind whose derived items may be acknowledged here (see header). */
export const ACKNOWLEDGEABLE_KINDS: readonly CommerceQueueKind[] = ["recall_response"];

export type QueueItemStatus = "open" | "resolved" | "dismissed";

export type QueueActorType = "admin" | "system";

/** A persisted queue item (the research_admin_queue_items shape, domain side). */
export interface AdminQueueItemRecord {
  id: string;
  kind: CommerceQueueKind;
  /** Stable pointer at the source, e.g. "order:<id>", "lot:<id>", "payment:<ref>". */
  sourceRef: string;
  /** Built from allowlisted fields only. Never free text from a member. */
  summary: string;
  status: QueueItemStatus;
  openedAt: string;
  openedByActorType: QueueActorType;
  openedByActorId: string | null;
  resolvedAt: string | null;
  resolvedByActorId: string | null;
  resolution: string | null;
}

/** One entry in a queue view, derived from a domain table or a persisted row. */
export interface CommerceQueueItem {
  kind: CommerceQueueKind;
  source: "derived" | "queued";
  sourceRef: string;
  openedAt: string;
  summary: string;
  /** Allowlisted identifiers, states, cents, and counts. Never PII. */
  detail: Record<string, unknown>;
}

export interface CommerceQueuesView {
  provisioned: boolean;
  queues: Array<{ kind: CommerceQueueKind; openCount: number; items: CommerceQueueItem[] }>;
}

export interface QueueResolution {
  status: "resolved" | "dismissed";
  resolution: string;
  actorId: string;
  at: Date;
}

export class QueueItemNotFound extends Error {
  constructor(itemId: string) {
    super(`No queue item ${itemId}.`);
    this.name = "QueueItemNotFound";
  }
}

export class QueueItemAlreadyResolved extends Error {
  constructor(itemId: string) {
    super(`Queue item ${itemId} was already resolved; a resolution happens once.`);
    this.name = "QueueItemAlreadyResolved";
  }
}

export class QueueKindNotAcknowledgeable extends Error {
  constructor(kind: CommerceQueueKind) {
    super(
      `The ${kind} queue derives its open state from the owning domain table; ` +
        `resolve it through that domain's own action, not by acknowledging it away here.`,
    );
    this.name = "QueueKindNotAcknowledgeable";
  }
}

export class QueueItemInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueItemInvalid";
  }
}

/**
 * The queue store port. There is deliberately no delete method and no way to
 * edit a resolved item, so the queue history is a permanent record of what was
 * flagged, who resolved it, and when.
 */
export interface AdminQueuesRepository {
  /** Insert one OPEN item. Resolved fields must be empty at enqueue. */
  enqueue(item: AdminQueueItemRecord): Promise<void>;
  /** Persisted items of one kind, open only by default, oldest first. */
  listByKind(kind: CommerceQueueKind, includeResolved?: boolean): Promise<readonly AdminQueueItemRecord[]>;
  /** Terminal status transition, guarded on status open. Actor and time stamped. */
  resolve(itemId: string, outcome: QueueResolution): Promise<AdminQueueItemRecord>;
  /**
   * Record that the response work for a DERIVED item is done, as a NEW resolved
   * row. Refused for every kind whose open state the owning domain table holds.
   */
  acknowledgeDerived(
    kind: CommerceQueueKind,
    sourceRef: string,
    outcome: QueueResolution & { id: string; summary: string },
  ): Promise<AdminQueueItemRecord>;
  /** The full ten-queue view the routes dependency serves. */
  commerce(): Promise<CommerceQueuesView>;
}

// ---------------------------------------------------------------------------
// Pure derivations, one per derived kind. Each takes only the columns it is
// allowed to see, so a PII column cannot even reach these functions' inputs.
// ---------------------------------------------------------------------------

export interface OrderReviewSourceRow {
  id: string;
  state: string;
  subtotal_cents: number;
  shipping_cents: number;
  store_credit_applied_cents: number;
  review_triggers: string[] | null;
  created_at: string;
}

/**
 * Orders held in manual_review. The summary and detail carry the GROSS order
 * value (subtotal plus shipping, BEFORE store credit), matching checkout.ts:
 * credit reduces what is charged, never whether the order is reviewed, so the
 * number an admin sees here is the number the review threshold was applied to.
 */
export function deriveLargeOrderReview(rows: readonly OrderReviewSourceRow[]): CommerceQueueItem[] {
  return rows
    .filter((row) => row.state === "manual_review")
    .map((row) => {
      const grossCents = row.subtotal_cents + row.shipping_cents;
      return {
        kind: "large_order_review" as const,
        source: "derived" as const,
        sourceRef: `order:${row.id}`,
        openedAt: row.created_at,
        summary: `Order held for review at gross value ${grossCents} cents (before store credit).`,
        detail: {
          orderId: row.id,
          grossValueCents: grossCents,
          storeCreditAppliedCents: row.store_credit_applied_cents,
          reviewTriggers: [...(row.review_triggers ?? [])],
        },
      };
    });
}

export interface ClaimSourceRow {
  id: string;
  order_id: string;
  sku: string;
  reason: string;
  state: string;
  resolution: string | null;
  submitted_at: string;
}

const OPEN_CLAIM_STATES = ["submitted", "under_review", "information_requested", "approved"] as const;

function deriveClaimQueue(
  rows: readonly ClaimSourceRow[],
  kind: "refund_review" | "replacement_review",
  resolutions: readonly string[],
): CommerceQueueItem[] {
  return rows
    .filter(
      (row) =>
        (OPEN_CLAIM_STATES as readonly string[]).includes(row.state) &&
        row.resolution !== null &&
        resolutions.includes(row.resolution),
    )
    .map((row) => ({
      kind,
      source: "derived" as const,
      sourceRef: `claim:${row.id}`,
      openedAt: row.submitted_at,
      summary: `Claim (${row.reason}) dispositioned ${row.resolution}, ${row.state}.`,
      detail: {
        claimId: row.id,
        orderId: row.order_id,
        sku: row.sku,
        reason: row.reason,
        state: row.state,
        resolution: row.resolution,
      },
    }));
}

/** Open claims already dispositioned toward money moving back. */
export function deriveRefundReview(rows: readonly ClaimSourceRow[]): CommerceQueueItem[] {
  return deriveClaimQueue(rows, "refund_review", ["refund", "partial_refund"]);
}

/** Open claims already dispositioned toward product shipping again. */
export function deriveReplacementReview(rows: readonly ClaimSourceRow[]): CommerceQueueItem[] {
  return deriveClaimQueue(rows, "replacement_review", ["replacement"]);
}

export interface LotSourceRow {
  id: string;
  lot_id: string;
  sku: string;
  disposition: string;
  excursion: string;
  recalled: boolean;
  recalled_at: string | null;
  created_at: string;
}

export interface LotQualityDocRow {
  lot_id: string;
  coa_on_file: boolean;
  identity_confirmed: boolean;
  purity_confirmed: boolean;
  sterility_confirmed: boolean | null;
  endotoxin_confirmed: boolean | null;
}

const TERMINAL_LOT_DISPOSITIONS = ["destroyed", "expired"] as const;
const HELD_LOT_DISPOSITIONS = ["quarantined", "quality_hold", "temperature_hold"] as const;

function missingDocumentFlags(doc: LotQualityDocRow | undefined): string[] {
  if (!doc) return ["no_quality_document_row"];
  const missing: string[] = [];
  if (!doc.coa_on_file) missing.push("coa_on_file");
  if (!doc.identity_confirmed) missing.push("identity_confirmed");
  if (!doc.purity_confirmed) missing.push("purity_confirmed");
  // Tri-state columns: null means not applicable, false means required and absent.
  if (doc.sterility_confirmed === false) missing.push("sterility_confirmed");
  if (doc.endotoxin_confirmed === false) missing.push("endotoxin_confirmed");
  return missing;
}

/** Live lots whose supplier quality documents are missing or unconfirmed. */
export function deriveSupplierDocumentReview(
  lots: readonly LotSourceRow[],
  docs: readonly LotQualityDocRow[],
): CommerceQueueItem[] {
  const docsByLot = new Map(docs.map((d) => [d.lot_id, d]));
  return lots
    .filter(
      (lot) => !lot.recalled && !(TERMINAL_LOT_DISPOSITIONS as readonly string[]).includes(lot.disposition),
    )
    .map((lot) => ({ lot, missing: missingDocumentFlags(docsByLot.get(lot.id)) }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ lot, missing }) => ({
      kind: "supplier_document_review" as const,
      source: "derived" as const,
      sourceRef: `lot:${lot.id}`,
      openedAt: lot.created_at,
      summary: `Lot ${lot.lot_id} (${lot.sku}) has unconfirmed supplier documents: ${missing.join(", ")}.`,
      detail: { lotId: lot.lot_id, sku: lot.sku, disposition: lot.disposition, missing },
    }));
}

/**
 * Held lots whose documents ARE complete, awaiting the human release decision.
 * A pending excursion blocks release, so those lots stay out of this queue
 * (they sit in recall or excursion handling, not a release decision).
 */
export function deriveInventoryRelease(
  lots: readonly LotSourceRow[],
  docs: readonly LotQualityDocRow[],
): CommerceQueueItem[] {
  const docsByLot = new Map(docs.map((d) => [d.lot_id, d]));
  return lots
    .filter(
      (lot) =>
        !lot.recalled &&
        (HELD_LOT_DISPOSITIONS as readonly string[]).includes(lot.disposition) &&
        (lot.excursion === "none" || lot.excursion === "cleared") &&
        missingDocumentFlags(docsByLot.get(lot.id)).length === 0,
    )
    .map((lot) => ({
      kind: "inventory_release" as const,
      source: "derived" as const,
      sourceRef: `lot:${lot.id}`,
      openedAt: lot.created_at,
      summary: `Lot ${lot.lot_id} (${lot.sku}) is ${lot.disposition} with complete documents, awaiting release.`,
      detail: { lotId: lot.lot_id, sku: lot.sku, disposition: lot.disposition },
    }));
}

/**
 * The columns this derivation is permitted to see. research_fulfillment_orders
 * also carries recipient name, address, and phone; those columns are NEVER
 * selected, so they cannot reach a queue item even by accident.
 */
export interface FulfillmentSourceRow {
  id: string;
  order_id: string;
  owner: string;
  state: string;
  hold_reason: string | null;
  created_at: string;
}

const FAILED_FULFILLMENT_STATES = ["rejected", "exception", "on_hold"] as const;

export function deriveFulfillmentFailure(rows: readonly FulfillmentSourceRow[]): CommerceQueueItem[] {
  return rows
    .filter((row) => (FAILED_FULFILLMENT_STATES as readonly string[]).includes(row.state))
    .map((row) => ({
      kind: "fulfillment_failure" as const,
      source: "derived" as const,
      sourceRef: `fulfillment:${row.id}`,
      openedAt: row.created_at,
      summary: `Fulfillment for order ${row.order_id} (${row.owner}) is ${row.state}.`,
      detail: {
        fulfillmentOrderId: row.id,
        orderId: row.order_id,
        owner: row.owner,
        state: row.state,
        holdReason: row.hold_reason,
      },
    }));
}

export interface PayoutBatchSourceRow {
  id: string;
  partner_id: string;
  total_cents: number;
  state: string;
  excluded_reasons: string[] | null;
  built_at: string;
}

const PAYOUT_REVIEW_STATES = ["built", "failed"] as const;

export function derivePayoutReview(rows: readonly PayoutBatchSourceRow[]): CommerceQueueItem[] {
  return rows
    .filter((row) => (PAYOUT_REVIEW_STATES as readonly string[]).includes(row.state))
    .map((row) => ({
      kind: "payout_review" as const,
      source: "derived" as const,
      sourceRef: `payout_batch:${row.id}`,
      openedAt: row.built_at,
      summary: `Payout batch of ${row.total_cents} cents for partner ${row.partner_id} is ${row.state}.`,
      detail: {
        batchId: row.id,
        partnerId: row.partner_id,
        totalCents: row.total_cents,
        state: row.state,
        excludedCount: (row.excluded_reasons ?? []).length,
      },
    }));
}

export interface FraudFlaggedCreditRow {
  id: string;
  member_id: string;
  amount_cents: number;
  state: string;
  reason: string;
  created_at: string;
}

export function deriveFraudReview(rows: readonly FraudFlaggedCreditRow[]): CommerceQueueItem[] {
  return rows
    .filter((row) => row.state === "fraud_flagged")
    .map((row) => ({
      kind: "fraud_review" as const,
      source: "derived" as const,
      sourceRef: `store_credit:${row.id}`,
      openedAt: row.created_at,
      summary: `Store credit of ${row.amount_cents} cents (${row.reason}) is fraud flagged.`,
      detail: {
        entryId: row.id,
        memberId: row.member_id,
        amountCents: row.amount_cents,
        reason: row.reason,
      },
    }));
}

export function deriveRecallResponse(lots: readonly LotSourceRow[]): CommerceQueueItem[] {
  return lots
    .filter((lot) => lot.recalled)
    .map((lot) => ({
      kind: "recall_response" as const,
      source: "derived" as const,
      sourceRef: `lot:${lot.id}`,
      openedAt: lot.recalled_at ?? lot.created_at,
      summary: `Lot ${lot.lot_id} (${lot.sku}) is recalled; trace shipments and notify affected members.`,
      detail: { lotId: lot.lot_id, sku: lot.sku, recalledAt: lot.recalled_at },
    }));
}

// ---------------------------------------------------------------------------
// Shared pure pieces
// ---------------------------------------------------------------------------

function validateEnqueue(item: AdminQueueItemRecord): void {
  if (!item.id) throw new QueueItemInvalid("A queue item needs an id.");
  if (!COMMERCE_QUEUE_KINDS.includes(item.kind)) {
    throw new QueueItemInvalid(`Unknown queue kind: ${item.kind}.`);
  }
  if (!item.sourceRef) throw new QueueItemInvalid("A queue item needs a sourceRef.");
  if (item.status !== "open") {
    throw new QueueItemInvalid("An enqueued item must be open; a resolution is a later, stamped step.");
  }
  if (item.resolvedAt !== null || item.resolvedByActorId !== null || item.resolution !== null) {
    throw new QueueItemInvalid("An enqueued item cannot carry resolution fields.");
  }
}

function queuedToViewItem(item: AdminQueueItemRecord): CommerceQueueItem {
  return {
    kind: item.kind,
    source: "queued",
    sourceRef: item.sourceRef,
    openedAt: item.openedAt,
    summary: item.summary,
    detail: { itemId: item.id, openedByActorType: item.openedByActorType },
  };
}

function sortViewItems(items: CommerceQueueItem[]): CommerceQueueItem[] {
  return items.slice().sort((a, b) => {
    if (a.openedAt !== b.openedAt) return a.openedAt < b.openedAt ? -1 : 1;
    return a.sourceRef.localeCompare(b.sourceRef);
  });
}

function buildAcknowledgement(
  kind: CommerceQueueKind,
  sourceRef: string,
  outcome: QueueResolution & { id: string; summary: string },
): AdminQueueItemRecord {
  if (!ACKNOWLEDGEABLE_KINDS.includes(kind)) throw new QueueKindNotAcknowledgeable(kind);
  return {
    id: outcome.id,
    kind,
    sourceRef,
    summary: outcome.summary,
    status: outcome.status,
    openedAt: outcome.at.toISOString(),
    openedByActorType: "admin",
    openedByActorId: outcome.actorId,
    resolvedAt: outcome.at.toISOString(),
    resolvedByActorId: outcome.actorId,
    resolution: outcome.resolution,
  };
}

/**
 * Merge derived and queued items for one kind. For the acknowledgeable kind, a
 * derived item drops out of the OPEN view when a resolution row for its
 * sourceRef exists; the resolution row itself remains permanent history.
 */
function mergeKind(
  kind: CommerceQueueKind,
  derived: CommerceQueueItem[],
  persisted: readonly AdminQueueItemRecord[],
): CommerceQueueItem[] {
  const acknowledged = new Set(
    persisted
      .filter((p) => p.kind === kind && p.status !== "open")
      .map((p) => p.sourceRef),
  );
  const visibleDerived = ACKNOWLEDGEABLE_KINDS.includes(kind)
    ? derived.filter((d) => !acknowledged.has(d.sourceRef))
    : derived;
  const queuedOpen = persisted.filter((p) => p.kind === kind && p.status === "open").map(queuedToViewItem);
  return sortViewItems([...visibleDerived, ...queuedOpen]);
}

function toView(itemsByKind: Map<CommerceQueueKind, CommerceQueueItem[]>): CommerceQueuesView {
  return {
    provisioned: true,
    queues: COMMERCE_QUEUE_KINDS.map((kind) => {
      const items = itemsByKind.get(kind) ?? [];
      return { kind, openCount: items.length, items };
    }),
  };
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double and the unconfigured fallback.
// It has no domain tables to derive from, so its commerce() view carries the
// queued items only; the derivations are pure functions tested directly and
// exercised through the Supabase store's fake client.
// ---------------------------------------------------------------------------

export function createInMemoryAdminQueuesStore(): AdminQueuesRepository {
  const items: AdminQueueItemRecord[] = [];
  const clone = (i: AdminQueueItemRecord): AdminQueueItemRecord => ({ ...i });

  return {
    async enqueue(item) {
      validateEnqueue(item);
      items.push(clone(item));
    },
    async listByKind(kind, includeResolved = false) {
      return items
        .filter((i) => i.kind === kind && (includeResolved || i.status === "open"))
        .sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.id.localeCompare(b.id)))
        .map(clone);
    },
    async resolve(itemId, outcome) {
      const item = items.find((i) => i.id === itemId);
      if (!item) throw new QueueItemNotFound(itemId);
      if (item.status !== "open") throw new QueueItemAlreadyResolved(itemId);
      item.status = outcome.status;
      item.resolvedAt = outcome.at.toISOString();
      item.resolvedByActorId = outcome.actorId;
      item.resolution = outcome.resolution;
      return clone(item);
    },
    async acknowledgeDerived(kind, sourceRef, outcome) {
      const row = buildAcknowledgement(kind, sourceRef, outcome);
      items.push(clone(row));
      return clone(row);
    },
    async commerce() {
      const byKind = new Map<CommerceQueueKind, CommerceQueueItem[]>();
      for (const kind of COMMERCE_QUEUE_KINDS) {
        byKind.set(kind, mergeKind(kind, [], items));
      }
      return toView(byKind);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

const QUEUE_ITEMS_TABLE = "research_admin_queue_items";
const ORDERS_TABLE = "research_orders";
const CLAIMS_TABLE = "research_claims";
const LOTS_TABLE = "research_inventory_lots";
const LOT_DOCS_TABLE = "research_lot_quality_documents";
const FULFILLMENT_TABLE = "research_fulfillment_orders";
const PAYOUT_BATCHES_TABLE = "research_payout_batches";
const STORE_CREDIT_TABLE = "research_store_credit_ledger";

const QUEUE_ITEM_COLUMNS =
  "id, kind, source_ref, summary, status, opened_at, opened_by_actor_type, opened_by_actor_id, resolved_at, resolved_by_actor_id, resolution";

interface QueueItemRow {
  id: string;
  kind: string;
  source_ref: string;
  summary: string;
  status: string;
  opened_at: string;
  opened_by_actor_type: string;
  opened_by_actor_id: string | null;
  resolved_at: string | null;
  resolved_by_actor_id: string | null;
  resolution: string | null;
}

export function queueItemRecordToRow(item: AdminQueueItemRecord): QueueItemRow {
  return {
    id: item.id,
    kind: item.kind,
    source_ref: item.sourceRef,
    summary: item.summary,
    status: item.status,
    opened_at: item.openedAt,
    opened_by_actor_type: item.openedByActorType,
    opened_by_actor_id: item.openedByActorId,
    resolved_at: item.resolvedAt,
    resolved_by_actor_id: item.resolvedByActorId,
    resolution: item.resolution,
  };
}

export function queueItemRowToRecord(row: QueueItemRow): AdminQueueItemRecord {
  return {
    id: row.id,
    kind: row.kind as CommerceQueueKind,
    sourceRef: row.source_ref,
    summary: row.summary,
    status: row.status as QueueItemStatus,
    openedAt: row.opened_at,
    openedByActorType: (row.opened_by_actor_type === "admin" ? "admin" : "system") as QueueActorType,
    openedByActorId: row.opened_by_actor_id,
    resolvedAt: row.resolved_at,
    resolvedByActorId: row.resolved_by_actor_id,
    resolution: row.resolution,
  };
}

export function createSupabaseAdminQueuesStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AdminQueuesRepository {
  // Reads are defensive: a table another wave owns that does not exist yet, a
  // permissions error, or a thrown client all read as empty, matching the
  // member-platform admin-queues posture. Writes below are NOT defensive.
  async function readRows<T>(table: string, columns: string, apply?: (query: any) => any): Promise<T[]> {
    try {
      let query: any = client.from(table).select(columns);
      if (apply) query = apply(query);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) return [];
      return data as T[];
    } catch {
      return [];
    }
  }

  async function allQueueItems(): Promise<AdminQueueItemRecord[]> {
    const rows = await readRows<QueueItemRow>(QUEUE_ITEMS_TABLE, QUEUE_ITEM_COLUMNS);
    return rows.map(queueItemRowToRecord);
  }

  async function derivedFor(kind: CommerceQueueKind): Promise<CommerceQueueItem[]> {
    switch (kind) {
      case "large_order_review":
        return deriveLargeOrderReview(
          await readRows<OrderReviewSourceRow>(
            ORDERS_TABLE,
            "id, state, subtotal_cents, shipping_cents, store_credit_applied_cents, review_triggers, created_at",
            (q) => q.eq("state", "manual_review"),
          ),
        );
      case "refund_review":
      case "replacement_review": {
        const claims = await readRows<ClaimSourceRow>(
          CLAIMS_TABLE,
          "id, order_id, sku, reason, state, resolution, submitted_at",
          (q) => q.in("state", [...OPEN_CLAIM_STATES]),
        );
        return kind === "refund_review" ? deriveRefundReview(claims) : deriveReplacementReview(claims);
      }
      case "supplier_document_review":
      case "inventory_release":
      case "recall_response": {
        const lots = await readRows<LotSourceRow>(
          LOTS_TABLE,
          "id, lot_id, sku, disposition, excursion, recalled, recalled_at, created_at",
        );
        if (kind === "recall_response") return deriveRecallResponse(lots);
        const docs = await readRows<LotQualityDocRow>(
          LOT_DOCS_TABLE,
          "lot_id, coa_on_file, identity_confirmed, purity_confirmed, sterility_confirmed, endotoxin_confirmed",
        );
        return kind === "supplier_document_review"
          ? deriveSupplierDocumentReview(lots, docs)
          : deriveInventoryRelease(lots, docs);
      }
      case "fulfillment_failure":
        // Only the allowlisted columns are selected; recipient name, address,
        // and phone never leave the fulfillment table through this store.
        return deriveFulfillmentFailure(
          await readRows<FulfillmentSourceRow>(
            FULFILLMENT_TABLE,
            "id, order_id, owner, state, hold_reason, created_at",
            (q) => q.in("state", [...FAILED_FULFILLMENT_STATES]),
          ),
        );
      case "payout_review":
        return derivePayoutReview(
          await readRows<PayoutBatchSourceRow>(
            PAYOUT_BATCHES_TABLE,
            "id, partner_id, total_cents, state, excluded_reasons, built_at",
            (q) => q.in("state", [...PAYOUT_REVIEW_STATES]),
          ),
        );
      case "fraud_review":
        return deriveFraudReview(
          await readRows<FraudFlaggedCreditRow>(
            STORE_CREDIT_TABLE,
            "id, member_id, amount_cents, state, reason, created_at",
            (q) => q.eq("state", "fraud_flagged"),
          ),
        );
      case "payment_review":
        // Queued only; no domain table encodes this open state.
        return [];
      default:
        return [];
    }
  }

  return {
    async enqueue(item) {
      validateEnqueue(item);
      const ins = await client.from(QUEUE_ITEMS_TABLE).insert(queueItemRecordToRow(item));
      if (ins.error) throw new Error(`queue enqueue failed: ${ins.error.message}`);
    },

    async listByKind(kind, includeResolved = false) {
      const rows = await readRows<QueueItemRow>(QUEUE_ITEMS_TABLE, QUEUE_ITEM_COLUMNS, (q) => {
        const filtered = q.eq("kind", kind);
        return includeResolved ? filtered : filtered.eq("status", "open");
      });
      return rows
        .map(queueItemRowToRecord)
        .sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : a.id.localeCompare(b.id)));
    },

    async resolve(itemId, outcome) {
      // The status filter in the update itself is the guard: two admins racing
      // to resolve one item cannot both match a row that is still open.
      const upd = await client
        .from(QUEUE_ITEMS_TABLE)
        .update({
          status: outcome.status,
          resolved_at: outcome.at.toISOString(),
          resolved_by_actor_id: outcome.actorId,
          resolution: outcome.resolution,
        })
        .eq("id", itemId)
        .eq("status", "open")
        .select(QUEUE_ITEM_COLUMNS)
        .maybeSingle();
      if (upd.error) throw new Error(`queue resolve failed: ${upd.error.message}`);
      if (upd.data) return queueItemRowToRecord(upd.data as QueueItemRow);

      // Nothing matched: distinguish an unknown id from an already-settled one.
      const existing = await client
        .from(QUEUE_ITEMS_TABLE)
        .select(QUEUE_ITEM_COLUMNS)
        .eq("id", itemId)
        .maybeSingle();
      if (existing.error) throw new Error(`queue resolve lookup failed: ${existing.error.message}`);
      if (existing.data) throw new QueueItemAlreadyResolved(itemId);
      throw new QueueItemNotFound(itemId);
    },

    async acknowledgeDerived(kind, sourceRef, outcome) {
      const row = buildAcknowledgement(kind, sourceRef, outcome);
      const ins = await client.from(QUEUE_ITEMS_TABLE).insert(queueItemRecordToRow(row));
      if (ins.error) throw new Error(`queue acknowledgement failed: ${ins.error.message}`);
      return row;
    },

    async commerce() {
      const persisted = await allQueueItems();
      const byKind = new Map<CommerceQueueKind, CommerceQueueItem[]>();
      for (const kind of COMMERCE_QUEUE_KINDS) {
        byKind.set(kind, mergeKind(kind, await derivedFor(kind), persisted));
      }
      return toView(byKind);
    },
  };
}

/**
 * The real store when Supabase is configured, else the in-memory reference.
 * Consumed only behind the commerce flag, so an unconfigured deployment keeps
 * failing closed rather than silently persisting.
 */
export function resolveAdminQueuesStore(): AdminQueuesRepository {
  return supabaseConfigured() ? createSupabaseAdminQueuesStore() : createInMemoryAdminQueuesStore();
}
