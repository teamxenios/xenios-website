// Adapter state-matrix tests. Every member and tracker adapter is driven
// against a stubbed fetch, proving two things: (1) each function calls its
// exact endpoint with the right method, bearer token, and JSON body, and
// (2) every server outcome maps to the one honest ApiResult shape the pages
// render from: ok (loading resolves to data), ok-but-empty, unavailable
// (404/503, an unpublished endpoint is a pending state, never fake data),
// error (500), and unauthorized (401).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../lib/api";
import {
  acknowledgeXenios30,
  cancelMembership,
  getAssessment,
  getBlueprint,
  getDocuments,
  getMemberOverview,
  getMembership,
  getPrivacySummary,
  getProfile,
  getSecuritySessions,
  getXenios30Plan,
  getXenios90Plan,
  requestPrivacyCorrection,
  requestPrivacyDeletion,
  requestPrivacyExport,
  submitAssessment,
} from "./member";
import { logTrackerEntry, requestTrackerDeletion, requestTrackerExport } from "./tracker";

const TOKEN = "member-jwt";

type Call = { path: string; method: string; auth: string | undefined; body: unknown };

function stubFetch(status: number, body: unknown): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({
        path,
        method: init?.method ?? "GET",
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
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

// Every adapter, with the exact endpoint contract it owns. `invoke` runs the
// adapter the way its page does; `body` is the JSON the server must receive
// (undefined means a GET with no body).
const TRACKER_ENTRY = {
  sleepHours: 7.5,
  energy: 8,
  trainingDone: true,
  notes: "solid session",
  loggedAt: "2026-07-20T08:00:00.000Z",
};

const ADAPTERS: Array<{
  name: string;
  invoke: (token: string | null) => Promise<ApiResult<unknown>>;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}> = [
  { name: "getMemberOverview", invoke: (t) => getMemberOverview(t), path: "/api/research/member/overview", method: "GET" },
  { name: "getMembership", invoke: (t) => getMembership(t), path: "/api/research/member/membership", method: "GET" },
  {
    name: "cancelMembership",
    invoke: (t) => cancelMembership(t),
    path: "/api/research/member/cancel",
    method: "POST",
    body: { confirm: true },
  },
  {
    name: "getSecuritySessions",
    invoke: (t) => getSecuritySessions(t),
    path: "/api/research/member/security/sessions",
    method: "GET",
  },
  { name: "getPrivacySummary", invoke: (t) => getPrivacySummary(t), path: "/api/research/member/privacy/summary", method: "GET" },
  {
    name: "requestPrivacyExport",
    invoke: (t) => requestPrivacyExport(t),
    path: "/api/research/member/privacy/export",
    method: "POST",
    body: {},
  },
  {
    name: "requestPrivacyCorrection",
    invoke: (t) => requestPrivacyCorrection("my birth year is wrong", t),
    path: "/api/research/member/privacy/correction",
    method: "POST",
    body: { detail: "my birth year is wrong" },
  },
  {
    name: "requestPrivacyDeletion",
    invoke: (t) => requestPrivacyDeletion(t),
    path: "/api/research/member/privacy/deletion",
    method: "POST",
    body: {},
  },
  { name: "getProfile", invoke: (t) => getProfile(t), path: "/api/research/member/profile", method: "GET" },
  { name: "getAssessment", invoke: (t) => getAssessment(t), path: "/api/research/member/assessment", method: "GET" },
  {
    name: "submitAssessment",
    invoke: (t) => submitAssessment({ mode: "checkin", answers: { sleep: "7" } }, t),
    path: "/api/research/member/assessment",
    method: "POST",
    body: { mode: "checkin", answers: { sleep: "7" } },
  },
  { name: "getBlueprint", invoke: (t) => getBlueprint(t), path: "/api/research/member/blueprint", method: "GET" },
  { name: "getXenios30Plan", invoke: (t) => getXenios30Plan(t), path: "/api/research/member/plans/xenios-30", method: "GET" },
  {
    name: "acknowledgeXenios30",
    invoke: (t) => acknowledgeXenios30("2026-07", t),
    path: "/api/research/member/plans/xenios-30/acknowledge",
    method: "POST",
    body: { version: "2026-07" },
  },
  { name: "getXenios90Plan", invoke: (t) => getXenios90Plan(t), path: "/api/research/member/plans/xenios-90", method: "GET" },
  { name: "getDocuments", invoke: (t) => getDocuments(t), path: "/api/research/member/documents", method: "GET" },
  {
    name: "logTrackerEntry",
    invoke: (t) => logTrackerEntry(TRACKER_ENTRY, t),
    path: "/api/research/member/tracker/log",
    method: "POST",
    body: TRACKER_ENTRY,
  },
  {
    name: "requestTrackerExport",
    invoke: (t) => requestTrackerExport("2026-07-20T09:00:00.000Z", t),
    path: "/api/research/member/tracker/export-request",
    method: "POST",
    body: { requestedAt: "2026-07-20T09:00:00.000Z" },
  },
  {
    name: "requestTrackerDeletion",
    invoke: (t) => requestTrackerDeletion("2026-07-20T09:00:00.000Z", t),
    path: "/api/research/member/tracker/delete-request",
    method: "POST",
    body: { requestedAt: "2026-07-20T09:00:00.000Z" },
  },
];

describe("adapter endpoint contracts", () => {
  it.each(ADAPTERS)("$name calls $method $path with the bearer token", async (spec) => {
    const { calls } = stubFetch(200, { ok: true });
    await spec.invoke(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(spec.path);
    expect(calls[0].method).toBe(spec.method);
    expect(calls[0].auth).toBe("Bearer " + TOKEN);
    if (spec.method === "POST") {
      expect(calls[0].body).toEqual(spec.body);
    } else {
      expect(calls[0].body).toBeUndefined();
    }
  });

  it("omits the Authorization header when there is no token", async () => {
    const { calls } = stubFetch(200, { ok: true });
    await getMemberOverview(null);
    expect(calls[0].auth).toBeUndefined();
  });
});

describe("adapter state matrix", () => {
  // The pending promise IS the page's loading state; it must resolve to ok
  // with the server payload, never anything invented.
  it.each(ADAPTERS)("$name: loading resolves to ok with the server data", async (spec) => {
    const payload = { ok: true, marker: "server-data" };
    stubFetch(200, payload);
    const pending = spec.invoke(TOKEN);
    expect(pending).toBeInstanceOf(Promise);
    const res = await pending;
    expect(res).toEqual({ kind: "ok", data: payload });
  });

  it.each(ADAPTERS)("$name: an empty 200 payload is still ok, with empty data", async (spec) => {
    stubFetch(200, {});
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "ok", data: {} });
  });

  it.each(ADAPTERS)("$name: 404 maps to unavailable", async (spec) => {
    stubFetch(404, { message: "not here" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "unavailable" });
  });

  it.each(ADAPTERS)("$name: 503 maps to unavailable", async (spec) => {
    stubFetch(503, { message: "down" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "unavailable" });
  });

  it.each(ADAPTERS)("$name: 500 maps to error with the server message", async (spec) => {
    stubFetch(500, { message: "database unavailable" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "error", message: "database unavailable" });
  });

  it.each(ADAPTERS)("$name: 401 maps to unauthorized", async (spec) => {
    stubFetch(401, { message: "expired" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "unauthorized" });
  });

  it("a 500 without a message falls back to the generic error copy", async () => {
    stubFetch(500, {});
    const res = await getProfile(TOKEN);
    expect(res).toEqual({ kind: "error", message: "Something went wrong. Please try again." });
  });

  it("a network failure maps to the connection error, never a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    const res = await getDocuments(TOKEN);
    expect(res).toEqual({ kind: "error", message: "The connection failed. Please try again." });
  });
});
