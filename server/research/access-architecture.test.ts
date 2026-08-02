import express from "express";
import { readFileSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Canonical access architecture:
// - the public gateway, read-only policies, signed application status lookup,
//   and enumeration-resistant resend route do not need the shared password
// - application submission/resubmission remain behind the cookie wall while
//   the legal policies are unapproved operational drafts
// - the catalog and orders are MEMBER content: the shared password does NOT
//   unlock them; they require the member's own verified JWT
// - an authenticated member bypasses the shared password on exactly the
//   member-authed endpoints; every other endpoint keeps the cookie wall

const state = vi.hoisted(() => ({
  members: [] as any[],
  goodToken: "good-member-token",
  authLookups: 0,
  memberQueries: 0,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "research_members") state.memberQueries += 1;
      const rows = table === "research_members" ? state.members : [];
      const filters: Array<[string, any]> = [];
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => {
          filters.push([c, v]);
          return api;
        },
        maybeSingle: async () => ({
          data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
          error: null,
        }),
      };
      return api;
    },
    rpc: async () => ({ data: true, error: null }),
  }),
  getSupabaseAnon: () => ({
    auth: {
      getUser: async (jwt: string) => {
        state.authLookups += 1;
        return jwt === state.goodToken
          ? { data: { user: { email: "member@example.com" } }, error: null }
          : { data: { user: null }, error: { message: "bad token" } };
      },
    },
  }),
}));

import { registerLegacyResearchOrderContainment, registerResearchApi } from "./index";
import { requireMember } from "./member-auth";

const ENV_KEYS = [
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
  "RESEARCH_PUBLIC",
  "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
  "NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED",
  "ORDER_WEBHOOK_URL",
  "ORDER_WEBHOOK_SECRET",
];
const saved: Record<string, string | undefined> = {};

function makeApp() {
  const app = express();
  registerLegacyResearchOrderContainment(app);
  app.use(express.json());
  registerResearchApi(app);
  // Registered after the shared research middleware, matching production.
  // The real activation implementation applies the same member guard before
  // every member activation handler.
  app.get("/api/research/activation/status", requireMember, (_req, res) => {
    res.json({ ok: true, status: "pending_activation" });
  });
  return app;
}

async function passwordCookie(app: express.Express): Promise<string> {
  const res = await request(app).post("/api/research/access").send({ password: "review-pw" });
  expect(res.status).toBe(200);
  return (res.headers["set-cookie"]?.[0] ?? "").split(";")[0];
}

it("mounts legacy order containment before both production body parsers", () => {
  const productionSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const gateCall = productionSource.indexOf("registerLegacyResearchOrderContainment(app);");
  const jsonParser = productionSource.indexOf("express.json({");
  const urlencodedParser = productionSource.indexOf("express.urlencoded({ extended: false })");
  const researchRouter = productionSource.indexOf("registerResearchApi(app);");

  expect(gateCall).toBeGreaterThan(-1);
  expect(gateCall).toBeLessThan(jsonParser);
  expect(gateCall).toBeLessThan(urlencodedParser);
  expect(jsonParser).toBeLessThan(researchRouter);
  expect((productionSource.match(/registerLegacyResearchOrderContainment\(app\);/g) ?? [])).toHaveLength(1);
});

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RESEARCH_ACCESS_PASSWORD = "review-pw";
  process.env.RESEARCH_SESSION_SECRET = "test-secret";
  state.authLookups = 0;
  state.memberQueries = 0;
  state.members.length = 0;
  state.members.push({ id: "mem-1", email: "member@example.com", status: "active", first_name: "Avery", application_id: "app-1" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the shared password does not unlock member content", () => {
  it("catalog with the password cookie but no member token is refused", async () => {
    const app = makeApp();
    const cookie = await passwordCookie(app);
    const res = await request(app).get("/api/research/catalog").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("policies are readable without the shared password and retain their draft source", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/policies");
    expect(res.status).toBe(200);
    expect(res.body.policies).toBeTruthy();
    expect(JSON.stringify(res.body.policies)).toMatch(/draft status/i);
  });
});

describe("an authenticated member bypasses the shared password on member endpoints only", () => {
  it("lets a pending member's valid password token reach activation status without a gateway cookie", async () => {
    state.members[0].status = "pending_activation";
    const app = makeApp();
    const res = await request(app)
      .get("/api/research/activation/status")
      .set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_activation");
  });

  it("still rejects a junk bearer token on activation status", async () => {
    const app = makeApp();
    const res = await request(app)
      .get("/api/research/activation/status")
      .set("Authorization", "Bearer junk");
    expect(res.status).toBe(401);
  });

  it("catalog with a valid member token and NO cookie is served without legacy prices or commerce", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.commerce).toEqual({ research: false, consumer: false });
    expect(res.body.products).not.toHaveLength(0);
    expect(res.body.products.every((product: { priceCents: unknown }) => product.priceCents === null)).toBe(true);
    expect(
      res.body.products.every((product: { compareAtCents?: unknown }) => product.compareAtCents === null),
    ).toBe(true);
  });

  it.each([
    "pt-141-bremelanotide",
    "tesamorelin-10mg",
    "nad-plus-500mg",
    "ss-31-elamipretide",
  ])("holds legacy ordering for saleable product %s even when both commerce flags are true", async (slug) => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED = "true";
    process.env.ORDER_WEBHOOK_URL = "https://orders.invalid/dispatch";
    process.env.ORDER_WEBHOOK_SECRET = "PRIVATE_WEBHOOK_SECRET_MARKER";
    const dispatch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", dispatch);
    const app = makeApp();
    const res = await request(app)
      .post("/api/research/orders")
      .set("Authorization", "Bearer " + state.goodToken)
      .send({
        lane: "research",
        items: [{ slug, quantity: 1 }],
        customer: {
          name: "PRIVATE_NAME_MARKER",
          email: "private-marker@example.invalid",
          phone: "PRIVATE_PHONE_MARKER",
          organization: "PRIVATE_ORGANIZATION_MARKER",
          address1: "PRIVATE_ADDRESS_MARKER",
          city: "PRIVATE_CITY_MARKER",
          state: "TX",
          postalCode: "PRIVATE_ZIP_MARK",
          country: "United States",
        },
        researchAttestation: true,
        notes: "PRIVATE_NOTES_MARKER",
      });
    expect(res.status).toBe(503);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({ ok: false, message: "Ordering is not open for this catalog." });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/PRIVATE_|orderId|totalCents/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("terminates production orders before parser/rawBody capture while preserving member authentication", async () => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED = "true";
    process.env.ORDER_WEBHOOK_URL = "https://orders.invalid/dispatch";
    const dispatch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const parserReached = vi.fn();
    const rawBodyVerifier = vi.fn();
    vi.stubGlobal("fetch", dispatch);

    const app = express();
    registerLegacyResearchOrderContainment(app);
    app.use((_req, _res, next) => {
      parserReached();
      next();
    });
    app.use(
      express.json({
        verify: () => {
          rawBodyVerifier();
        },
      }),
    );
    registerResearchApi(app);

    const hostileBody = '{"hostile":"PRIVATE_PREPARSER_PII_MARKER"';
    const sendHostile = (authorization?: string) => {
      let pending = request(app)
        .post("/api/research/orders")
        .set("Content-Type", "application/json");
      if (authorization) pending = pending.set("Authorization", authorization);
      return pending.send(hostileBody);
    };
    const expectPrivateHeaders = (response: request.Response) => {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.pragma).toBe("no-cache");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    };
    const expectNoBodyWork = () => {
      expect(parserReached).not.toHaveBeenCalled();
      expect(rawBodyVerifier).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    };

    const signedOut = await sendHostile();
    expect(signedOut.status).toBe(401);
    expectPrivateHeaders(signedOut);
    expect(JSON.stringify(signedOut.body)).not.toContain("PRIVATE_PREPARSER_PII_MARKER");
    expect(state.authLookups).toBe(0);
    expect(state.memberQueries).toBe(0);
    expectNoBodyWork();

    parserReached.mockClear();
    rawBodyVerifier.mockClear();
    state.authLookups = 0;
    state.memberQueries = 0;
    const invalidBearer = await sendHostile("Bearer invalid-member-token");
    expect(invalidBearer.status).toBe(401);
    expectPrivateHeaders(invalidBearer);
    expect(JSON.stringify(invalidBearer.body)).not.toContain("PRIVATE_PREPARSER_PII_MARKER");
    expect(state.authLookups).toBeGreaterThan(0);
    expect(state.memberQueries).toBe(0);
    expectNoBodyWork();

    parserReached.mockClear();
    rawBodyVerifier.mockClear();
    state.authLookups = 0;
    state.memberQueries = 0;
    const activeMember = await sendHostile("Bearer " + state.goodToken);
    expect(activeMember.status).toBe(503);
    expectPrivateHeaders(activeMember);
    expect(activeMember.body).toEqual({ ok: false, message: "Ordering is not open for this catalog." });
    expect(JSON.stringify(activeMember.body)).not.toContain("PRIVATE_PREPARSER_PII_MARKER");
    expect(state.authLookups).toBeGreaterThan(0);
    expect(state.memberQueries).toBeGreaterThan(0);
    expectNoBodyWork();
  });

  it("sets private headers before authentication and never dispatches a signed-out order", async () => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED = "true";
    process.env.ORDER_WEBHOOK_URL = "https://orders.invalid/dispatch";
    const dispatch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", dispatch);
    const app = makeApp();

    const catalog = await request(app).get("/api/research/catalog");
    const order = await request(app).post("/api/research/orders").send({ hostile: "PRIVATE_SIGNED_OUT_MARKER" });

    expect(catalog.status).toBe(401);
    expect(order.status).toBe(401);
    for (const response of [catalog, order]) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.pragma).toBe("no-cache");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(JSON.stringify(response.body)).not.toContain("PRIVATE_SIGNED_OUT_MARKER");
    }
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("catalog with a junk bearer token is refused (the bypass still verifies)", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", "Bearer junk");
    expect(res.status).toBe(401);
  });

  it("a closed membership is refused even with a valid token", async () => {
    state.members[0].status = "closed";
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(403);
  });

  it("a PENDING member cannot reach the catalog or orders (active membership required)", async () => {
    state.members[0].status = "pending_activation";
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(403);
    const order = await request(app).post("/api/research/orders").set("Authorization", `Bearer ${state.goodToken}`).send({});
    expect(order.status).toBe(403);
  });

  it("a bearer token does NOT bypass the wall on non-member endpoints", async () => {
    const app = makeApp();
    // Application collection access remains cookie-walled; a bearer alone
    // must not accidentally turn a member credential into application access.
    const res = await request(app).get("/api/research/applications").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(401);
  });
});
