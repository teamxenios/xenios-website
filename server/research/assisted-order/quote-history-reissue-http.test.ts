// HIST-02 mounted protocol regression, not a substitute for SQL eligibility
// tests. Express, its adapter/viewer resolver, finance and route descriptors are
// real. Upstream authentication and RPC responses are synthetic ports. These
// tests cannot prove database history guards, locks, grants or stored prices;
// the disposable-database migration tests must prove those independently.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AssistedOrderFinanceService } from "./finance";
import { createAssistedOrderRouteTable } from "./http";
import {
  assistedOrderExpressHandler,
  createAssistedOrderViewerResolvers,
  type ExpressAssistedOrderRequest,
} from "./express";
import type { AssistedOrderService } from "./service";
import type { SupabaseRpcClient } from "./supabase-repository";

const REQUEST = "a1000000-0000-4000-8000-000000000abc";
const MEMBER = "b2000000-0000-4000-8000-000000000def";
const ADMIN = "c3000000-0000-4000-8000-000000000abc";
const QUOTE = "d4000000-0000-4000-8000-000000000def";
const OLD_QUOTE = "e5000000-0000-4000-8000-000000000abc";
const LINES = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
const REFERENCE = "XRR-20260930-ABCDEF0011";
const ADMIN_LABEL = "synthetic-admin@example.test";
const ADMIN_BEARER = "Bearer synthetic-verified-admin";
const EXPIRES = "2026-10-20T12:00:00.000Z";
const ISSUE = "/api/admin/research/assisted-orders/:requestId/quote";
const READ = "/api/research/early-access/assisted-orders/:publicReference/quote";
const ACCEPT = `${READ}/accept`;
const issueUrl = `/api/admin/research/assisted-orders/${REQUEST}/quote`;
const acceptUrl = `/api/research/early-access/assisted-orders/${REFERENCE}/quote/accept`;

function issuedQuote(version = 1) {
  const unitPrices = [16927, 6250, 10750];
  return {
    quoteId: QUOTE, requestPublicReference: REFERENCE, version, state: "issued",
    totalCents: 33927, currency: "USD", validUntil: EXPIRES,
    lines: LINES.map((lineId, index) => ({
      lineId, productId: `synthetic-product-${index}`, variantId: `synthetic-variant-${index}`,
      productName: `Synthetic stored item ${index + 1}`, specification: "fixture specification",
      quantity: 1, unitPriceCents: unitPrices[index], lineTotalCents: unitPrices[index],
      currency: "USD", priceSource: "catalog",
    })),
  };
}

function issueBody() {
  return { lineDecisions: LINES.map((lineId) => ({ lineId })), validUntil: EXPIRES };
}

function mounted(respond: SupabaseRpcClient["rpc"]) {
  const rpc = vi.fn(respond);
  const finance = new AssistedOrderFinanceService({ rpc }, null);
  const viewers = createAssistedOrderViewerResolvers({
    resolveMember: async (req) => req.headers["x-synthetic-member"] === "owner"
      ? { id: MEMBER, authUserId: MEMBER, email: "synthetic-owner@example.test" } : null,
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => ADMIN_LABEL,
  });
  // Non-finance descriptors are never mounted or invoked in this harness.
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    {} as AssistedOrderService, viewers, null, finance,
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers.authorization === ADMIN_BEARER) {
      Object.assign(req, { adminAuthUserId: ADMIN });
    }
    // Deliberately let unstamped callers reach the real finance guard. This
    // proves its 403, not the separate production JWT middleware's response.
    next();
  });
  for (const path of [ISSUE, READ, ACCEPT]) {
    const method = path === READ ? "GET" : "POST";
    const route = routes.find((entry) => entry.method === method && entry.path === path);
    if (!route) throw new Error(`Missing finance descriptor: ${path}`);
    if (method === "GET") app.get(path, assistedOrderExpressHandler(route));
    else app.post(path, assistedOrderExpressHandler(route));
  }
  return { app, rpc, routes };
}

describe("HIST-02 mounted quote issue and reissue protocol", () => {
  describe.each(["payment_pending", "payment_review"])("SQL-approved fixture from %s", (_storedStatus) => {
    it.each([1, 2])("returns the exact database-issued version %s without adopting browser totals", async (version) => {
      const stored = issuedQuote(version);
      const h = mounted(async () => ({ data: stored, error: null }));
      const response = await request(h.app).post(issueUrl).set("authorization", ADMIN_BEARER).send({
        ...issueBody(), totalCents: 1, currency: "EUR", version: 999,
        actorId: "browser-actor", memberId: "browser-owner", currentStatus: "reviewing",
        accepted: true, paid: true,
      });
      expect(response.status).toBe(201);
      expect(response.body).toEqual(stored);
      expect(response.body.lines.map((line: { unitPriceCents: number }) => line.unitPriceCents)).toEqual([16927, 6250, 10750]);
      expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_quote_issue", {
        p_request_id: REQUEST, p_line_decisions: issueBody().lineDecisions,
        p_valid_until: EXPIRES, p_actor_id: ADMIN_LABEL, p_customer_note: null,
      });
      expect(h.routes.find((route) => route.method === "POST" && route.path === ISSUE)?.auth).toBe("admin");
    });
  });

  it.each(["anonymous", "member", "browser-admin-claim"])("refuses %s before the quote RPC", async (caller) => {
    const h = mounted(async () => ({ data: issuedQuote(), error: null }));
    const response = await request(h.app).post(issueUrl)
      .set("x-synthetic-member", caller === "member" ? "owner" : "none")
      .set("authorization", caller === "browser-admin-claim" ? "Bearer unverified" : "")
      .send({ ...issueBody(), actorType: "admin", authUserId: ADMIN, actorLabel: ADMIN_LABEL,
        capabilities: ["assisted_orders:manage"] });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("forbidden");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "accepted quote exists", "payment observation exists", "verification exists", "paid history exists",
    "held or Care line", "stored price override", "invalid expiry",
  ])("preserves the database denial for %s as 409 without retry or repricing", async (reason) => {
    const h = mounted(async () => ({ data: null,
      error: { code: "P0001", message: `synthetic private eligibility detail: ${reason}` } }));
    const response = await request(h.app).post(issueUrl).set("authorization", ADMIN_BEARER).send(issueBody());
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("financial_action_refused");
    expect(JSON.stringify(response.body)).not.toContain("synthetic private eligibility detail");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("forwards an explicit line-price decision without turning it into browser total authority", async () => {
    const h = mounted(async () => ({ data: null, error: { code: "P0001", message: "stored catalog price does not match" } }));
    const body = issueBody();
    const decisions = body.lineDecisions.map((line, index) => index === 0 ? { ...line, unitPriceCents: 1 } : line);
    const response = await request(h.app).post(issueUrl).set("authorization", ADMIN_BEARER)
      .send({ ...body, lineDecisions: decisions, totalCents: 1 });
    expect(response.status).toBe(409);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_quote_issue", {
      p_request_id: REQUEST, p_line_decisions: decisions, p_valid_until: EXPIRES,
      p_actor_id: ADMIN_LABEL, p_customer_note: null,
    });
  });
});

describe("HIST-02 reissue does not silently accept another quote", () => {
  const current = () => ({ ...issuedQuote(2), requestId: REQUEST, publicReference: REFERENCE });

  it("does not swap a superseded quote id for the latest owner projection", async () => {
    const h = mounted(async () => ({ data: current(), error: null }));
    const response = await request(h.app).post(acceptUrl).set("x-synthetic-member", "owner")
      .send({ quoteId: OLD_QUOTE, version: 1, expectedTotalCents: 33927 });
    expect(response.status).toBe(404);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_quote_get", {
      p_public_reference: REFERENCE, p_member_id: MEMBER,
      p_early_access_session_hash: null, p_status_token_hash: null,
    });
  });

  it.each([{ version: 1, expectedTotalCents: 33927 }, { version: 2, expectedTotalCents: 33926 }])(
    "requires the exact displayed version and total %j", async (input) => {
      const h = mounted(async () => ({ data: current(), error: null }));
      const response = await request(h.app).post(acceptUrl).set("x-synthetic-member", "owner")
        .send({ quoteId: QUOTE, ...input });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("quote_stale");
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps a database acceptance race or expiry refusal at 409 with no replacement attempt", async () => {
    const h = mounted(async (name) => name === "research_assisted_order_quote_get"
      ? { data: current(), error: null }
      : { data: null, error: { code: "P0001", details: "ASSISTED_ORDER_QUOTE_STALE", message: "synthetic expired or superseded" } });
    const response = await request(h.app).post(acceptUrl).set("x-synthetic-member", "owner")
      .send({ quoteId: QUOTE, version: 2, expectedTotalCents: 33927 });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("quote_stale");
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_quote_get", "research_assisted_order_quote_accept",
    ]);
  });

  it("accepts only the current explicit quote and never equates acceptance with payment", async () => {
    const accepted = { ...current(), state: "accepted" };
    const h = mounted(async (name) => ({ data: name === "research_assisted_order_quote_get" ? current() : accepted, error: null }));
    const response = await request(h.app).post(acceptUrl).set("x-synthetic-member", "owner")
      .send({ quoteId: QUOTE, version: 2, expectedTotalCents: 33927 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(accepted);
    expect(h.rpc).toHaveBeenLastCalledWith("research_assisted_order_quote_accept", {
      p_quote_id: QUOTE, p_version: 2, p_expected_total_cents: 33927,
      p_member_id: MEMBER, p_early_access_session_hash: null, p_status_token_hash: null,
    });
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_quote_get", "research_assisted_order_quote_accept",
    ]);
    expect(response.body).not.toHaveProperty("paymentVerified");
  });
});
