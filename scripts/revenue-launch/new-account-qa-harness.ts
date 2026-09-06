/**
 * Disposable new-account qualification harness. This module is never imported
 * by the production server or client bundle. It composes the shipped account
 * preview with the real inspection, approval, claim, and Auth boundaries over
 * one loopback-only in-memory state.
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAccountPortalPreviewApp } from "../preview-account-portal";
import { registerAccessInspectionApi, type AccessInspectionDependencies } from "../../server/research/access-admin";
import { registerApprovedCustomerAccessApi, claimApprovedCustomerAccount, type ApprovedCustomerAccessDependencies } from "../../server/research/approved-customer-access";
import { makeApprovedCustomerClaimToken, readResearchToken } from "../../server/research/membership";
import { APPROVED_CUSTOMER_SCHEMA_VERSION } from "../../shared/research/approved-customer-access";
import { requireSupabaseAdmin } from "../../server/routes";

export const NEW_ACCOUNT_EMAIL = "new-account@preview.invalid";
export const NEW_ACCOUNT_APPLICATION_ID = "00000000-0000-4000-8000-00000000c001";
export const NEW_ACCOUNT_MEMBER_ID = "00000000-0000-4000-8000-00000000c002";
export const NEW_ACCOUNT_AUTH_ID = "00000000-0000-4000-8000-00000000c003";
export const ADMIN_AUTH_ID = "00000000-0000-4000-8000-00000000c099";
export const CONTROLLER_KEY = "local-qualification-controller";
const ADMIN_EMAIL = "admin@preview.invalid";
const ADMIN_TOKEN = "x." + Buffer.from(JSON.stringify({ sub: ADMIN_AUTH_ID, email: ADMIN_EMAIL, role: "authenticated", amr: [{ method: "password" }] })).toString("base64url") + ".x";

export type QualificationState = {
  approved: boolean;
  claimed: boolean;
  password: string | null;
  claimToken: string | null;
  outbox: Array<{ eventType: string; recipient: string; token?: string }>;
};

function prepend(app: Express, register: () => void): void {
  const router = (app as any).router ?? (app as any)._router;
  const stack: any[] = router?.stack ?? [];
  const before = stack.length;
  app.use(express.json());
  register();
  const added = stack.splice(before);
  stack.unshift(...added);
}

export function buildNewAccountQaHarness(): { app: Express; state: QualificationState; adminToken: string } {
  if (process.env.NODE_ENV === "production") throw new Error("qualification harness refuses production mode");
  process.env.NODE_ENV = "test";
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.SUPABASE_URL = "http://127.0.0.1:5237";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-service-role";
  process.env.SUPABASE_ANON_KEY = "local-anon-key";
  const { app } = buildAccountPortalPreviewApp({ ...process.env, NODE_ENV: "test" });
  const indexPath = path.resolve(process.cwd(), "dist", "public", "index.html");
  const state: QualificationState = { approved: false, claimed: false, password: null, claimToken: null, outbox: [] };
  const users = new Map<string, { id: string; email: string; password: string; verified: boolean }>();
  const tokenFor = (id: string, email: string, recovery = false) => "x." + Buffer.from(JSON.stringify({ sub: id, email, role: "authenticated", amr: [{ method: recovery ? "recovery" : "password" }] })).toString("base64url") + ".x";
  const adminGuard: (req: Request, res: Response, next: NextFunction) => void = (req, res, next) => {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ success: false, message: "Unauthorized" });
    next();
  };
  const inspection: AccessInspectionDependencies = {
    inspect: async (email) => ({
      auth: users.has(email) ? [{ id: NEW_ACCOUNT_AUTH_ID, email, emailVerified: true, signInRecorded: true }] : [],
      applications: state.approved ? [{ id: NEW_ACCOUNT_APPLICATION_ID, email, status: "approved_customer", updatedAt: new Date().toISOString() }] : [],
      approvedCustomerAccess: true,
      partnerLifecycleReview: true,
      members: state.claimed ? [{ id: NEW_ACCOUNT_MEMBER_ID, email, authUserId: NEW_ACCOUNT_AUTH_ID, status: "active" }] : [],
      partners: [],
      organizations: { state: "available", records: [] },
    }),
    membershipBillingEnabled: () => false,
    now: () => new Date(),
  };
  const deps: ApprovedCustomerAccessDependencies = {
    authority: async () => ({ schemaVersion: APPROVED_CUSTOMER_SCHEMA_VERSION }),
    approve: async (input) => {
      if (input.email !== NEW_ACCOUNT_EMAIL) return { ok: false, code: "claim_not_available" };
      state.approved = true;
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      state.claimToken = makeApprovedCustomerClaimToken(NEW_ACCOUNT_APPLICATION_ID, expiresAt);
      state.outbox.push({ eventType: "approved_customer_claim", recipient: NEW_ACCOUNT_EMAIL, token: state.claimToken });
      return { ok: true, applicationId: NEW_ACCOUNT_APPLICATION_ID, approvalVersion: 1, state: "approved_customer", delivery: "queued", expiresAt, replayed: false };
    },
    claim: async (applicationId, authUserId) => {
      if (!state.approved || applicationId !== NEW_ACCOUNT_APPLICATION_ID || authUserId !== NEW_ACCOUNT_AUTH_ID) return { ok: false, code: "claim_not_available" };
      state.claimed = true;
      state.outbox.push({ eventType: "approved_customer_welcome", recipient: NEW_ACCOUNT_EMAIL });
      return { ok: true, applicationId, memberId: NEW_ACCOUNT_MEMBER_ID, state: "active", replayed: false };
    },
    createAuth: async (email, password) => { if (users.has(email)) return { kind: "exists" }; users.set(email, { id: NEW_ACCOUNT_AUTH_ID, email, password, verified: true }); state.password = password; return { kind: "created", userId: NEW_ACCOUNT_AUTH_ID, email, emailVerified: true }; },
    verifySignIn: async (authorization) => { const token = authorization.replace(/^Bearer /, ""); const u = [...users.values()].find((x) => token === tokenFor(x.id, x.email)); return u?.verified ? { userId: u.id, email: u.email, emailVerified: true } : null; },
    kickOutbox: async () => {},
  };

  // Local Auth-provider boundary used by canonical requireSupabaseAdmin and
  // the SPA's normal password sign-in. Recovery-purpose tokens are rejected by
  // the production guard's denyRecoveryPurposeSession check.
  prepend(app, () => {
    for (const route of ["/admin/research/members", "/research/apply/status", "/research/sign-in", "/research/account", "/research/partners/dashboard"]) {
      app.get(route, (_req, res) => res.type("html").send(readFileSync(indexPath)));
    }
    const issueToken = (req: Request, res: Response) => {
      if (String(req.query.grant_type) !== "password") return res.status(400).json({ error: "unsupported_grant_type" });
      const email = String(req.body?.email ?? "").toLowerCase(); const password = String(req.body?.password ?? "");
      const ok = email === ADMIN_EMAIL ? password === "admin-preview-password" : users.get(email)?.password === password;
      if (!ok) return res.status(400).json({ error: "invalid_grant" });
      const id = email === ADMIN_EMAIL ? ADMIN_AUTH_ID : NEW_ACCOUNT_AUTH_ID;
      const token = email === ADMIN_EMAIL ? ADMIN_TOKEN : tokenFor(id, email);
      return res.json({ access_token: token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "local-refresh", user: { id, email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} } });
    };
    app.post("/preview-auth/auth/v1/token", issueToken);
    app.post("/auth/v1/token", issueToken);
    const userInfo = (req: Request, res: Response) => {
      const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (token === ADMIN_TOKEN) return res.json({ id: ADMIN_AUTH_ID, email: ADMIN_EMAIL, email_confirmed_at: new Date().toISOString() });
      const u = [...users.values()].find((x) => token === tokenFor(x.id, x.email));
      return u ? res.json({ id: u.id, email: u.email, email_confirmed_at: new Date().toISOString() }) : res.status(401).json({ error: "invalid_token" });
    };
    app.get("/preview-auth/auth/v1/user", userInfo);
    app.get("/auth/v1/user", userInfo);
    app.get("/api/admin/me", adminGuard, (_req, res) => res.json({ success: true, email: ADMIN_EMAIL }));
    const customerBearer = (req: Request) => String(req.headers.authorization ?? "").replace(/^Bearer /, "") === tokenFor(NEW_ACCOUNT_AUTH_ID, NEW_ACCOUNT_EMAIL) && state.claimed;
    app.get("/api/research/member/me", (req, res) => customerBearer(req) ? res.json({ ok: true, member: { firstName: "New", status: "active", applicationStatus: "approved" } }) : res.status(401).json({ ok: false, message: "Sign in required." }));
    app.get("/api/research/applications/status", (req, res) => {
      const token = String(req.query.token ?? "");
      const applicationId = readResearchToken(token, ["status", "account_claim"]);
      if (!applicationId || applicationId !== NEW_ACCOUNT_APPLICATION_ID || token !== state.claimToken) return res.status(401).json({ ok: false, code: "claim_not_available" });
      return res.json({ ok: true, application: { status: state.claimed ? "active" : "approved_customer", firstName: "New", submittedAt: new Date().toISOString(), memberVisibleNote: null, approvalExpiresAt: new Date(Date.now() + 86400000).toISOString() } });
    });
    const accountOverview = {
      identity: { displayName: "New Customer", email: NEW_ACCOUNT_EMAIL, accountStatus: "active", memberSince: null },
      partnerAttribution: null,
      membership: { state: "none", billing: "none", planLabel: null, manageUrl: null, manualBilling: true, renewal: { state: "not_scheduled", nextRenewalAt: null }, nextRenewalAt: null },
      careEnrollment: { sourceState: "unavailable" }, researchOrders: [],
      orderHistory: { availability: "unavailable", authoritativeRecordCount: null, sources: { commerce: { connected: false, complete: false }, xea: { connected: false, complete: false }, xec: { connected: false, complete: false }, xrr: { connected: false, complete: false } } },
      accountStanding: "indeterminate", productInterests: [], documents: [], supportCases: [], nextAdministrativeAction: null,
    };
    app.get("/api/research/customer-account/overview", (req, res) => customerBearer(req) ? res.json({ kind: "ok", data: accountOverview }) : res.status(401).json({ kind: "denied", reason: "account_access_denied" }));
    app.get("/api/research/customer-account/catalog-priority", (req, res) => customerBearer(req) ? res.json({ kind: "error" }) : res.status(401).json({ kind: "denied", reason: "account_access_denied" }));
    registerAccessInspectionApi(app, inspection, requireSupabaseAdmin);
    registerApprovedCustomerAccessApi(app, deps, requireSupabaseAdmin);
    app.post("/api/research/member/claim", async (req, res) => {
      const token = String(req.body?.token ?? ""); const applicationId = readResearchToken(token, ["account_claim"]);
      if (!applicationId || applicationId !== NEW_ACCOUNT_APPLICATION_ID || token !== state.claimToken) return res.status(401).json({ ok: false, code: "claim_not_available" });
      const result = await claimApprovedCustomerAccount(deps, { applicationId, email: NEW_ACCOUNT_EMAIL, password: String(req.body?.password ?? "") });
      return res.status(result.ok ? 200 : 409).json(result);
    });
    app.get("/__qualification/state", (req, res) => {
      const body = { approved: state.approved, claimed: state.claimed, outbox: state.outbox.map(({ eventType, recipient }) => ({ eventType, recipient })), account: state.claimed ? { email: NEW_ACCOUNT_EMAIL, memberId: NEW_ACCOUNT_MEMBER_ID, status: "active", billing: false, partner: false, admin: false } : null };
      if (req.headers["x-qualification-controller"] === CONTROLLER_KEY) return res.json({ ...body, claimToken: state.claimToken });
      return res.json(body);
    });
  });
  return { app, state, adminToken: ADMIN_TOKEN };
}

if (process.argv[1]?.includes("new-account-qa-harness")) {
  const port = Number(process.env.PORT ?? 5237); const { app } = buildNewAccountQaHarness();
  app.listen(port, "127.0.0.1", () => console.log(`[new-account-qa-harness] loopback http://127.0.0.1:${port}`));
}
