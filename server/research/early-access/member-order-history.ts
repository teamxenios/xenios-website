import type { Request, Response } from "express";
import {
  EARLY_ACCESS_MEMBER_FULFILLMENT_STATES,
  EARLY_ACCESS_MEMBER_PAYMENT_STATES,
  type EarlyAccessMemberOrderView,
} from "@shared/research/early-access-member-history";
import type { MemberRow } from "../member-auth";
import { isEarlyAccessOrderNumber } from "./routes/order-number";
import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./persistence/executor";

const RPC = {
  customerRefsForMember: "research_early_access_customer_refs_for_member",
  ordersForMember: "research_early_access_orders_for_member",
  orderForMember: "research_early_access_order_for_member",
} as const;

const MEMBER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_REF = /^eac_[a-f0-9]{32}$/;
const CURRENCY = /^[A-Z]{3}$/;

export interface EarlyAccessMemberOrderHistory {
  customerRefsFor(memberId: string): Promise<readonly string[]>;
  listForMember(memberId: string): Promise<readonly EarlyAccessMemberOrderView[]>;
  getForMember(memberId: string, orderNumber: string): Promise<EarlyAccessMemberOrderView | null>;
}
function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function oneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function readOrder(value: unknown, fn: string): EarlyAccessMemberOrderView {
  const row = expectObject(fn, value);
  const source = row.source;
  const orderNumber = string(row.orderNumber);
  const placedAt = string(row.placedAt);
  const totalCents = nonnegativeInteger(row.totalCents);
  const currency = string(row.currency);
  const paymentState = row.paymentState;
  const fulfillmentState = row.fulfillmentState;
  const lineValues = expectArray(fn, row.lines);
  const trackingValues = expectArray(fn, row.tracking);
  if (
    source !== "early_access_placement"
    || orderNumber === null
    || !isEarlyAccessOrderNumber(orderNumber)
    || placedAt === null
    || !Number.isFinite(Date.parse(placedAt))
    || totalCents === null
    || currency === null
    || !CURRENCY.test(currency)
    || !oneOf(paymentState, EARLY_ACCESS_MEMBER_PAYMENT_STATES)
    || !oneOf(fulfillmentState, EARLY_ACCESS_MEMBER_FULFILLMENT_STATES)
    || lineValues.length !== 1
  ) {
    throw new EarlyAccessPersistenceError(fn);
  }

  const lines = lineValues.map((entry) => {
    const line = expectObject(fn, entry);
    const sku = string(line.sku);
    const quantity = positiveInteger(line.quantity);
    const lineTotalCents = nonnegativeInteger(line.lineTotalCents);
    if (sku === null || quantity === null || lineTotalCents === null) {
      throw new EarlyAccessPersistenceError(fn);
    }
    return Object.freeze({ sku, quantity, lineTotalCents });
  });
  const tracking = trackingValues.map((entry) => {
    const fact = expectObject(fn, entry);
    const carrier = string(fact.carrier);
    const trackingNumber = string(fact.trackingNumber);
    const recordedAt = string(fact.recordedAt);
    if (
      carrier === null
      || trackingNumber === null
      || recordedAt === null
      || !Number.isFinite(Date.parse(recordedAt))
    ) {
      throw new EarlyAccessPersistenceError(fn);
    }
    return Object.freeze({ carrier, trackingNumber, recordedAt });
  });

  return Object.freeze({
    source,
    orderNumber,
    placedAt,
    lines: Object.freeze(lines),
    totalCents,
    currency,
    paymentState,
    fulfillmentState,
    tracking: Object.freeze(tracking),
  });
}

/** Durable, storage-scoped reader over the M62 member/customer binding. */
export class SupabaseEarlyAccessMemberOrderHistory implements EarlyAccessMemberOrderHistory {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async customerRefsFor(memberId: string): Promise<readonly string[]> {
    if (!MEMBER_ID.test(memberId)) return Object.freeze([]);
    const raw = expectArray(
      RPC.customerRefsForMember,
      await runEarlyAccessCall(this.query, {
        fn: RPC.customerRefsForMember,
        args: { p_member_id: memberId },
      }),
    );
    const refs = raw.map((entry) => string(entry));
    if (refs.some((entry) => entry === null || !CUSTOMER_REF.test(entry))) {
      throw new EarlyAccessPersistenceError(RPC.customerRefsForMember);
    }
    return Object.freeze(Array.from(new Set(refs as string[])).sort());
  }

  async listForMember(memberId: string): Promise<readonly EarlyAccessMemberOrderView[]> {
    const refs = await this.customerRefsFor(memberId);
    if (refs.length === 0) return Object.freeze([]);
    const raw = expectArray(
      RPC.ordersForMember,
      await runEarlyAccessCall(this.query, {
        fn: RPC.ordersForMember,
        args: { p_member_id: memberId },
      }),
    );
    return Object.freeze(raw.map((entry) => readOrder(entry, RPC.ordersForMember)));
  }

  async getForMember(
    memberId: string,
    orderNumber: string,
  ): Promise<EarlyAccessMemberOrderView | null> {
    if (!isEarlyAccessOrderNumber(orderNumber)) return null;
    const refs = await this.customerRefsFor(memberId);
    if (refs.length === 0) return null;
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.orderForMember,
      args: { p_member_id: memberId, p_order_number: orderNumber },
    });
    return raw === null || raw === undefined
      ? null
      : readOrder(raw, RPC.orderForMember);
  }
}

function privateHeaders(response: Response): void {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function registerEarlyAccessMemberOrderHistoryRoutes(
  app: Pick<import("express").Express, "get">,
  dependencies: {
    resolveMember(request: Request): Promise<MemberRow | null>;
    history: EarlyAccessMemberOrderHistory;
  },
): void {
  app.get("/api/research/early-access/member-orders", (request: Request, response: Response) => {
    privateHeaders(response);
    void dependencies.resolveMember(request)
      .then(async (member) => {
        if (member === null) {
          response.status(401).json({ ok: false, code: "member_auth_required" });
          return;
        }
        const orders = await dependencies.history.listForMember(member.id);
        response.status(200).json({ ok: true, orders });
      })
      .catch(() => response.status(503).json({ ok: false, code: "unavailable" }));
  });

  app.get(
    "/api/research/early-access/member-orders/:orderNumber",
    (request: Request, response: Response) => {
      privateHeaders(response);
      void dependencies.resolveMember(request)
        .then(async (member) => {
          if (member === null) {
            response.status(401).json({ ok: false, code: "member_auth_required" });
            return;
          }
          const orderNumber = String(request.params.orderNumber ?? "");
          const order = await dependencies.history.getForMember(member.id, orderNumber);
          if (order === null) {
            response.status(404).json({ ok: false, code: "order_not_found" });
            return;
          }
          response.status(200).json({ ok: true, order });
        })
        .catch(() => response.status(503).json({ ok: false, code: "unavailable" }));
    },
  );
}
