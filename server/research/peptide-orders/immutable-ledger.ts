/**
 * Isolated peptide order ledger.
 *
 * This module intentionally has no route, database, feature-flag, or Product
 * Control dependency. It is a deterministic contract/reference implementation
 * for release-manager integration. Every mutating operation is serialized,
 * validates before changing state, and is idempotent by operation + key.
 */

export type InventoryProjection = Readonly<{
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  paidAllocated: number;
}>;

export type PriceProvenance = Readonly<{
  priceId: string;
  priceVersion: number;
  approvedBy: string;
  approvedAt: string;
  currency: "usd";
}>;

export type ImmutableOrderLine = Readonly<{
  sku: string;
  displayName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  price: PriceProvenance;
}>;

export type OrderState = "reserved" | "paid_allocated" | "released";

export type OrderEvent = Readonly<{
  sequence: number;
  type: "reserved" | "paid_allocated" | "released" | "refund_recorded" | "commission_recorded" | "tracking_recorded";
  at: string;
  actorId: string;
  reason: string;
  idempotencyKey: string;
}>;

export type RefundProvenance = Readonly<{
  refundId: string;
  amountCents: number;
  providerReference: string;
  reason: string;
  actorId: string;
  recordedAt: string;
}>;

export type CommissionProvenance = Readonly<{
  commissionId: string;
  partnerId: string;
  amountCents: number;
  ruleId: string;
  ruleVersion: number;
  actorId: string;
  recordedAt: string;
}>;

export type TrackingRecord = Readonly<{
  shipmentId: string;
  carrier: string;
  trackingNumber: string;
  status: string;
  recordedAt: string;
}>;

export type OrderDetail = Readonly<{
  orderId: string;
  memberId: string;
  state: OrderState;
  currency: "usd";
  totalCents: number;
  lines: readonly ImmutableOrderLine[];
  refunds: readonly RefundProvenance[];
  commissions: readonly CommissionProvenance[];
  tracking: readonly TrackingRecord[];
  history: readonly OrderEvent[];
  createdAt: string;
}>;

export type OrderConfirmationPayload = Readonly<{
  orderId: string;
  state: OrderState;
  currency: "usd";
  totalCents: number;
  lines: readonly Readonly<{
    sku: string;
    displayName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    priceId: string;
    priceVersion: number;
  }>[];
  createdAt: string;
}>;

export type ReserveOrderInput = Readonly<{
  orderId: string;
  memberId: string;
  lines: readonly ImmutableOrderLine[];
  actorId: string;
  at: string;
  idempotencyKey: string;
}>;

export type SettleOrderInput = Readonly<{
  orderId: string;
  actorId: string;
  at: string;
  reason: string;
  idempotencyKey: string;
}>;

export type RecordRefundInput = SettleOrderInput & Readonly<{
  refundId: string;
  amountCents: number;
  providerReference: string;
}>;

export type RecordCommissionInput = SettleOrderInput & Readonly<{
  commissionId: string;
  partnerId: string;
  amountCents: number;
  ruleId: string;
  ruleVersion: number;
}>;

export type RecordTrackingInput = SettleOrderInput & Readonly<{
  shipmentId: string;
  carrier: string;
  trackingNumber: string;
  status: string;
}>;

export type LedgerResult<T> =
  | Readonly<{ ok: true; value: T; idempotentReplay: boolean }>
  | Readonly<{ ok: false; code: LedgerDenialCode }>;

export type LedgerDenialCode =
  | "invalid_input"
  | "idempotency_conflict"
  | "order_exists"
  | "order_missing"
  | "order_state_invalid"
  | "inventory_unavailable"
  | "refund_exceeds_paid_total";

export interface PeptideOrderLedger {
  reserve(input: ReserveOrderInput): Promise<LedgerResult<OrderDetail>>;
  release(input: SettleOrderInput): Promise<LedgerResult<OrderDetail>>;
  finalizePaid(input: SettleOrderInput): Promise<LedgerResult<OrderDetail>>;
  recordRefund(input: RecordRefundInput): Promise<LedgerResult<OrderDetail>>;
  recordCommission(input: RecordCommissionInput): Promise<LedgerResult<OrderDetail>>;
  recordTracking(input: RecordTrackingInput): Promise<LedgerResult<OrderDetail>>;
  inventory(sku: string): Promise<InventoryProjection | null>;
  detail(orderId: string, memberId: string): Promise<OrderDetail | null>;
  confirmation(orderId: string, memberId: string): Promise<OrderConfirmationPayload | null>;
}

type MutableInventory = { onHand: number; reserved: number; paidAllocated: number };
type MutableOrder = {
  orderId: string;
  memberId: string;
  state: OrderState;
  currency: "usd";
  totalCents: number;
  lines: ImmutableOrderLine[];
  refunds: RefundProvenance[];
  commissions: CommissionProvenance[];
  tracking: TrackingRecord[];
  history: OrderEvent[];
  createdAt: string;
};

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

function validText(value: string, max = 500): boolean {
  return value.trim() === value && value.length > 0 && value.length <= max;
}

function validId(value: string): boolean {
  return IDENTIFIER.test(value) && value.trim() === value;
}

function validInstant(value: string): boolean {
  if (!INSTANT.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validPositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function cloneLine(line: ImmutableOrderLine): ImmutableOrderLine {
  return { ...line, price: { ...line.price } };
}

function cloneOrder(order: MutableOrder): OrderDetail {
  return {
    ...order,
    lines: order.lines.map(cloneLine),
    refunds: order.refunds.map((item) => ({ ...item })),
    commissions: order.commissions.map((item) => ({ ...item })),
    tracking: order.tracking.map((item) => ({ ...item })),
    history: order.history.map((item) => ({ ...item })),
  };
}

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${fingerprint(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validMetadata(input: SettleOrderInput): boolean {
  return validId(input.orderId) && validId(input.actorId) && validInstant(input.at) &&
    validText(input.reason) && validText(input.idempotencyKey, 160) && input.idempotencyKey.length >= 16;
}

function validateLine(line: ImmutableOrderLine): boolean {
  return validId(line.sku) && validText(line.displayName, 200) &&
    Number.isSafeInteger(line.quantity) && line.quantity > 0 &&
    validPositiveCents(line.unitPriceCents) && validPositiveCents(line.lineTotalCents) &&
    line.lineTotalCents === line.unitPriceCents * line.quantity &&
    Number.isSafeInteger(line.lineTotalCents) && validId(line.price.priceId) &&
    Number.isSafeInteger(line.price.priceVersion) && line.price.priceVersion > 0 &&
    validId(line.price.approvedBy) && validInstant(line.price.approvedAt) &&
    line.price.currency === "usd";
}

export function createInMemoryPeptideOrderLedger(
  initialInventory: Readonly<Record<string, number>>,
): PeptideOrderLedger {
  const stock = new Map<string, MutableInventory>();
  for (const [sku, onHand] of Object.entries(initialInventory)) {
    if (!validId(sku) || !Number.isSafeInteger(onHand) || onHand < 0) {
      throw new TypeError("invalid initial inventory");
    }
    stock.set(sku, { onHand, reserved: 0, paidAllocated: 0 });
  }

  const orders = new Map<string, MutableOrder>();
  const idempotency = new Map<string, { fingerprint: string; orderId: string }>();
  let queue: Promise<void> = Promise.resolve();

  function serialized<T>(operation: () => T | Promise<T>): Promise<T> {
    const current = queue.then(operation, operation);
    queue = current.then(() => undefined, () => undefined);
    return current;
  }

  function replay(
    operation: string,
    key: string,
    input: unknown,
  ): LedgerResult<OrderDetail> | null {
    const found = idempotency.get(`${operation}:${key}`);
    if (!found) return null;
    if (found.fingerprint !== fingerprint(input)) return { ok: false, code: "idempotency_conflict" };
    const order = orders.get(found.orderId);
    return order
      ? { ok: true, value: cloneOrder(order), idempotentReplay: true }
      : { ok: false, code: "order_missing" };
  }

  function remember(operation: string, key: string, input: unknown, orderId: string): void {
    idempotency.set(`${operation}:${key}`, { fingerprint: fingerprint(input), orderId });
  }

  function event(order: MutableOrder, input: SettleOrderInput, type: OrderEvent["type"]): void {
    order.history.push({
      sequence: order.history.length + 1,
      type,
      at: input.at,
      actorId: input.actorId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async function append(
    operation: string,
    input: SettleOrderInput,
    type: OrderEvent["type"],
    mutate: (order: MutableOrder) => LedgerDenialCode | void,
  ): Promise<LedgerResult<OrderDetail>> {
    return serialized(() => {
      if (!validMetadata(input)) return { ok: false, code: "invalid_input" };
      const prior = replay(operation, input.idempotencyKey, input);
      if (prior) return prior;
      const order = orders.get(input.orderId);
      if (!order) return { ok: false, code: "order_missing" };
      const denied = mutate(order);
      if (denied) return { ok: false, code: denied };
      event(order, input, type);
      remember(operation, input.idempotencyKey, input, order.orderId);
      return { ok: true, value: cloneOrder(order), idempotentReplay: false };
    });
  }

  return {
    reserve(input) {
      return serialized(() => {
        if (!validId(input.orderId) || !validId(input.memberId) || !validId(input.actorId) ||
          !validInstant(input.at) || !validText(input.idempotencyKey, 160) ||
          input.idempotencyKey.length < 16 || input.lines.length < 1 || input.lines.length > 100 ||
          input.lines.some((line) => !validateLine(line)) ||
          new Set(input.lines.map((line) => line.sku)).size !== input.lines.length) {
          return { ok: false, code: "invalid_input" };
        }
        const prior = replay("reserve", input.idempotencyKey, input);
        if (prior) return prior;
        if (orders.has(input.orderId)) return { ok: false, code: "order_exists" };

        // Validate the entire basket before making a single inventory mutation.
        for (const line of input.lines) {
          const item = stock.get(line.sku);
          if (!item || item.onHand - item.reserved - item.paidAllocated < line.quantity) {
            return { ok: false, code: "inventory_unavailable" };
          }
        }
        const totalCents = input.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
        if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
          return { ok: false, code: "invalid_input" };
        }

        for (const line of input.lines) stock.get(line.sku)!.reserved += line.quantity;
        const order: MutableOrder = {
          orderId: input.orderId,
          memberId: input.memberId,
          state: "reserved",
          currency: "usd",
          totalCents,
          lines: input.lines.map(cloneLine),
          refunds: [],
          commissions: [],
          tracking: [],
          history: [{
            sequence: 1,
            type: "reserved",
            at: input.at,
            actorId: input.actorId,
            reason: "checkout_inventory_hold",
            idempotencyKey: input.idempotencyKey,
          }],
          createdAt: input.at,
        };
        orders.set(order.orderId, order);
        remember("reserve", input.idempotencyKey, input, order.orderId);
        return { ok: true, value: cloneOrder(order), idempotentReplay: false };
      });
    },

    release(input) {
      return append("release", input, "released", (order) => {
        if (order.state !== "reserved") return "order_state_invalid";
        for (const line of order.lines) stock.get(line.sku)!.reserved -= line.quantity;
        order.state = "released";
      });
    },

    finalizePaid(input) {
      return append("finalizePaid", input, "paid_allocated", (order) => {
        if (order.state !== "reserved") return "order_state_invalid";
        for (const line of order.lines) {
          const item = stock.get(line.sku)!;
          item.reserved -= line.quantity;
          item.paidAllocated += line.quantity;
        }
        order.state = "paid_allocated";
      });
    },

    recordRefund(input) {
      return append("recordRefund", input, "refund_recorded", (order) => {
        if (order.state !== "paid_allocated" || !validId(input.refundId) ||
          !validPositiveCents(input.amountCents) || !validId(input.providerReference)) {
          return "invalid_input";
        }
        const alreadyRefunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
        if (alreadyRefunded + input.amountCents > order.totalCents) return "refund_exceeds_paid_total";
        order.refunds.push({
          refundId: input.refundId,
          amountCents: input.amountCents,
          providerReference: input.providerReference,
          reason: input.reason,
          actorId: input.actorId,
          recordedAt: input.at,
        });
      });
    },

    recordCommission(input) {
      return append("recordCommission", input, "commission_recorded", (order) => {
        if (order.state !== "paid_allocated" || !validId(input.commissionId) ||
          !validId(input.partnerId) || !validPositiveCents(input.amountCents) ||
          !validId(input.ruleId) || !Number.isSafeInteger(input.ruleVersion) || input.ruleVersion < 1) {
          return "invalid_input";
        }
        order.commissions.push({
          commissionId: input.commissionId,
          partnerId: input.partnerId,
          amountCents: input.amountCents,
          ruleId: input.ruleId,
          ruleVersion: input.ruleVersion,
          actorId: input.actorId,
          recordedAt: input.at,
        });
      });
    },

    recordTracking(input) {
      return append("recordTracking", input, "tracking_recorded", (order) => {
        if (order.state !== "paid_allocated" || !validId(input.shipmentId) ||
          !validText(input.carrier, 100) || !validText(input.trackingNumber, 160) ||
          !validText(input.status, 100)) return "invalid_input";
        order.tracking.push({
          shipmentId: input.shipmentId,
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          status: input.status,
          recordedAt: input.at,
        });
      });
    },

    inventory(sku) {
      return serialized(() => {
        const item = stock.get(sku);
        return item ? {
          sku,
          onHand: item.onHand,
          reserved: item.reserved,
          paidAllocated: item.paidAllocated,
          available: item.onHand - item.reserved - item.paidAllocated,
        } : null;
      });
    },

    detail(orderId, memberId) {
      return serialized(() => {
        const order = orders.get(orderId);
        return order && order.memberId === memberId ? cloneOrder(order) : null;
      });
    },

    confirmation(orderId, memberId) {
      return serialized(() => {
        const order = orders.get(orderId);
        if (!order || order.memberId !== memberId) return null;
        return {
          orderId: order.orderId,
          state: order.state,
          currency: order.currency,
          totalCents: order.totalCents,
          lines: order.lines.map((line) => ({
            sku: line.sku,
            displayName: line.displayName,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            lineTotalCents: line.lineTotalCents,
            priceId: line.price.priceId,
            priceVersion: line.price.priceVersion,
          })),
          createdAt: order.createdAt,
        };
      });
    },
  };
}
