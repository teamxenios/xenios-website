import express from "express";
import request from "supertest";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { describe, expect, it, vi } from "vitest";
import type { CareRole } from "../../../../../shared/care/contracts";
import { requireRequestProcessor } from "./access";

const actor = "10000000-0000-4000-8000-000000000001";
function token(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: actor, aal: "aal2", exp: Date.now() / 1000 + 3600, ...overrides })}.fixture`;
}
function app({ role = "request_intent_processor" as CareRole, principal = true, enabled = true,
  assurance = true, auditFails = false } = {}) {
  const audit = vi.fn(async () => { if (auditFails) throw Error("offline"); });
  const sdk = vi.fn(async (_token: string) => assurance);
  const resolve = vi.fn(async () => principal ? { subjectId: actor, roles: [role] } : null);
  const handler = express();
  handler.post("/start", requireRequestProcessor({ resolvePrincipal: resolve, recordAccessDecision: audit,
    loadCapabilityStatus: async () => { throw Error("not a Care rail activation"); } }, () => enabled, sdk),
  (_req, res) => res.json(res.locals.requestIntentProcessor));
  return { handler, audit, sdk };
}
describe("explicit request processor authority", () => {
  it("requires canonical verified principal, process role, live same-subject aal2 and current SDK assurance", async () => {
    const good = app();
    expect((await request(good.handler).post("/start").auth(token(), { type: "bearer" })).body)
      .toEqual({ actorId: actor, mfaVerified: true });
    expect(good.sdk).toHaveBeenCalledOnce();
    for (const claims of [{ aal: "aal1" }, { sub: "different" }, { exp: 1 }, { aal: undefined }]) {
      expect((await request(good.handler).post("/start").auth(token(claims), { type: "bearer" })).status).toBe(403);
    }
    for (const role of ["request_intent_reader", "clinical_admin", "care_security_admin"] as const) {
      expect((await request(app({ role }).handler).post("/start").auth(token(), { type: "bearer" })).status).toBe(403);
    }
    expect((await request(app({ principal: false }).handler).post("/start").auth(token(), { type: "bearer" })).status).toBe(401);
    expect((await request(app({ assurance: false }).handler).post("/start").auth(token(), { type: "bearer" })).status).toBe(403);
    expect((await request(app({ auditFails: true }).handler).post("/start").auth(token(), { type: "bearer" })).status).toBe(503);
    expect((await request(app({ enabled: false }).handler).post("/start").auth(token(), { type: "bearer" })).status).toBe(503);
  });
  it("exercises the installed SDK's actual currentLevel semantics with an explicit fake Auth endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: actor,
      aud: "authenticated", factors: [{ id: "factor-fixture", status: "verified", factor_type: "totp" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createClient("https://auth-fixture.example.invalid", "synthetic-anon-key", {
      global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // Match server/supabase.ts: Node20 needs the installed transport even
      // though this Auth-only exercise never opens a realtime connection.
      realtime: { transport: ws as unknown as typeof WebSocket },
    });
    const aal1 = await client.auth.mfa.getAuthenticatorAssuranceLevel(token({ aal: "aal1" }));
    expect(aal1.error).toBeNull();
    expect(aal1.data).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });
    const aal2 = await client.auth.mfa.getAuthenticatorAssuranceLevel(token());
    expect(aal2.data?.currentLevel).toBe("aal2");
    expect(fetch).toHaveBeenCalledTimes(2);
    // Synthetic Auth responses qualify SDK integration only, never a real staff session.
  });
});
