// Adapter state-matrix tests. Every member adapter is driven
// against a stubbed fetch, proving two things: (1) each function calls its
// exact endpoint with the right method, bearer token, and JSON body, and
// (2) every server outcome maps to the one honest ApiResult shape the pages
// render from: ok (loading resolves to data), ok-but-empty, unavailable
// (404/503, an unpublished endpoint is a pending state, never fake data),
// error (500), and unauthorized (401).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../lib/api";
import {
  acknowledgeDocument,
  acknowledgeXenios30,
  cancelMembership,
  acceptResearchAgreement,
  getAssessment,
  getAssessmentMode,
  getBlueprint,
  getDocuments,
  getMemberOverview,
  getMembership,
  getPrivacySummary,
  getProfile,
  getSensitiveProfile,
  getResearchAgreements,
  getSecuritySessions,
  getXenios30Plan,
  getXenios90Plan,
  requestPrivacyCorrection,
  requestDocumentAccess,
  requestPrivacyDeletion,
  requestPrivacyExport,
  saveAssessment,
  submitAssessment,
  withdrawResearchAgreement,
} from "./member";

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
  { name: "getProfile", invoke: (t) => getProfile(t), path: "/api/research/profile", method: "GET" },
  { name: "getSensitiveProfile", invoke: (t) => getSensitiveProfile(t), path: "/api/research/profile/sensitive", method: "GET" },
  { name: "getAssessment", invoke: (t) => getAssessment(t), path: "/api/research/assessment", method: "GET" },
  {
    name: "getAssessmentMode",
    invoke: (t) => getAssessmentMode("monthly_check_in", t),
    path: "/api/research/assessment?mode=monthly_check_in",
    method: "GET",
  },
  {
    name: "saveAssessment",
    invoke: (t) => saveAssessment({
      definitionId: "initial-v2",
      definitionVersion: 2,
      mode: "initial",
      expectedCycleKey: "initial",
      expectedRevision: 3,
      answers: [{ questionId: "primary_goal", value: "strength" }],
      clientSavedAt: "2026-07-25T00:00:00.000Z",
    }, t),
    path: "/api/research/assessment/responses",
    method: "POST",
    body: {
      definitionId: "initial-v2",
      definitionVersion: 2,
      mode: "initial",
      expectedCycleKey: "initial",
      expectedRevision: 3,
      answers: [{ questionId: "primary_goal", value: "strength" }],
      clientSavedAt: "2026-07-25T00:00:00.000Z",
    },
  },
  {
    name: "submitAssessment",
    invoke: (t) => submitAssessment({
      definitionId: "initial-v2",
      definitionVersion: 2,
      mode: "initial",
      expectedCycleKey: "initial",
      expectedRevision: 4,
      confirmReviewed: true,
    }, t),
    path: "/api/research/assessment/submit",
    method: "POST",
    body: {
      definitionId: "initial-v2",
      definitionVersion: 2,
      mode: "initial",
      expectedCycleKey: "initial",
      expectedRevision: 4,
      confirmReviewed: true,
    },
  },
  {
    name: "getResearchAgreements",
    invoke: (t) => getResearchAgreements(t),
    path: "/api/research/agreements",
    method: "GET",
  },
  {
    name: "acceptResearchAgreement",
    invoke: (t) => acceptResearchAgreement("XR-MEM-012", "draft-2026-07-18", "a".repeat(64), t),
    path: "/api/research/agreements",
    method: "POST",
    body: {
      decisions: [{
        key: "XR-MEM-012",
        version: "draft-2026-07-18",
        decision: "accepted",
        contentHash: "a".repeat(64),
      }],
    },
  },
  {
    name: "withdrawResearchAgreement",
    invoke: (t) => withdrawResearchAgreement("XR-MEM-012", t),
    path: "/api/research/agreements/XR-MEM-012/withdraw",
    method: "POST",
    body: {},
  },
  { name: "getBlueprint", invoke: (t) => getBlueprint(t), path: "/api/research/blueprint", method: "GET" },
  { name: "getXenios30Plan", invoke: (t) => getXenios30Plan(t), path: "/api/research/member/plans/xenios-30", method: "GET" },
  {
    name: "acknowledgeXenios30",
    invoke: (t) => acknowledgeXenios30("2026-07", t),
    path: "/api/research/member/plans/xenios-30/acknowledge",
    method: "POST",
    body: { version: "2026-07" },
  },
  { name: "getXenios90Plan", invoke: (t) => getXenios90Plan(t), path: "/api/research/plans/xenios90", method: "GET" },
  { name: "getDocuments", invoke: (t) => getDocuments(t), path: "/api/research/documents", method: "GET" },
  {
    name: "requestDocumentAccess",
    invoke: (t) => requestDocumentAccess("doc/id", t),
    path: "/api/research/documents/doc%2Fid/access",
    method: "POST",
    body: {},
  },
  {
    name: "acknowledgeDocument",
    invoke: (t) => acknowledgeDocument("doc/id", 3, t),
    path: "/api/research/documents/doc%2Fid/acknowledge",
    method: "POST",
    body: { documentId: "doc/id", version: 3 },
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
  const passthroughAdapters = ADAPTERS.filter(
    ({ name }) => name !== "getProfile" && name !== "getSensitiveProfile",
  );

  // The pending promise IS the page's loading state; it must resolve to ok
  // with the server payload, never anything invented.
  it.each(passthroughAdapters)("$name: loading resolves to ok with the server data", async (spec) => {
    const payload = { ok: true, marker: "server-data" };
    stubFetch(200, payload);
    const pending = spec.invoke(TOKEN);
    expect(pending).toBeInstanceOf(Promise);
    const res = await pending;
    expect(res).toEqual({ kind: "ok", data: payload });
  });

  it.each(passthroughAdapters)("$name: an empty 200 payload is still ok, with empty data", async (spec) => {
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

  it.each(passthroughAdapters)("$name: 500 maps to error with the server message", async (spec) => {
    stubFetch(500, { message: "database unavailable" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "error", message: "database unavailable" });
  });

  it.each(ADAPTERS)("$name: 401 maps to unauthorized", async (spec) => {
    stubFetch(401, { message: "expired" });
    const res = await spec.invoke(TOKEN);
    expect(res).toEqual({ kind: "unauthorized" });
  });

  it("a profile 500 without a message uses fixed local error copy", async () => {
    stubFetch(500, {});
    const res = await getProfile(TOKEN);
    expect(res).toEqual({ kind: "error", message: "We could not load your profile. Please try again." });
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

describe("profile DTO validation", () => {
  const updatedAt = "2026-07-30T12:00:00.000Z";
  const ordinary = {
    ok: true,
    profile: {
      memberId: "m1",
      sections: [{ key: "goals", schemaVersion: 1, data: { primary_goal: "Consistency" }, updatedAt }],
      completeness: { completedSections: 1, totalSections: 17 },
    },
  };
  const sensitive = {
    ok: true,
    sections: [{ key: "sleep", schemaVersion: 1, data: { quality: "Variable" }, updatedAt }],
  };

  it("accepts the exact ordinary and sensitive envelopes", async () => {
    stubFetch(200, ordinary);
    await expect(getProfile(TOKEN)).resolves.toEqual({ kind: "ok", data: ordinary });
    stubFetch(200, sensitive);
    await expect(getSensitiveProfile(TOKEN)).resolves.toEqual({ kind: "ok", data: sensitive });
  });

  it.each([
    ["extra envelope key", { ...ordinary, unexpected: true }],
    ["empty member id", { ...ordinary, profile: { ...ordinary.profile, memberId: " " } }],
    ["unknown section", { ...ordinary, profile: { ...ordinary.profile, sections: [{ ...ordinary.profile.sections[0], key: "hostile" }] } }],
    ["sensitive ordinary section", { ...ordinary, profile: { ...ordinary.profile, sections: [{ ...ordinary.profile.sections[0], key: "sleep" }] } }],
    ["duplicate section", { ...ordinary, profile: { ...ordinary.profile, sections: [ordinary.profile.sections[0], ordinary.profile.sections[0]] } }],
    ["zero schema version", { ...ordinary, profile: { ...ordinary.profile, sections: [{ ...ordinary.profile.sections[0], schemaVersion: 0 }] } }],
    ["noncanonical timestamp", { ...ordinary, profile: { ...ordinary.profile, sections: [{ ...ordinary.profile.sections[0], updatedAt: "2026-07-30T12:00:00Z" }] } }],
    ["nested object data", { ...ordinary, profile: { ...ordinary.profile, sections: [{ ...ordinary.profile.sections[0], data: { hostile: { echo: "NO" } } }] } }],
  ])("rejects %s", async (_name, payload) => {
    stubFetch(200, payload);
    await expect(getProfile(TOKEN)).resolves.toEqual({
      kind: "error",
      message: "The profile response was incomplete.",
    });
  });

  it("rejects ordinary content from the sensitive endpoint", async () => {
    stubFetch(200, { ...sensitive, sections: [{ ...sensitive.sections[0], key: "goals" }] });
    await expect(getSensitiveProfile(TOKEN)).resolves.toEqual({
      kind: "error",
      message: "The profile response was incomplete.",
    });
  });

  it("does not echo a server error message", async () => {
    stubFetch(500, { message: "HOSTILE_SERVER_ECHO" });
    await expect(getProfile(TOKEN)).resolves.toEqual({
      kind: "error",
      message: "We could not load your profile. Please try again.",
    });
  });
});
