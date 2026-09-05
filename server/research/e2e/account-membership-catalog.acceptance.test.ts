import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One causal acceptance slice for the deployed Research lifecycle. The route
// registrations below are production code; only Supabase, Auth, and email
// delivery are replaced with deterministic in-memory boundaries.

const state = vi.hoisted(() => {
  const authUsers: Array<{
    id: string;
    email: string;
    password: string;
    emailConfirmed: boolean;
  }> = [];
  return {
    tables: {
      research_applications: [] as any[],
      research_application_events: [] as any[],
      research_members: [] as any[],
      research_notification_outbox: [] as any[],
      research_notification_attempts: [] as any[],
    } as Record<string, any[]>,
    authUsers,
    createUser: vi.fn(async (input: any) => {
      if (authUsers.some((user) => user.email === input.email)) {
        return {
          data: { user: null },
          error: { message: "A user with this email address has already been registered" },
        };
      }
      const user = {
        id: crypto.randomUUID(),
        email: String(input.email),
        password: String(input.password),
        emailConfirmed: input.email_confirm === true,
        email_confirmed_at: input.email_confirm === true ? new Date().toISOString() : null,
      };
      authUsers.push(user);
      return { data: { user }, error: null };
    }),
    deleteUser: vi.fn(async (id: string) => {
      const index = authUsers.findIndex((user) => user.id === id);
      if (index >= 0) authUsers.splice(index, 1);
      return { data: null, error: null };
    }),
    updateUserById: vi.fn(async (id: string, attrs: any) => {
      const user = authUsers.find((candidate) => candidate.id === id);
      if (user && typeof attrs?.password === "string") user.password = attrs.password;
      return { data: { user: user ?? null }, error: user ? null : { message: "not found" } };
    }),
    listUsers: vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
      data: { users: authUsers.slice((page - 1) * perPage, page * perPage) },
      error: null,
    })),
    getUser: vi.fn(async (jwt: string) => {
      try {
        const parts = jwt.split(".");
        if (parts.length !== 3) throw new Error("malformed");
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        const user = authUsers.find(
          (candidate) => candidate.id === payload?.sub && candidate.email === payload?.email,
        );
        if (!user) throw new Error("unknown user");
        return { data: { user: { id: user.id, email: user.email } }, error: null };
      } catch {
        return { data: { user: null }, error: { message: "invalid token", status: 401 } };
      }
    }),
    rpc: vi.fn(async (..._args: any[]) => ({ data: true, error: null })),
  };
});

const emails = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => true),
  sendStatusLink: vi.fn(async () => true),
  sendInternalApplicationAlert: vi.fn(async () => true),
  sendApplicationApproved: vi.fn(async () => true),
  sendApplicationDeclined: vi.fn(async () => true),
  sendMoreInformationRequested: vi.fn(async () => true),
  sendResubmittedConfirmation: vi.fn(async () => true),
  sendAccountClaimSuccess: vi.fn(async () => true),
  sendEmailFailureAlert: vi.fn(async () => true),
  sendAdminTestEmail: vi.fn(async () => ({ ok: true, id: "synthetic-message-id" })),
}));

vi.mock("../../supabase", () => {
  function query(table: string) {
    const rows = (state.tables[table] ??= []);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const equals: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const lowerOrEqual: Array<[string, any]> = [];
    const lowerThan: Array<[string, any]> = [];
    let requiredNonNull: string | null = null;
    let limitCount: number | null = null;

    const filtered = () => {
      let result = rows.filter(
        (row) =>
          equals.every(([column, value]) => row[column] === value) &&
          inFilters.every(([column, values]) => values.includes(row[column])) &&
          lowerOrEqual.every(([column, value]) => row[column] <= value) &&
          lowerThan.every(([column, value]) => row[column] != null && row[column] < value) &&
          (!requiredNonNull || row[requiredNonNull] != null),
      );
      if (limitCount != null) result = result.slice(0, limitCount);
      return result;
    };

    const finish = () => {
      if (mode === "insert") {
        const inserted = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          approval_expires_at: null,
          ...insertPayload,
        };
        rows.push(inserted);
        return { data: inserted, error: null };
      }
      if (mode === "update") {
        const targets = filtered();
        for (const target of targets) Object.assign(target, updatePayload);
        return { data: targets[0] ?? null, error: null };
      }
      return { data: filtered(), error: null };
    };

    const api: any = {
      select: () => api,
      insert: (payload: any) => {
        mode = "insert";
        insertPayload = payload;
        return api;
      },
      update: (payload: any) => {
        mode = "update";
        updatePayload = payload;
        return api;
      },
      eq: (column: string, value: any) => {
        equals.push([column, value]);
        return api;
      },
      in: (column: string, values: any[]) => {
        inFilters.push([column, values]);
        return api;
      },
      lte: (column: string, value: any) => {
        lowerOrEqual.push([column, value]);
        return api;
      },
      lt: (column: string, value: any) => {
        lowerThan.push([column, value]);
        return api;
      },
      not: (column: string) => {
        requiredNonNull = column;
        return api;
      },
      order: () => api,
      limit: (count: number) => {
        limitCount = count;
        return api;
      },
      maybeSingle: async () => {
        const result = finish();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: null };
      },
      single: async () => {
        const result = finish();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return data
          ? { data, error: null }
          : { data: null, error: { message: "not found" } };
      },
      then: (resolve: (value: unknown) => unknown) => resolve(finish()),
    };
    return api;
  }

  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({
      from: query,
      rpc: state.rpc,
      auth: {
        admin: {
          createUser: state.createUser,
          deleteUser: state.deleteUser,
          updateUserById: state.updateUserById,
          listUsers: state.listUsers,
        },
      },
    }),
    getSupabaseAnon: () => ({ auth: { getUser: state.getUser } }),
  };
});

vi.mock("../../routes", () => ({
  requireSupabaseAdmin: (req: any, _res: any, next: any) => {
    req.adminEmail = "release-manager@xenios.invalid";
    next();
  },
}));

vi.mock("../membership-emails", () => emails);

// Delivery is outside this acceptance slice. Returning false exercises the
// production durable-first fallback, which calls the synthetic email adapter
// and lets this test consume the exact purpose-scoped tokens that were sent.
vi.mock("../outbox", () => ({
  enqueueNotification: vi.fn(async () => false),
  runOutboxTick: vi.fn(async () => ({ sent: 0, retried: 0, failed: 0 })),
}));

import { registerMemberAccessApi } from "../guards";
import { registerResearchApi } from "../index";
import { makeApprovedCustomerClaimToken, makeResearchToken, registerMembershipApi } from "../membership";
import { registerMemberApi } from "../members";
import {
  APPROVED_CUSTOMER_SCHEMA_VERSION,
  APPROVE_CUSTOMER_ACCESS_PATH,
} from "@shared/research/approved-customer-access";
import {
  type ApprovedCustomerAccessDependencies,
} from "../approved-customer-access";

const REVIEW_PASSWORD = "synthetic-review-password";
const MEMBER_PASSWORD = "synthetic-member-password";
const CANONICAL_CATALOG_PATH = "/api/research/catalog";
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";

const APPLICATION = {
  firstName: "Infinity",
  lastName: "Member",
  email: "infinity.member@example.invalid",
  country: "United States",
  ageConfirmed: true,
  applicantType: "individual",
  interests: ["Whole-life planning"],
  goalsText: "Build one coherent, privacy-preserving research membership.",
  fitText: "I understand this is an educational membership with gated access.",
  acceptAccuracy: true,
  acceptNoGuarantee: true,
  acceptEducational: true,
  acceptTerms: true,
};

function makePasswordSession(user: { id: string; email: string }): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: user.id,
    email: user.email,
    role: "authenticated",
    iat: issuedAt,
    exp: issuedAt + 3600,
    amr: [{ method: "password", timestamp: issuedAt }],
  })}.synthetic-signature`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  registerMembershipApi(app);
  registerMemberApi(app);
  registerMemberAccessApi(app);
  return app;
}

const originalEnvironment = {
  RESEARCH_ACCESS_PASSWORD: process.env.RESEARCH_ACCESS_PASSWORD,
  RESEARCH_SESSION_SECRET: process.env.RESEARCH_SESSION_SECRET,
  RESEARCH_PUBLIC: process.env.RESEARCH_PUBLIC,
  RESEARCH_MEMBERSHIP_BILLING_ENABLED: process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED,
  RESEARCH_REFERRALS_ENABLED: process.env.RESEARCH_REFERRALS_ENABLED,
  NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED,
  NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED: process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED,
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

beforeEach(() => {
  for (const rows of Object.values(state.tables)) rows.length = 0;
  state.authUsers.length = 0;
  vi.clearAllMocks();
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: true, error: null });
  process.env.RESEARCH_ACCESS_PASSWORD = REVIEW_PASSWORD;
  process.env.RESEARCH_SESSION_SECRET = "synthetic-e2e-session-secret";
  delete process.env.RESEARCH_PUBLIC;
  delete process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED;
  delete process.env.RESEARCH_REFERRALS_ENABLED;
  delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
  delete process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED;
});

afterEach(() => restoreEnvironment());

describe("Research application-to-active-member acceptance", () => {
  it("keeps catalog held until gated application, approval, claim, and dual-reference activation complete", async () => {
    const app = makeApp();

    const signedOutCatalog = await request(app).get(CANONICAL_CATALOG_PATH);
    expect(signedOutCatalog.status).toBe(401);
    expect(signedOutCatalog.body.products).toBeUndefined();

    const walledSubmission = await request(app)
      .post("/api/research/applications")
      .set("X-Forwarded-For", "198.51.100.10")
      .send(APPLICATION);
    expect(walledSubmission.status).toBe(401);
    expect(state.tables.research_applications).toHaveLength(0);

    const access = await request(app)
      .post("/api/research/access")
      .send({ password: REVIEW_PASSWORD });
    expect(access.status).toBe(200);
    const setCookie = access.headers["set-cookie"];
    const reviewCookie = (Array.isArray(setCookie) ? setCookie[0] : String(setCookie)).split(";")[0];
    expect(reviewCookie).toMatch(/^xr_access=/);

    const submitted = await request(app)
      .post("/api/research/applications")
      .set("Cookie", reviewCookie)
      .set("X-Forwarded-For", "198.51.100.11")
      .send(APPLICATION);
    expect(submitted.status).toBe(200);
    expect(submitted.body).toEqual({ ok: true });
    expect(JSON.stringify(submitted.body)).not.toMatch(/token|status|applicationId/i);
    expect(state.tables.research_applications).toHaveLength(1);
    const application = state.tables.research_applications[0];
    expect(application.status).toBe("submitted");

    await vi.waitFor(() => expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1));
    const originalStatusToken = emails.sendApplicationReceived.mock.calls[0][0].token as string;
    expect(originalStatusToken).toBeTruthy();

    const reviewed = await request(app)
      .post(`/api/admin/research/applications/${application.id}/review`)
      .send({ internalNote: "Synthetic acceptance review." });
    expect(reviewed.status).toBe(200);
    expect(application.status).toBe("under_review");

    const retiredApproval = await request(app)
      .post(`/api/admin/research/applications/${application.id}/approve`)
      .send({ internalNote: "Synthetic acceptance approval." });
    expect(retiredApproval.status).toBe(409);
    expect(retiredApproval.body.code).toBe("customer_approval_workflow_required");
    expect(application.status).toBe("under_review");

    // This keeps the historical paid-membership activation contract covered
    // without using the retired approval writer. The fixture represents a
    // previously approved billing row; the live launch path below uses the
    // separate approved-customer authority.
    application.status = "approved_pending_payment";
    const accountClaimToken = makeResearchToken("account_claim", application.id);

    const refusedStatusClaim = await request(app)
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", "198.51.100.12")
      .send({ token: originalStatusToken, password: MEMBER_PASSWORD });
    expect(refusedStatusClaim.status).toBe(401);
    expect(state.authUsers).toHaveLength(0);
    expect(state.tables.research_members).toHaveLength(0);

    const claimed = await request(app)
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", "198.51.100.13")
      .send({ token: accountClaimToken, password: MEMBER_PASSWORD });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toEqual({ ok: true });
    expect(state.authUsers).toHaveLength(1);
    expect(state.authUsers[0]).toMatchObject({
      email: APPLICATION.email,
      password: MEMBER_PASSWORD,
      emailConfirmed: true,
    });
    expect(state.createUser).toHaveBeenCalledWith({
      email: APPLICATION.email,
      password: MEMBER_PASSWORD,
      email_confirm: true,
    });
    expect(state.tables.research_members).toHaveLength(1);
    const member = state.tables.research_members[0];
    expect(member).toMatchObject({
      application_id: application.id,
      auth_user_id: state.authUsers[0].id,
      status: "pending_activation",
    });

    const passwordBearer = `Bearer ${makePasswordSession(state.authUsers[0])}`;
    const pendingCatalog = await request(app)
      .get(CANONICAL_CATALOG_PATH)
      .set("Authorization", passwordBearer);
    expect(pendingCatalog.status).toBe(403);
    expect(pendingCatalog.body.code).toBe("activation_required");
    expect(pendingCatalog.body.products).toBeUndefined();
    expect(JSON.stringify(pendingCatalog.body)).not.toMatch(/priceCents|compareAtCents/i);

    const heldActivation = await request(app)
      .post(`/api/admin/research/applications/${application.id}/activate`)
      .send({
        paymentReference: "synthetic-payment-reference",
        subscriptionReference: "synthetic-subscription-reference",
      });
    expect(heldActivation.status).toBe(409);
    expect(heldActivation.body.code).toBe("paid_membership_retired");
    expect(application.status).toBe("approved_pending_payment");
    expect(member.status).toBe("pending_activation");

    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
    const begun = await request(app)
      .post(`/api/admin/research/applications/${application.id}/begin-activation`)
      .send({});
    expect(begun.status).toBe(409);
    expect(begun.body.code).toBe("paid_membership_retired");
    expect(application.status).toBe("approved_pending_payment");
    expect(member.status).toBe("pending_activation");

    const oneReferenceOnly = await request(app)
      .post(`/api/admin/research/applications/${application.id}/activate`)
      .send({ paymentReference: "synthetic-payment-reference" });
    expect(oneReferenceOnly.status).toBe(409);
    expect(oneReferenceOnly.body.code).toBe("paid_membership_retired");
    expect(application.status).toBe("approved_pending_payment");
    expect(member.status).toBe("pending_activation");

    const activated = await request(app)
      .post(`/api/admin/research/applications/${application.id}/activate`)
      .send({
        paymentReference: "synthetic-payment-reference",
        subscriptionReference: "synthetic-subscription-reference",
      });
    expect(activated.status).toBe(409);
    expect(activated.body.code).toBe("paid_membership_retired");
    expect(application.status).toBe("approved_pending_payment");
    expect(member.status).toBe("pending_activation");
    expect(member.billing_state).toBeUndefined();

    const catalog = await request(app)
      .get(CANONICAL_CATALOG_PATH)
      .set("Authorization", passwordBearer);
    expect(catalog.status).toBe(403);
    expect(catalog.body.code).toBe("activation_required");
    expect(catalog.body.products).toBeUndefined();
  });

  it("approves and claims an account without membership billing", async () => {
    const app = makeApp();
    const applicationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString();
    state.tables.research_applications.push({
      id: applicationId,
      email: APPLICATION.email,
      first_name: APPLICATION.firstName,
      last_name: APPLICATION.lastName,
      status: "under_review",
      access_approval_version: 0,
      approval_expires_at: null,
    });

    const approvedDeps: ApprovedCustomerAccessDependencies = {
      authority: vi.fn(async () => ({ schemaVersion: APPROVED_CUSTOMER_SCHEMA_VERSION })),
      approve: vi.fn(async (input) => {
        expect(input.actorAuthUserId).toBe(ADMIN_ID);
        const row = state.tables.research_applications.find((candidate) => candidate.id === applicationId);
        if (!row) return { ok: false, code: "claim_not_available" };
        row.status = "approved_customer";
        row.access_approval_version = 1;
        row.approval_expires_at = expiresAt;
        return {
          ok: true,
          applicationId,
          approvalVersion: 1,
          state: "approved_customer",
          delivery: "queued",
          expiresAt,
          replayed: false,
        };
      }),
      claim: vi.fn(async (id, authUserId) => {
        const row = state.tables.research_applications.find((candidate) => candidate.id === id);
        if (!row || row.status !== "approved_customer") return { ok: false, code: "claim_not_available" };
        row.status = "active";
        const member = {
          id: crypto.randomUUID(),
          application_id: id,
          auth_user_id: authUserId,
          email: row.email,
          first_name: row.first_name,
          status: "active",
          billing_state: "not_started",
        };
        state.tables.research_members.push(member);
        return { ok: true, applicationId: id, memberId: member.id, state: "active", replayed: false };
      }),
      createAuth: async (email, password) => {
        const result = await state.createUser({ email, password, email_confirm: true });
        if (result.error || !result.data.user?.id || !result.data.user.email) return { kind: "failed" };
        return {
          kind: "created",
          userId: result.data.user.id,
          email: result.data.user.email,
          emailVerified: result.data.user.emailConfirmed,
        };
      },
      verifySignIn: vi.fn(async () => null),
      kickOutbox: vi.fn(async () => {}),
    };

    state.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
      if (name === "research_approved_customer_access_authority") {
        return { data: { schemaVersion: APPROVED_CUSTOMER_SCHEMA_VERSION }, error: null };
      }
      if (name === "research_admin_approve_customer_access") {
        return {
          data: await approvedDeps.approve({
            actorAuthUserId: String(input.p_actor_auth_user_id),
            email: String(input.p_email),
            firstName: String(input.p_first_name),
            lastName: String(input.p_last_name),
            reason: String(input.p_reason),
            expectedApplicationId: (input.p_expected_application_id as string | null) ?? null,
            expectedUpdatedAt: (input.p_expected_updated_at as string | null) ?? null,
            idempotencyKey: String(input.p_idempotency_key),
          }),
          error: null,
        };
      }
      if (name === "research_claim_approved_customer_access") {
        return { data: await approvedDeps.claim(String(input.p_application_id), String(input.p_auth_user_id)), error: null };
      }
      return { data: true, error: null };
    });

    const adminBearer = `Bearer ${makePasswordSession({ id: ADMIN_ID, email: "admin@example.invalid" })}`;
    const approved = await request(app)
      .post(APPROVE_CUSTOMER_ACCESS_PATH)
      .set("Authorization", adminBearer)
      .send({
        email: ` ${APPLICATION.email} `,
        firstName: APPLICATION.firstName,
        lastName: APPLICATION.lastName,
        reason: "Approved for customer access",
        expectedApplicationId: null,
        expectedUpdatedAt: null,
        idempotencyKey: "synthetic-approved-0001",
      });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ ok: true, state: "approved_customer", delivery: "queued" });
    expect(JSON.stringify(approved.body)).not.toMatch(/payment|subscription|price/i);
    expect(state.tables.research_applications[0].status).toBe("approved_customer");
    expect(state.tables.research_members).toHaveLength(0);

    const claimToken = makeApprovedCustomerClaimToken(applicationId, expiresAt);
    const claimed = await request(app)
      .post("/api/research/member/claim")
      .set("X-Forwarded-For", "198.51.100.44")
      .send({ token: claimToken, password: MEMBER_PASSWORD });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toEqual({ ok: true, applicationId, memberId: expect.any(String), state: "active", replayed: false });
    expect(state.tables.research_members).toHaveLength(1);
    expect(state.tables.research_members[0]).toMatchObject({
      application_id: applicationId,
      email: APPLICATION.email,
      status: "active",
      billing_state: "not_started",
    });
    expect(state.createUser).toHaveBeenCalledWith({ email: APPLICATION.email, password: MEMBER_PASSWORD, email_confirm: true });
    expect(approvedDeps.claim).toHaveBeenCalledWith(applicationId, state.tables.research_members[0].auth_user_id);
  });
});
