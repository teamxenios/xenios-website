import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { MemberRow } from "../member-auth";
import {
  SupabaseEarlyAccessMemberOrderHistory,
  registerEarlyAccessMemberOrderHistoryRoutes,
  type EarlyAccessMemberOrderHistory,
} from "./member-order-history";

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const ORDER_A = "XEA-0000000000000001";

const safeOrder = Object.freeze({
  source: "early_access_placement" as const,
  orderNumber: ORDER_A,
  placedAt: "2026-08-13T02:00:00.000Z",
  lines: Object.freeze([{ sku: "ROMAN-SAFE-UNIT", quantity: 1, lineTotalCents: 12500 }]),
  totalCents: 12500,
  currency: "USD",
  paymentState: "payment_verified" as const,
  fulfillmentState: "supplier_released" as const,
  tracking: Object.freeze([]),
});

function member(id: string): MemberRow {
  return {
    id,
    application_id: "application",
    auth_user_id: `auth-${id}`,
    email: "member@example.com",
    first_name: "Member",
    status: "active",
    created_at: "2026-08-13T00:00:00.000Z",
  };
}

describe("SupabaseEarlyAccessMemberOrderHistory", () => {
  it("runs member -> canonical and alias customer refs -> member-scoped orders", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const history = new SupabaseEarlyAccessMemberOrderHistory(async (call) => {
      calls.push({ fn: call.fn, args: { ...call.args } });
      if (call.fn === "research_early_access_customer_refs_for_member") {
        return [
          "eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ];
      }
      if (call.fn === "research_early_access_orders_for_member") return [safeOrder];
      throw new Error("unexpected RPC");
    });

    expect(await history.customerRefsFor(MEMBER_A)).toEqual([
      "eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    expect(await history.listForMember(MEMBER_A)).toEqual([safeOrder]);
    expect(calls.map((call) => call.fn)).toEqual([
      "research_early_access_customer_refs_for_member",
      "research_early_access_customer_refs_for_member",
      "research_early_access_orders_for_member",
    ]);
    expect(calls.at(-1)?.args).toEqual({ p_member_id: MEMBER_A });
  });

  it("does not query order history when the member owns no durable customer ref", async () => {
    const query = vi.fn(async () => []);
    const history = new SupabaseEarlyAccessMemberOrderHistory(query);
    expect(await history.listForMember(MEMBER_A)).toEqual([]);
    expect(await history.getForMember(MEMBER_A, ORDER_A)).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([call]) => call.fn === "research_early_access_customer_refs_for_member"))
      .toBe(true);
  });

  it("rejects malformed or private-rich database projections instead of forwarding them", async () => {
    const history = new SupabaseEarlyAccessMemberOrderHistory(async (call) => {
      if (call.fn === "research_early_access_customer_refs_for_member") {
        return ["eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
      }
      return [{ ...safeOrder, supplierId: "private-supplier", lines: [] }];
    });
    await expect(history.listForMember(MEMBER_A)).rejects.toThrow(
      /research_early_access_orders_for_member/,
    );
  });

  it("returns foreign or missing detail as null through the member-scoped RPC", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const history = new SupabaseEarlyAccessMemberOrderHistory(async (call) => {
      if (call.fn === "research_early_access_customer_refs_for_member") {
        return ["eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
      }
      calls.push({ ...call.args });
      return null;
    });
    expect(await history.getForMember(MEMBER_B, ORDER_A)).toBeNull();
    expect(calls).toEqual([{ p_member_id: MEMBER_B, p_order_number: ORDER_A }]);
    expect(await history.getForMember(MEMBER_B, "XEA-invalid")).toBeNull();
  });
});

describe("member-authenticated Early Access history routes", () => {
  function appWith(history: EarlyAccessMemberOrderHistory) {
    const app = express();
    registerEarlyAccessMemberOrderHistoryRoutes(app, {
      resolveMember: async (req) => {
        const token = req.headers.authorization;
        if (token === "Bearer member-a") return member(MEMBER_A);
        if (token === "Bearer member-b") return member(MEMBER_B);
        return null;
      },
      history,
    });
    return app;
  }

  const history: EarlyAccessMemberOrderHistory = {
    customerRefsFor: async (memberId) => memberId === MEMBER_A
      ? ["eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
      : [],
    listForMember: async (memberId) => memberId === MEMBER_A ? [safeOrder] : [],
    getForMember: async (memberId, orderNumber) =>
      memberId === MEMBER_A && orderNumber === ORDER_A ? safeOrder : null,
  };

  it("recovers the same durable order after a fresh login request", async () => {
    const app = appWith(history);
    const first = await request(app)
      .get("/api/research/early-access/member-orders")
      .set("Authorization", "Bearer member-a");
    const afterLogin = await request(app)
      .get("/api/research/early-access/member-orders")
      .set("Authorization", "Bearer member-a");
    expect(first.status).toBe(200);
    expect(afterLogin.body).toEqual(first.body);
    expect(afterLogin.body.orders).toEqual([safeOrder]);
    expect(JSON.stringify(afterLogin.body)).not.toMatch(
      /customerRef|supplier(Id|Ref|Sku|Packet|Name)|buyCost|margin|proof|sha256|transaction|actor|shipTo|contact/i,
    );
    expect(afterLogin.headers["cache-control"]).toContain("no-store");
  });

  it("refuses anonymous and cross-member list/detail access", async () => {
    const app = appWith(history);
    expect((await request(app).get("/api/research/early-access/member-orders")).status).toBe(401);
    const otherList = await request(app)
      .get("/api/research/early-access/member-orders")
      .set("Authorization", "Bearer member-b");
    expect(otherList.status).toBe(200);
    expect(otherList.body.orders).toEqual([]);
    const otherDetail = await request(app)
      .get(`/api/research/early-access/member-orders/${ORDER_A}`)
      .set("Authorization", "Bearer member-b");
    expect(otherDetail.status).toBe(404);
    expect(otherDetail.body).toEqual({ ok: false, code: "order_not_found" });
  });

  it("does not let a request-supplied order number bypass member ownership", async () => {
    const app = appWith(history);
    const mine = await request(app)
      .get(`/api/research/early-access/member-orders/${ORDER_A}`)
      .set("Authorization", "Bearer member-a");
    expect(mine.status).toBe(200);
    const forged = await request(app)
      .get(`/api/research/early-access/member-orders/${ORDER_A}`)
      .set("Authorization", "Bearer member-b");
    expect(forged.status).toBe(404);
  });
});
