// @vitest-environment jsdom
// Adapter-layer contract tests. Part 1 proves the result-mapping matrix for
// BOTH adapters (partner and adminOps): every HTTP outcome lands on exactly
// one honest ApiResult / SubmitOutcome branch, paths are built centrally, and
// the bearer discipline holds (token attached when present, absent when not).
// Part 2 proves the persona PRESENTATION: an unauthorized (401) admin API
// result renders the shared denied state, and a partner-applicant surface
// renders the honest unavailable panel rather than fake data.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Supabase browser mock (admin session for the adminx render test; core.tsx
// imports the same module). The session is controlled per test.
const supa = vi.hoisted(() => {
  const state = { session: null as any };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { state, auth };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  clearPersistedRecoverySession: vi.fn(() => true),
  revokeRecoverySession: vi.fn(async () => {}),
  recoveryAccessTokenFromHash: () => null,
}));

import {
  PARTNER_API,
  applyAsPartner,
  getPartnerCommissions,
  getPartnerDashboard,
  getPartnerLeads,
  requestCampaign,
} from "./partner";
import {
  answerQuestion,
  getCommerceQueues,
  getQuestion,
  listAdminClaims,
  listApplications,
  listMembers,
  listOutbox,
  postApplicationAction,
  refundClaim,
  resolveClaimWithReplacement,
  reviewClaim,
  runOutbox,
} from "./adminOps";
import { ResearchContext, type ResearchContextValue } from "../core";
import Members from "../pages/adminx/Members";
import Commissions from "../pages/partners/Commissions";

// ---------------------------------------------------------------------------
// fetch plumbing
// ---------------------------------------------------------------------------

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };
const calls: Call[] = [];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body } as unknown as Response;
}

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input?.url ?? input));
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return handler(url, init);
  }) as any;
}

beforeEach(() => {
  calls.length = 0;
  supa.state.session = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// ---------------------------------------------------------------------------
// Part 1a: the partner adapter result-mapping matrix
// ---------------------------------------------------------------------------

describe("partner adapter result mapping", () => {
  it("200 with a JSON body maps to ok with the parsed data", async () => {
    installFetch(() => jsonResponse({ entries: [{ id: "c1" }] }));
    const result = await getPartnerCommissions<{ entries: Array<{ id: string }> }>("member-jwt");
    expect(result).toEqual({ kind: "ok", data: { entries: [{ id: "c1" }] } });
  });

  it("401 maps to unauthorized", async () => {
    installFetch(() => jsonResponse({}, 401));
    expect(await getPartnerCommissions(null)).toEqual({ kind: "unauthorized" });
  });

  it("403 maps to forbidden and carries the server message", async () => {
    installFetch(() => jsonResponse({ message: "Partner grants do not exist yet." }, 403));
    expect(await getPartnerCommissions("member-jwt")).toEqual({
      kind: "forbidden",
      message: "Partner grants do not exist yet.",
    });
  });

  it("403 WITH a machine code maps to denied (routable on code)", async () => {
    installFetch(() => jsonResponse({ ok: false, code: "partner_not_active", message: "x" }, 403));
    expect(await getPartnerDashboard("member-jwt")).toEqual({
      kind: "denied",
      code: "partner_not_active",
      message: "x",
    });
  });

  it("200 with ok:false and a machine code maps to denied", async () => {
    installFetch(() => jsonResponse({ ok: false, code: "commerce_disabled" }));
    expect(await getPartnerDashboard("member-jwt")).toEqual({
      kind: "denied",
      code: "commerce_disabled",
    });
  });

  it.each([404, 501, 503])("%i maps to unavailable, never invented data", async (status) => {
    installFetch(() => jsonResponse({}, status));
    expect(await getPartnerCommissions("member-jwt")).toEqual({ kind: "unavailable" });
  });

  it("500 maps to error and carries the server message", async () => {
    installFetch(() => jsonResponse({ message: "boom" }, 500));
    expect(await getPartnerCommissions("member-jwt")).toEqual({ kind: "error", message: "boom" });
  });

  it("a network failure maps to the connection error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as any;
    expect(await getPartnerCommissions("member-jwt")).toEqual({
      kind: "error",
      message: "The connection failed. Please try again.",
    });
  });

  it("attaches the member bearer token and hits the adapter-owned path", async () => {
    installFetch(() => jsonResponse({}));
    await getPartnerDashboard("member-jwt");
    expect(calls[0].url).toBe(PARTNER_API.dashboard);
    expect(calls[0].url).toBe("/api/research/partner/dashboard");
    expect(calls[0].headers["Authorization"]).toBe("Bearer member-jwt");
  });

  it("sends no Authorization header when there is no token", async () => {
    installFetch(() => jsonResponse({}));
    await getPartnerLeads(null);
    expect(calls[0].url).toBe("/api/research/partner/leads");
    expect(calls[0].headers["Authorization"]).toBeUndefined();
  });
});

describe("partner adapter submissions", () => {
  const UNAVAILABLE = "Nothing was submitted; email the team instead.";

  it("200 maps to accepted with the server message", async () => {
    installFetch(() => jsonResponse({ message: "Thanks, application received." }));
    const outcome = await applyAsPartner({ name: "A" }, "member-jwt", UNAVAILABLE);
    expect(outcome).toEqual({ kind: "accepted", message: "Thanks, application received." });
    expect(calls[0].url).toBe("/api/research/partner/apply");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ name: "A" });
  });

  it("200 without a message maps to accepted with the default copy", async () => {
    installFetch(() => jsonResponse({}));
    const outcome = await applyAsPartner({}, null, UNAVAILABLE);
    expect(outcome).toEqual({ kind: "accepted", message: "Received. The team will follow up by email." });
  });

  it.each([403, 404, 501, 503])(
    "%i maps to the honest unavailable outcome (never a fake success)",
    async (status) => {
      installFetch(() => jsonResponse({}, status));
      const outcome = await applyAsPartner({}, "member-jwt", UNAVAILABLE);
      expect(outcome).toEqual({ kind: "unavailable", message: UNAVAILABLE });
    },
  );

  it("401 maps to the session-ended error", async () => {
    installFetch(() => jsonResponse({}, 401));
    const outcome = await applyAsPartner({}, "expired-jwt", UNAVAILABLE);
    expect(outcome).toEqual({ kind: "error", message: "Your session has ended. Please sign in again and retry." });
  });

  it("500 maps to error with the server message", async () => {
    installFetch(() => jsonResponse({ message: "storage down" }, 500));
    const outcome = await requestCampaign({ name: "Launch" }, "member-jwt", UNAVAILABLE);
    expect(outcome).toEqual({ kind: "error", message: "storage down" });
    expect(calls[0].url).toBe("/api/research/partner/campaigns/request");
  });
});

// ---------------------------------------------------------------------------
// Part 1b: the adminOps adapter result-mapping matrix and bearer discipline
// ---------------------------------------------------------------------------

describe("adminOps adapter result mapping", () => {
  it("200 maps to ok with the parsed data", async () => {
    installFetch(() => jsonResponse({ ok: true, members: [] }));
    expect(await listMembers("admin-token")).toEqual({ kind: "ok", data: { ok: true, members: [] } });
  });

  it("401 maps to unauthorized (rendered as the denied state, below)", async () => {
    installFetch(() => jsonResponse({}, 401));
    expect(await listMembers("admin-token")).toEqual({ kind: "unauthorized" });
  });

  it("403 maps to forbidden with the server message", async () => {
    installFetch(() => jsonResponse({ message: "Not an operations account." }, 403));
    expect(await listMembers("admin-token")).toEqual({ kind: "forbidden", message: "Not an operations account." });
  });

  it.each([404, 501, 503])("%i maps to unavailable", async (status) => {
    installFetch(() => jsonResponse({}, status));
    expect(await listMembers("admin-token")).toEqual({ kind: "unavailable" });
  });

  it("500 maps to error", async () => {
    installFetch(() => jsonResponse({ message: "db down" }, 500));
    expect(await listMembers("admin-token")).toEqual({ kind: "error", message: "db down" });
  });

  it("every call carries the admin bearer token; paths and queries are built centrally", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await listApplications("admin-token", "under_review");
    await getQuestion("admin-token", "q/1");
    await listOutbox("admin-token");
    await listOutbox("admin-token", "pending");
    expect(calls.map((c) => c.url)).toEqual([
      "/api/admin/research/applications?queue=under_review",
      "/api/admin/research/questions/q%2F1",
      "/api/admin/research/outbox",
      "/api/admin/research/outbox?status=pending",
    ]);
    for (const call of calls) expect(call.headers["Authorization"]).toBe("Bearer admin-token");
  });

  it("getCommerceQueues GETs the frozen commerce queues path with the bearer token", async () => {
    installFetch(() => jsonResponse({ ok: true, queues: {} }));
    expect(await getCommerceQueues("admin-token")).toEqual({ kind: "ok", data: { ok: true, queues: {} } });
    expect(calls[0].url).toBe("/api/admin/research/commerce/queues");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers["Authorization"]).toBe("Bearer admin-token");
  });

  it("getCommerceQueues surfaces a coded 403 as denied", async () => {
    installFetch(() => jsonResponse({ ok: false, code: "forbidden" }, 403));
    expect(await getCommerceQueues("admin-token")).toEqual({ kind: "denied", code: "forbidden" });
  });

  it("actions POST to the adapter-owned paths with the JSON body and the token", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await postApplicationAction("admin-token", "app-1", "approve", { note: "ok" });
    await runOutbox("admin-token");
    expect(calls[0]).toMatchObject({
      url: "/api/admin/research/applications/app-1/approve",
      method: "POST",
    });
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ note: "ok" });
    expect(calls[1]).toMatchObject({ url: "/api/admin/research/outbox/run", method: "POST" });
    expect(calls[1].headers["Authorization"]).toBe("Bearer admin-token");
  });

  it("answerQuestion POSTs the REAL answer endpoint with {answerText, status} (the /reply route never existed)", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await answerQuestion("admin-token", "q/1", { answerText: "Here is the plan.", status: "answer_ready" });
    expect(calls[0]).toMatchObject({
      url: "/api/admin/research/questions/q%2F1/answer",
      method: "POST",
    });
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ answerText: "Here is the plan.", status: "answer_ready" });
    expect(calls[0].headers["Authorization"]).toBe("Bearer admin-token");
  });

  it("listAdminClaims GETs the admin claims path", async () => {
    installFetch(() => jsonResponse({ ok: true, claims: [] }));
    expect(await listAdminClaims("admin-token")).toEqual({ kind: "ok", data: { ok: true, claims: [] } });
    expect(calls[0]).toMatchObject({ url: "/api/admin/research/claims", method: "GET" });
  });

  it("reviewClaim POSTs the decision (and only a given note) to the review path", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await reviewClaim("admin-token", "clm 1", "approved");
    await reviewClaim("admin-token", "clm 1", "declined", "not covered");
    expect(calls[0]).toMatchObject({
      url: "/api/admin/research/claims/clm%201/review",
      method: "POST",
    });
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ decision: "approved" });
    expect(JSON.parse(calls[1].body ?? "{}")).toEqual({ decision: "declined", note: "not covered" });
  });

  it("refundClaim POSTs integer cents plus the idempotency key to the refund path", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await refundClaim("admin-token", "clm-2", 4525, "idem-key-1");
    expect(calls[0]).toMatchObject({
      url: "/api/admin/research/claims/clm-2/refund",
      method: "POST",
    });
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ amountCents: 4525, idempotencyKey: "idem-key-1" });
  });

  it("resolveClaimWithReplacement POSTs the replacement path with an empty body", async () => {
    installFetch(() => jsonResponse({ ok: true }));
    await resolveClaimWithReplacement("admin-token", "clm-3");
    expect(calls[0]).toMatchObject({
      url: "/api/admin/research/claims/clm-3/replacement",
      method: "POST",
    });
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({});
  });

  it("surfaces an out-of-order refund as the routable order_state_invalid denial", async () => {
    installFetch(() => jsonResponse({ ok: false, code: "order_state_invalid", message: "not approved" }, 400));
    expect(await refundClaim("admin-token", "clm-4", 100, "idem-2")).toEqual({
      kind: "denied",
      code: "order_state_invalid",
      message: "not approved",
    });
  });
});

// ---------------------------------------------------------------------------
// Part 2: persona presentation. The adapters' results must land on honest UI.
// ---------------------------------------------------------------------------

function mountedRoot(node: ReactNode): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { root, container };
}

describe("admin persona presentation", () => {
  it("a 401 from the admin API renders the honest denied state via the shared boundary, not data", async () => {
    supa.state.session = { access_token: "admin-token" };
    installFetch((url) => {
      if (url.startsWith("/api/admin/me")) return jsonResponse({ success: true, email: "ops@xenios.test" });
      if (url.startsWith("/api/admin/research/members")) return jsonResponse({}, 401);
      return jsonResponse({ ok: true });
    });

    const { root, container } = mountedRoot(createElement(Members));
    await flush();

    const text = container.textContent ?? "";
    // The shared AdminBoundary denied state, verbatim.
    expect(text).toContain("Your admin session has ended.");
    expect(text).toContain("Authority is checked by the server on every request.");
    // No invented roster: neither rows nor the empty-table state that would
    // imply a successful, empty read.
    expect(text).not.toContain("No member accounts yet.");
    act(() => root.unmount());
  });
});

describe("partner applicant persona presentation", () => {
  it("a partner surface without grants renders the unavailable panel rather than fake data", async () => {
    // An applicant member: signed in, but the partner platform is not live for
    // them (the server answers 403 while partner grants do not exist).
    installFetch((url) => {
      if (url.startsWith("/api/research/partner/")) return jsonResponse({ message: "No partner grant." }, 403);
      return jsonResponse({ ok: true });
    });

    const fixture = {
      gate: "open",
      member: { firstName: "Avery", status: "active" },
      memberToken: "member-jwt",
      memberChecking: false,
      recovery: "none",
    } as unknown as ResearchContextValue;

    const { root, container } = mountedRoot(
      createElement(ResearchContext.Provider, { value: fixture }, createElement(Commissions)),
    );
    await flush();

    const text = container.textContent ?? "";
    // The honest pending panel, shared across the partner family.
    expect(text).toContain("The partner platform is being prepared.");
    // No fabricated ledger: no empty-state that implies a working ledger, no
    // amounts, no fake rows.
    expect(text).not.toContain("No commission entries yet.");
    expect(text).not.toMatch(/\$\d/);
    act(() => root.unmount());
  });
});
