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
      rpc: vi.fn(async () => ({ data: true, error: null })),
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
import { registerMembershipApi } from "../membership";
import { registerMemberApi } from "../members";

const REVIEW_PASSWORD = "synthetic-review-password";
const MEMBER_PASSWORD = "synthetic-member-password";
const CANONICAL_CATALOG_PATH = "/api/research/catalog";

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

    const approved = await request(app)
      .post(`/api/admin/research/applications/${application.id}/approve`)
      .send({ internalNote: "Synthetic acceptance approval." });
    expect(approved.status).toBe(200);
    expect(application.status).toBe("approved_pending_payment");
    await vi.waitFor(() => expect(emails.sendApplicationApproved).toHaveBeenCalledTimes(1));
    const accountClaimToken = emails.sendApplicationApproved.mock.calls[0][0].token as string;
    expect(accountClaimToken).toBeTruthy();
    expect(accountClaimToken).not.toBe(originalStatusToken);

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
    expect(heldActivation.status).toBe(503);
    expect(application.status).toBe("approved_pending_payment");
    expect(member.status).toBe("pending_activation");

    process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED = "true";
    const begun = await request(app)
      .post(`/api/admin/research/applications/${application.id}/begin-activation`)
      .send({});
    expect(begun.status).toBe(200);
    expect(application.status).toBe("payment_pending");

    const oneReferenceOnly = await request(app)
      .post(`/api/admin/research/applications/${application.id}/activate`)
      .send({ paymentReference: "synthetic-payment-reference" });
    expect(oneReferenceOnly.status).toBe(400);
    expect(application.status).toBe("payment_pending");
    expect(member.status).toBe("pending_activation");

    const activated = await request(app)
      .post(`/api/admin/research/applications/${application.id}/activate`)
      .send({
        paymentReference: "synthetic-payment-reference",
        subscriptionReference: "synthetic-subscription-reference",
      });
    expect(activated.status).toBe(200);
    expect(application.status).toBe("active");
    expect(member.status).toBe("active");
    expect(member.billing_state).toBe("active");
    const activationEvent = state.tables.research_application_events.find(
      (event) => event.new_status === "active",
    );
    expect(activationEvent.internal_note).toContain("payment_reference=synthetic-payment-reference");
    expect(activationEvent.internal_note).toContain("subscription_reference=synthetic-subscription-reference");

    const catalog = await request(app)
      .get(CANONICAL_CATALOG_PATH)
      .set("Authorization", passwordBearer);
    expect(catalog.status).toBe(200);
    expect(catalog.headers["cache-control"]).toContain("no-store");
    expect(catalog.body.commerce).toEqual({ research: false, consumer: false });
    expect(catalog.body.products.length).toBeGreaterThan(0);
    for (const product of catalog.body.products) {
      expect(product.priceCents).toBeNull();
      expect(product.compareAtCents).toBeNull();
    }
    expect(JSON.stringify(catalog.body)).not.toMatch(/33999|34999|38999/);
  });
});
