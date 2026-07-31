// URL-pinning tests for the operations console adapters.
//
// This file exists because of a specific failure: the adminx pages had been
// calling /api/admin/research/members, /orders, /questions, /audit,
// /fulfillment and /inventory for a long time and NOTHING was registered at
// those paths. Every one of them fell through to the SPA catch-all, lib/api
// read that as { kind: "unavailable" }, and each page rendered its polite
// "publishes later" panel forever. A 404 wearing a pending state is the
// hardest kind of bug to see, because the surface looks deliberate.
//
// So each path below is pinned to the exact string the server now registers.
// If a future refactor moves a prefix, renames a segment, or reintroduces a
// member/ prefix on an admin route, these tests fail at the commit that does
// it rather than months later on Samuel's console.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../lib/api";
import {
  getMember,
  getOrder,
  getQuestion,
  listAuditEvents,
  listFulfillment,
  listInventory,
  listMembers,
  listOrders,
  listQuestions,
} from "./adminOps";

const TOKEN = "admin-jwt";

type Call = { path: string; method: string; auth: string | undefined };

function stubFetch(status: number, body: unknown): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({
        path,
        method: init?.method ?? "GET",
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Every adapter whose route this lane now backs, with the exact path the
// server registers for it.
const PINNED: Array<{
  name: string;
  invoke: (token: string) => Promise<ApiResult<unknown>>;
  path: string;
}> = [
  { name: "listMembers", invoke: (t) => listMembers(t), path: "/api/admin/research/members" },
  {
    name: "getMember",
    invoke: (t) => getMember(t, "member-1"),
    path: "/api/admin/research/members/member-1",
  },
  { name: "listOrders", invoke: (t) => listOrders(t, "paid"), path: "/api/admin/research/orders?status=paid" },
  { name: "getOrder", invoke: (t) => getOrder(t, "order-1"), path: "/api/admin/research/orders/order-1" },
  {
    name: "listQuestions",
    invoke: (t) => listQuestions(t, "open"),
    path: "/api/admin/research/questions?status=open",
  },
  {
    name: "getQuestion",
    invoke: (t) => getQuestion(t, "question-1"),
    path: "/api/admin/research/questions/question-1",
  },
  { name: "listAuditEvents", invoke: (t) => listAuditEvents(t), path: "/api/admin/research/audit" },
  { name: "listFulfillment", invoke: (t) => listFulfillment(t), path: "/api/admin/research/fulfillment" },
  { name: "listInventory", invoke: (t) => listInventory(t), path: "/api/admin/research/inventory" },
];

describe("operations console adapter URLs", () => {
  it.each(PINNED)("$name calls $path with the admin bearer token", async ({ invoke, path }) => {
    const { calls } = stubFetch(200, { ok: true });
    await invoke(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(path);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].auth).toBe(`Bearer ${TOKEN}`);
  });

  it("never puts a member/ prefix on an admin path", async () => {
    for (const entry of PINNED) {
      expect(entry.path.startsWith("/api/admin/research/")).toBe(true);
      expect(entry.path).not.toContain("/api/admin/research/member/");
    }
  });

  it("sends the empty order queue as an explicit all-orders query", async () => {
    // The console's "All" tab passes "", and the server treats an unknown or
    // empty status as no filter. The query parameter is always present, which
    // is the behavior the page has always had.
    const { calls } = stubFetch(200, { ok: true });
    await listOrders(TOKEN, "");
    expect(calls[0].path).toBe("/api/admin/research/orders?status=");
  });
});

describe("operations console adapter outcomes", () => {
  it.each(PINNED)("$name maps a 404 to unavailable rather than fake data", async ({ invoke }) => {
    stubFetch(404, { ok: false });
    await expect(invoke(TOKEN)).resolves.toEqual({ kind: "unavailable" });
  });

  it.each(PINNED)("$name maps a 403 without a code to forbidden", async ({ invoke }) => {
    stubFetch(403, { ok: false, message: "Admin access required." });
    await expect(invoke(TOKEN)).resolves.toEqual({
      kind: "forbidden",
      message: "Admin access required.",
    });
  });

  it("resolves an empty roster as data, not as a pending state", async () => {
    stubFetch(200, { ok: true, members: [] });
    const result = await listMembers<{ ok: boolean; members: unknown[] }>(TOKEN);
    expect(result).toEqual({ kind: "ok", data: { ok: true, members: [] } });
  });
});
