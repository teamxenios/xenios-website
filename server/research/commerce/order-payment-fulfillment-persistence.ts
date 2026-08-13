/**
 * Unmounted atomic persistence seam for Pack 04.
 *
 * A command is evaluated against one immutable snapshot and the resulting
 * order projection, scoped command receipt, timeline events, audit entries and
 * optional money/fulfilment facts are committed with one compare-and-swap.
 * The production adapter will map one `commit` call to one reviewed database
 * transaction. This file performs no SQL, registers no route and calls no
 * provider.
 */

import {
  InMemoryOrderWorkflowEngine,
  PACK04_ORDER_QUANTITY_MAX,
  PACK04_ORDER_QUANTITY_MIN,
  type BuyerRequestLine,
  type CustomerOrderHistoryPage,
  type CustomerOrderHistoryQuery,
  type CustomerOrderTimeline,
  type CustomerReorderDraft,
  type OrderActor,
  type OrderAuditEntry,
  type OrderCommand,
  type OrderSettlement,
  type OrderWorkflow,
  type OrderWorkflowEngineSnapshot,
  type OrderWorkflowEvent,
  type OrderWorkflowIdempotencyReceipt,
  type OrderWorkflowResult,
  type SupplierHandoff,
  type TrackingFact,
} from "./order-payment-fulfillment";
import type {
  CommittedManualPaymentVerification,
  ManualOrderInvoice,
  ManualPaymentReport,
} from "./manual-order-payments";

export type OrderWorkflowLoadedState = Readonly<{
  revision: number;
  snapshot: OrderWorkflowEngineSnapshot;
}>;

export type OrderWorkflowDurableReceipt = Readonly<{
  ownerScope: string;
  idempotencyKey: string;
  payloadSha256: string;
  orderId: string;
  resultVersion: number;
}>;

export type OrderWorkflowCommitBundle = Readonly<{
  expectedRevision: number;
  nextRevision: number;
  orderId: string;
  command: OrderCommand["kind"];
  outcome: "accepted" | "refused" | "replayed";
  orderBeforeVersion: number | null;
  orderAfter: OrderWorkflow | null;
  commandReceipt: OrderWorkflowDurableReceipt | null;
  timelineEvents: readonly OrderWorkflowEvent[];
  auditEntries: readonly OrderAuditEntry[];
  invoice: ManualOrderInvoice | null;
  paymentEvidence: ManualPaymentReport | null;
  verification: CommittedManualPaymentVerification | null;
  settlement: OrderSettlement | null;
  supplierHandoff: SupplierHandoff | null;
  tracking: TrackingFact | null;
  fulfillmentStage: "fulfilling" | "shipped" | "delivered" | null;
}>;

export type OrderWorkflowCommitResult =
  | Readonly<{ committed: true; revision: number }>
  | Readonly<{ committed: false; reason: "revision_moved"; currentRevision: number }>;

export interface OrderWorkflowAtomicStore {
  load(): Promise<OrderWorkflowLoadedState>;
  /** One implementation call must be one atomic database transaction. */
  commit(input: Readonly<{
    expectedRevision: number;
    snapshot: OrderWorkflowEngineSnapshot;
    bundle: OrderWorkflowCommitBundle;
  }>): Promise<OrderWorkflowCommitResult>;
}

export class OrderWorkflowConcurrencyError extends Error {
  constructor() {
    super("Pack 04 atomic commit could not acquire the current workflow revision.");
    this.name = "OrderWorkflowConcurrencyError";
  }
}

export class OrderWorkflowPersistenceCorruptionError extends Error {
  constructor() {
    super("Pack 04 durable workflow state failed structural validation.");
    this.name = "OrderWorkflowPersistenceCorruptionError";
  }
}

const EMPTY_SNAPSHOT: OrderWorkflowEngineSnapshot = Object.freeze({
  orders: Object.freeze([]),
  receipts: Object.freeze([]),
  auditTrail: Object.freeze([]),
});

function receiptIdentity(receipt: OrderWorkflowIdempotencyReceipt): string {
  return `${receipt.scope}\u0000${receipt.key}`;
}

function validPersistedQuantityLines(value: unknown): value is readonly BuyerRequestLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return false;
  const skus = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return false;
    const line = candidate as Partial<BuyerRequestLine>;
    if (typeof line.sku !== "string" || skus.has(line.sku)
      || !Number.isSafeInteger(line.quantity)
      || (line.quantity ?? 0) < PACK04_ORDER_QUANTITY_MIN
      || (line.quantity ?? 0) > PACK04_ORDER_QUANTITY_MAX) {
      return false;
    }
    skus.add(line.sku);
  }
  return true;
}

function persistedQuantitiesMatch(
  requested: readonly BuyerRequestLine[],
  invoiced: readonly BuyerRequestLine[],
): boolean {
  if (requested.length !== invoiced.length) return false;
  const requestedBySku = new Map(requested.map((line) => [line.sku, line.quantity] as const));
  return invoiced.every((line) => requestedBySku.get(line.sku) === line.quantity);
}

function assertLoadedState(value: OrderWorkflowLoadedState): void {
  if (!Number.isSafeInteger(value.revision) || value.revision < 0
    || !value.snapshot || !Array.isArray(value.snapshot.orders)
    || !Array.isArray(value.snapshot.receipts) || !Array.isArray(value.snapshot.auditTrail)) {
    throw new OrderWorkflowPersistenceCorruptionError();
  }
  const orderIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const order of value.snapshot.orders) {
    const created = Date.parse(order?.createdAt ?? "");
    const updated = Date.parse(order?.updatedAt ?? "");
    if (!order || typeof order.orderId !== "string" || orderIds.has(order.orderId)
      || !Number.isSafeInteger(order.version) || order.version < 1
      || !Array.isArray(order.events) || !Array.isArray(order.paymentEvidence)
      || !Array.isArray(order.tracking) || !Number.isFinite(created) || !Number.isFinite(updated)
      || !validPersistedQuantityLines(order.request?.lines)
      || (order.invoice !== null && (
        !validPersistedQuantityLines(order.invoice?.lines)
        || !persistedQuantitiesMatch(order.request.lines, order.invoice.lines)
      ))
      || updated < created) {
      throw new OrderWorkflowPersistenceCorruptionError();
    }
    orderIds.add(order.orderId);
    for (let index = 0; index < order.events.length; index += 1) {
      const event = order.events[index];
      if (!event || event.orderId !== order.orderId || event.sequence !== index + 1
        || eventIds.has(event.eventId)) {
        throw new OrderWorkflowPersistenceCorruptionError();
      }
      eventIds.add(event.eventId);
    }
  }
  const receiptIds = new Set<string>();
  for (const receipt of value.snapshot.receipts) {
    if (!receipt || typeof receipt.scope !== "string" || typeof receipt.key !== "string") {
      throw new OrderWorkflowPersistenceCorruptionError();
    }
    const id = receiptIdentity(receipt);
    if (receiptIds.has(id) || !/^[a-f0-9]{64}$/.test(receipt.fingerprint)
      || !orderIds.has(receipt.orderId) || !Number.isSafeInteger(receipt.resultVersion)
      || receipt.resultVersion < 1
      || (value.snapshot.orders.find((order) => order.orderId === receipt.orderId)?.version ?? 0)
        < receipt.resultVersion) {
      throw new OrderWorkflowPersistenceCorruptionError();
    }
    receiptIds.add(id);
  }
  const auditIds = new Set<string>();
  for (const audit of value.snapshot.auditTrail) {
    if (!audit || typeof audit.auditId !== "string" || auditIds.has(audit.auditId)
      || !/^[a-f0-9]{64}$/.test(audit.fingerprint)) {
      throw new OrderWorkflowPersistenceCorruptionError();
    }
    auditIds.add(audit.auditId);
  }
}

function deriveBundle(
  before: OrderWorkflowLoadedState,
  after: OrderWorkflowEngineSnapshot,
  command: OrderCommand,
  result: OrderWorkflowResult,
): OrderWorkflowCommitBundle {
  const orderBefore = before.snapshot.orders.find((order) => order.orderId === command.orderId) ?? null;
  const orderAfter = after.orders.find((order) => order.orderId === command.orderId) ?? null;
  const beforeEvents = new Set(orderBefore?.events.map((event) => event.eventId) ?? []);
  const beforeReceipts = new Set(before.snapshot.receipts.map(receiptIdentity));
  const newReceipts = after.receipts.filter((receipt) => !beforeReceipts.has(receiptIdentity(receipt)));
  if (newReceipts.length > 1) {
    throw new Error("Pack 04 command produced more than one idempotency receipt.");
  }
  const auditEntries = after.auditTrail.slice(before.snapshot.auditTrail.length);
  if (auditEntries.length !== 1 || auditEntries[0]?.command !== command.kind) {
    throw new Error("Pack 04 command did not produce exactly one matching audit entry.");
  }

  const accepted = result.ok && !result.replayed;
  const timelineEvents = accepted
    ? (orderAfter?.events.filter((event) => !beforeEvents.has(event.eventId)) ?? [])
    : [];
  const changedOrder = orderAfter !== null && orderAfter.version !== orderBefore?.version
    ? orderAfter
    : null;

  return Object.freeze({
    expectedRevision: before.revision,
    nextRevision: before.revision + 1,
    orderId: command.orderId,
    command: command.kind,
    outcome: result.ok ? (result.replayed ? "replayed" : "accepted") : "refused",
    orderBeforeVersion: orderBefore?.version ?? null,
    orderAfter: changedOrder,
    commandReceipt: newReceipts[0]
      ? Object.freeze({
          ownerScope: newReceipts[0].scope,
          idempotencyKey: newReceipts[0].key,
          payloadSha256: newReceipts[0].fingerprint,
          orderId: newReceipts[0].orderId,
          resultVersion: newReceipts[0].resultVersion,
        })
      : null,
    timelineEvents: Object.freeze(timelineEvents),
    auditEntries: Object.freeze(auditEntries),
    invoice: accepted && command.kind === "issue_invoice" ? command.invoice : null,
    paymentEvidence: accepted && command.kind === "submit_payment_evidence" ? command.report : null,
    verification: accepted && command.kind === "verify_payment" ? command.verification : null,
    settlement: accepted && command.kind === "verify_payment" ? (orderAfter?.settlement ?? null) : null,
    supplierHandoff:
      accepted && (command.kind === "queue_supplier_handoff" || command.kind === "release_supplier_handoff")
        ? (orderAfter?.supplierHandoff ?? null)
        : null,
    tracking:
      accepted && command.kind === "add_tracking" ? (orderAfter?.tracking.at(-1) ?? null) : null,
    fulfillmentStage:
      accepted && command.kind === "start_fulfillment"
        ? "fulfilling"
        : accepted && command.kind === "mark_shipped"
          ? "shipped"
          : accepted && command.kind === "mark_delivered"
            ? "delivered"
            : null,
  });
}

export class PersistentOrderWorkflowService {
  constructor(
    private readonly store: OrderWorkflowAtomicStore,
    private readonly maxCommitAttempts = 4,
  ) {
    if (!Number.isSafeInteger(maxCommitAttempts) || maxCommitAttempts < 1 || maxCommitAttempts > 16) {
      throw new Error("Pack 04 maxCommitAttempts must be an integer from 1 through 16.");
    }
  }

  async execute(
    actor: OrderActor,
    idempotencyKey: string,
    command: OrderCommand,
  ): Promise<OrderWorkflowResult> {
    for (let attempt = 0; attempt < this.maxCommitAttempts; attempt += 1) {
      const before = await this.store.load();
      assertLoadedState(before);
      const engine = new InMemoryOrderWorkflowEngine(before.snapshot);
      const result = engine.execute(actor, idempotencyKey, command);
      const snapshot = engine.snapshot();
      const bundle = deriveBundle(before, snapshot, command, result);
      const committed = await this.store.commit({
        expectedRevision: before.revision,
        snapshot,
        bundle,
      });
      if (committed.committed) return result;
    }
    throw new OrderWorkflowConcurrencyError();
  }

  async getForActor(actor: OrderActor, orderId: string): Promise<OrderWorkflow | null> {
    const loaded = await this.store.load();
    assertLoadedState(loaded);
    return new InMemoryOrderWorkflowEngine(loaded.snapshot).getForActor(actor, orderId);
  }

  async customerTimeline(actor: OrderActor, orderId: string): Promise<CustomerOrderTimeline | null> {
    const loaded = await this.store.load();
    assertLoadedState(loaded);
    return new InMemoryOrderWorkflowEngine(loaded.snapshot).customerTimeline(actor, orderId);
  }

  async customerOrderHistory(
    actor: OrderActor,
    query: CustomerOrderHistoryQuery = {},
  ): Promise<CustomerOrderHistoryPage> {
    const loaded = await this.store.load();
    assertLoadedState(loaded);
    return new InMemoryOrderWorkflowEngine(loaded.snapshot).customerOrderHistory(actor, query);
  }

  async customerReorderDraft(
    actor: OrderActor,
    sourceOrderId: string,
  ): Promise<CustomerReorderDraft | null> {
    const loaded = await this.store.load();
    assertLoadedState(loaded);
    return new InMemoryOrderWorkflowEngine(loaded.snapshot).customerReorderDraft(actor, sourceOrderId);
  }
}

export type InMemoryOrderWorkflowAtomicStoreOptions = Readonly<{
  initialSnapshot?: OrderWorkflowEngineSnapshot;
  initialRevision?: number;
  /** Test seam for interleaving commits; it cannot alter committed state. */
  beforeCommit?: (input: Readonly<{
    expectedRevision: number;
    bundle: OrderWorkflowCommitBundle;
  }>) => Promise<void> | void;
}>;

/** Reference implementation. Production must replace this with one SQL transaction. */
export class InMemoryOrderWorkflowAtomicStore implements OrderWorkflowAtomicStore {
  private revision: number;
  private snapshotState: OrderWorkflowEngineSnapshot;
  private readonly committedBundles: OrderWorkflowCommitBundle[] = [];
  private readonly beforeCommit?: InMemoryOrderWorkflowAtomicStoreOptions["beforeCommit"];

  constructor(options: InMemoryOrderWorkflowAtomicStoreOptions = {}) {
    this.revision = options.initialRevision ?? 0;
    this.snapshotState = options.initialSnapshot ?? EMPTY_SNAPSHOT;
    this.beforeCommit = options.beforeCommit;
    assertLoadedState({ revision: this.revision, snapshot: this.snapshotState });
  }

  async load(): Promise<OrderWorkflowLoadedState> {
    return Object.freeze({ revision: this.revision, snapshot: this.snapshotState });
  }

  async commit(input: Readonly<{
    expectedRevision: number;
    snapshot: OrderWorkflowEngineSnapshot;
    bundle: OrderWorkflowCommitBundle;
  }>): Promise<OrderWorkflowCommitResult> {
    if (input.bundle.expectedRevision !== input.expectedRevision
      || input.bundle.nextRevision !== input.expectedRevision + 1) {
      throw new Error("Pack 04 commit bundle revision does not match its transaction envelope.");
    }
    if (input.expectedRevision !== this.revision) {
      return Object.freeze({
        committed: false as const,
        reason: "revision_moved" as const,
        currentRevision: this.revision,
      });
    }
    await this.beforeCommit?.({ expectedRevision: input.expectedRevision, bundle: input.bundle });
    // Re-check after an awaited test/infrastructure boundary. Another instance
    // may have committed while this writer was suspended.
    if (input.expectedRevision !== this.revision) {
      return Object.freeze({
        committed: false as const,
        reason: "revision_moved" as const,
        currentRevision: this.revision,
      });
    }
    this.snapshotState = input.snapshot;
    this.revision += 1;
    this.committedBundles.push(input.bundle);
    return Object.freeze({ committed: true as const, revision: this.revision });
  }

  commits(): readonly OrderWorkflowCommitBundle[] {
    return Object.freeze([...this.committedBundles]);
  }
}
