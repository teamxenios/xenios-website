import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The production catalog-display authorizer: server-derived audience only,
// null for every caller the server cannot positively identify, admin by
// ADMIN_EMAIL equality on the server-verified JWT email, member by ACTIVE
// membership with billing parity. Mirrors resolveResearchMember and
// requireSupabaseAdmin; writes no responses and never throws.

const state = vi.hoisted(() => ({
  configured: true,
  authUser: null as null | { id: string; email?: string },
  authError: null as null | { message: string },
  memberRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => state.configured,
  getSupabaseAnon: () => ({
    auth: {
      getUser: async (_jwt: string) => ({
        data: { user: state.authUser },
        error: state.authError,
      }),
    },
  }),
  getSupabaseAdmin: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, value: unknown) => ({
          maybeSingle: async () => ({
            data:
              state.memberRows.find((row) => row[col] === value) ?? null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { authorizeCatalogDisplayViewer } from "./catalog-display-viewer";

function reqWith(auth?: string): Request {
  return { headers: auth ? { authorization: auth } : {} } as unknown as Request;
}

// A structurally valid JWT whose payload carries the given claims; the
// signature is a dummy because authenticity comes from the mocked getUser.
function jwtWith(claims: Record<string, unknown>): string {
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

const PASSWORD_JWT = jwtWith({ sub: "auth-1", amr: [{ method: "password", timestamp: 1 }] });
const RECOVERY_JWT = jwtWith({ sub: "auth-1", amr: [{ method: "otp", timestamp: 1 }] });

const ENV_KEYS = ["ADMIN_EMAIL", "RESEARCH_MEMBERSHIP_BILLING_ENABLED"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  state.configured = true;
  state.authUser = null;
  state.authError = null;
  state.memberRows = [];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("authorizeCatalogDisplayViewer", () => {
  it("null without a bearer token, null when supabase is unconfigured", async () => {
    state.configured = false;
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toBeNull();
    state.configured = true;
    expect(await authorizeCatalogDisplayViewer(reqWith())).toBeNull();
  });

  it("null when the JWT does not verify", async () => {
    state.authError = { message: "invalid token" };
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toBeNull();
  });

  it("null for a recovery-purpose session even when it maps to the admin email", async () => {
    process.env.ADMIN_EMAIL = "samuel@xeniostechnology.com";
    state.authUser = { id: "auth-1", email: "samuel@xeniostechnology.com" };
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${RECOVERY_JWT}`))).toBeNull();
  });

  it("admin audience by server-verified email equality with ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = " Samuel@XeniosTechnology.com ";
    state.authUser = { id: "auth-1", email: "samuel@xeniostechnology.com" };
    const viewer = await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`));
    expect(viewer).toEqual({ audience: "admin", email: "samuel@xeniostechnology.com" });
  });

  it("member audience for an ACTIVE member resolved by auth user id", async () => {
    state.authUser = { id: "auth-9", email: "member@example.com" };
    state.memberRows = [
      { auth_user_id: "auth-9", email: "member@example.com", status: "active" },
    ];
    const viewer = await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`));
    expect(viewer).toEqual({ audience: "member", email: "member@example.com" });
  });

  it("an email-only match resolves NO viewer (P1-1: the legacy fallback is gone)", async () => {
    // The caller's Auth account shares an email with someone else's member
    // row. Email reuse must never inherit a membership: null, not a viewer.
    state.authUser = { id: "auth-unknown", email: "member@example.com" };
    state.memberRows = [
      { auth_user_id: "other", email: "member@example.com", status: "active" },
    ];
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toBeNull();
  });

  it("null for pending_activation, past_due, closed, and missing members", async () => {
    state.authUser = { id: "auth-9", email: "member@example.com" };
    for (const status of ["pending_activation", "past_due", "closed"]) {
      state.memberRows = [
        { auth_user_id: "auth-9", email: "member@example.com", status },
      ];
      expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`)), status).toBeNull();
    }
    state.memberRows = [];
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toBeNull();
  });

  it("billing parity: an active member with blocked billing is null only when billing is enforced", async () => {
    state.authUser = { id: "auth-9", email: "member@example.com" };
    state.memberRows = [
      { auth_user_id: "auth-9", email: "member@example.com", status: "active", billing_state: "past_due" },
    ];
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toEqual({
      audience: "member",
      email: "member@example.com",
    });
    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
    expect(await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`))).toBeNull();
  });

  it("an ordinary member is never the admin audience", async () => {
    process.env.ADMIN_EMAIL = "samuel@xeniostechnology.com";
    state.authUser = { id: "auth-9", email: "member@example.com" };
    state.memberRows = [
      { auth_user_id: "auth-9", email: "member@example.com", status: "active" },
    ];
    const viewer = await authorizeCatalogDisplayViewer(reqWith(`Bearer ${PASSWORD_JWT}`));
    expect(viewer?.audience).toBe("member");
  });
});
