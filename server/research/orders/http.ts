// The customer-facing HTTP surface for canonical order history.
//
// Two routes, both read-only, both member-authenticated. There is deliberately
// NO customer-facing write route in this table: conversion, payment
// verification and fulfillment are operator acts on evidence, so no request a
// customer can send appears here at all. That is stronger than authorizing
// such a route to admins only, because a route that does not exist cannot be
// misconfigured into existence.
//
// The subject comes from the route's own member resolver, never from the body
// or the query. A caller therefore cannot name whose history to read.

import {
  CANONICAL_ORDER_HISTORY_PATH,
  isCanonicalOrderNumber,
} from "@shared/research/orders/canonical-order";
import type { CanonicalOrderService } from "./service";

export type CanonicalOrderHttpRequest = Readonly<{
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
  params: Readonly<Record<string, string | undefined>>;
  body: unknown;
}>;

export type CanonicalOrderHttpResponse = Readonly<{
  status: number;
  headers?: Readonly<Record<string, string>>;
  body: unknown;
}>;

export type CanonicalOrderRouteDescriptor = Readonly<{
  method: "GET";
  path: string;
  auth: "member";
  handler: (request: CanonicalOrderHttpRequest) => Promise<CanonicalOrderHttpResponse>;
}>;

/**
 * Resolves the authenticated member from the request. Returns null for an
 * unauthenticated caller. The composition root supplies the SAME resolver the
 * other member routes use, so this surface cannot drift into its own idea of
 * who is signed in.
 */
export interface CanonicalOrderMemberResolver<Request = CanonicalOrderHttpRequest> {
  resolve(request: Request): Promise<string | null>;
}

const jsonHeaders = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  // A purchase history is per-customer and must never sit in a shared cache.
  "cache-control": "no-store",
});

function respond(status: number, body: unknown): CanonicalOrderHttpResponse {
  return Object.freeze({ status, headers: jsonHeaders, body });
}

export function createCanonicalOrderRouteTable<Request extends CanonicalOrderHttpRequest>(
  service: Pick<CanonicalOrderService, "listForMember" | "getForMember">,
  members: CanonicalOrderMemberResolver<Request>,
): readonly CanonicalOrderRouteDescriptor[] {
  async function memberOf(request: CanonicalOrderHttpRequest): Promise<string | null> {
    return members.resolve(request as Request);
  }

  return Object.freeze([
    Object.freeze({
      method: "GET" as const,
      path: CANONICAL_ORDER_HISTORY_PATH,
      auth: "member" as const,
      async handler(request: CanonicalOrderHttpRequest): Promise<CanonicalOrderHttpResponse> {
        const memberId = await memberOf(request);
        if (memberId === null) {
          return respond(401, { ok: false, code: "unauthorized" });
        }
        try {
          const orders = await service.listForMember(memberId);
          return respond(200, { ok: true, orders });
        } catch {
          // A failed durable read must NOT become an empty history. To a
          // customer who has just paid, "you have no orders" is indistinguishable
          // from a real answer and invites a second purchase.
          return respond(503, {
            ok: false,
            code: "order_history_unavailable",
            message: "Your order history could not be loaded. Please try again.",
          });
        }
      },
    }),

    Object.freeze({
      method: "GET" as const,
      path: `${CANONICAL_ORDER_HISTORY_PATH}/:orderNumber`,
      auth: "member" as const,
      async handler(request: CanonicalOrderHttpRequest): Promise<CanonicalOrderHttpResponse> {
        const memberId = await memberOf(request);
        if (memberId === null) {
          return respond(401, { ok: false, code: "unauthorized" });
        }
        const orderNumber = request.params.orderNumber ?? "";
        // A malformed id is not-found, the same answer a valid id belonging to
        // someone else gets. The two are indistinguishable from outside.
        if (!isCanonicalOrderNumber(orderNumber)) {
          return respond(404, { ok: false, code: "order_not_found" });
        }
        try {
          const order = await service.getForMember(memberId, orderNumber);
          if (order === null) {
            return respond(404, { ok: false, code: "order_not_found" });
          }
          return respond(200, { ok: true, order });
        } catch {
          return respond(503, {
            ok: false,
            code: "order_history_unavailable",
            message: "Your order could not be loaded. Please try again.",
          });
        }
      },
    }),
  ]);
}
