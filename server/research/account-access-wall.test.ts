import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./member-auth")>();
  return {
    ...actual,
    requireActiveMember: (_req: unknown, res: any) =>
      res.status(401).json({ ok: false, message: "Sign in required." }),
  };
});

import { registerResearchApi, researchPageGate } from "./index";
import { registerMemberPlatformApi } from "./member-platform";
import { documentDownloadPath, signDocumentGrant } from "./documents";
import { registerCommerceApi, type CommerceGuards } from "./commerce/routes";
import { buildCommerceDependencies } from "./commerce/production-deps";

const VALID_PLAN_ID = "00000000-0000-4000-8000-000000000030";
const VALID_DOCUMENT_ID = "00000000-0000-4000-8000-0000000000d0";
const DOWNLOAD_EXPIRY = 1893456000000;

function canonicalDownloadPath() {
  return documentDownloadPath(
    VALID_DOCUMENT_ID,
    DOWNLOAD_EXPIRY,
    signDocumentGrant(VALID_DOCUMENT_ID, "member-for-wall-shape", DOWNLOAD_EXPIRY),
  );
}

const KEYS = [
  "RESEARCH_PUBLIC",
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

function makeWalledApi() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  registerMemberPlatformApi(app);
  const commerceGuards: CommerceGuards = {
    requireActiveMember: (_req, res) =>
      res.status(401).json({ ok: false, message: "Sign in required." }),
    requireMember: (_req, res) =>
      res.status(401).json({ ok: false, message: "Sign in required." }),
    requireAdmin: (_req, res) =>
      res.status(401).json({ ok: false, message: "Sign in required." }),
  };
  registerCommerceApi(
    app,
    buildCommerceDependencies(() => new Date("2026-08-03T00:00:00.000Z"), {}),
    commerceGuards,
  );
  return app;
}

function makeGatewayProbe() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  app.use((_req, res) => res.status(418).json({ ok: false, message: "downstream" }));
  return app;
}

function expectPrivateHeaders(response: { headers: Record<string, string | undefined> }) {
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers.pragma).toBe("no-cache");
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
}

function makeOrderReadApi(guardResult: "deny" | "allow") {
  const app = express();
  const listForMember = vi.fn(async () => [{ orderId: "ord_private_sentinel" }]);
  const getForMember = vi.fn(async (_memberId: string, orderId: string) =>
    orderId === "ord/1 x" ? { orderId, privateMarker: "ORDER_PRIVATE_SENTINEL" } : null,
  );
  const baseDependencies = buildCommerceDependencies(() => new Date("2026-08-03T00:00:00.000Z"), {});
  const downstreamGuard = vi.fn((req: any, res: any, next: () => void) => {
    if (guardResult === "deny") return res.status(401).json({ ok: false, message: "Sign in required." });
    req.researchMember = { id: "member-for-order-wall" };
    next();
  });
  const denyGuard: CommerceGuards["requireMember"] = (_req, res) =>
    res.status(401).json({ ok: false, message: "Sign in required." });

  app.use(express.json());
  registerResearchApi(app);
  registerCommerceApi(app, {
    ...baseDependencies,
    orders: { ...baseDependencies.orders, listForMember, getForMember },
  }, {
    requireActiveMember: downstreamGuard,
    requireMember: denyGuard,
    requireAdmin: denyGuard,
  });
  return { app, downstreamGuard, listForMember, getForMember };
}

function makePrivateCatalogReadApi(guardResult: "deny" | "allow" = "deny") {
  const app = express();
  const baseline = buildCommerceDependencies(() => new Date("2026-08-03T00:00:00.000Z"), {});
  const privateMarker = "PRIVATE_CATALOG_GUIDE_SENTINEL_277";
  const product = { ...baseline.catalog.listProducts()[0]!, displayName: privateMarker };
  const listProducts = vi.fn(() => [product]);
  const getProduct = vi.fn(() => ({
    ...product,
    confirmedFacts: {},
    unavailableReason: null,
    prohibitedClaims: [],
    faq: [],
  }));
  const listGoals = vi.fn(() => [{ slug: "private-goal", label: privateMarker, productSkus: [], guideSlugs: [] }]);
  const guide = { slug: "private-guide", title: privateMarker, status: "published" as const, publishedAt: null, relatedProductSkus: [] };
  const listForMember = vi.fn(async () => [guide]);
  const getForMember = vi.fn(async () => ({
    ...guide,
    revision: 1,
    sections: [],
    claims: [],
    sources: [],
    correctionHistory: [],
  }));
  const downstreamGuard = vi.fn((req: any, res: any, next: () => void) => {
    if (guardResult === "deny") return res.status(401).json({ ok: false, message: "Sign in required." });
    req.researchMember = { id: "member-private-catalog-canary" };
    next();
  });
  const denyGuard: CommerceGuards["requireMember"] = (_req, res) =>
    res.status(401).json({ ok: false, message: "Sign in required." });

  app.use(express.json());
  registerResearchApi(app);
  registerCommerceApi(app, {
    ...baseline,
    catalog: { listProducts, getProduct, listGoals },
    guides: { ...baseline.guides, listForMember, getForMember },
  }, {
    requireActiveMember: downstreamGuard,
    requireMember: denyGuard,
    requireAdmin: denyGuard,
  });
  return { app, downstreamGuard, privateMarker, privateReads: [listProducts, getProduct, listGoals, listForMember, getForMember] };
}

function makeMemberMeGuardedApi() {
  const app = express();
  const privateRead = vi.fn();
  const downstreamGuard = vi.fn((_req: unknown, res: any) =>
    res.status(401).json({ ok: false, message: "Sign in required." }),
  );
  app.use(express.json());
  registerResearchApi(app);
  app.get(
    "/api/research/member/me",
    downstreamGuard,
    (_req, res) => {
      privateRead();
      res.json({ ok: true, privateMarker: "must-not-render" });
    },
  );
  return { app, downstreamGuard, privateRead };
}

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-account-access";
  process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("fresh-browser account-access wall", () => {
  it.each([
    ["get", "/api/research/account/context"],
    ["post", "/api/research/account/claims/request"],
    ["post", "/api/research/account/claims/confirm"],
    ["post", "/api/research/account/security/password-change-complete"],
    ["post", "/api/research/account/organization-invitations/accept"],
    ["get", "/api/research/account/organizations/00000000-0000-4000-8000-000000000001/dashboard"],
    ["patch", "/api/research/account/organizations/00000000-0000-4000-8000-000000000001/profile"],
    ["post", "/api/research/account/organizations/00000000-0000-4000-8000-000000000001/users/invitations"],
    ["post", "/api/research/account/organizations/00000000-0000-4000-8000-000000000001/orders/request-again"],
  ] as const)("admits the exact Pack02 %s %s route to its downstream auth boundary", async (method, path) => {
    const app = makeGatewayProbe();
    const response = await (request(app) as any)[method](path).send({});
    expect(response.status).toBe(418);
  });

  it.each([
    ["post", "/api/research/account/context"],
    ["get", "/api/research/account/claims/request"],
    ["get", "/api/research/account/organizations/not-a-uuid/dashboard"],
    ["get", "/api/research/account/organizations/00000000-0000-4000-8000-000000000001/orders/request-again"],
    ["get", "/api/research/account/context/lookalike"],
  ] as const)("keeps the Pack02 lookalike %s %s behind the legacy wall", async (method, path) => {
    const response = await (request(makeWalledApi()) as any)[method](path).send({});
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access required.");
  });

  it.each([
    ["post", "/api/research/member/forgot-password"],
    ["post", "/api/research/member/claim"],
    ["get", "/api/research/applications/status"],
    ["head", "/api/research/applications/status"],
    ["post", "/api/research/applications/resend-link"],
    ["get", "/api/research/policies"],
    ["head", "/api/research/policies"],
  ] as const)("allows only the canonical %s %s boundary", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path);
    const response = method === "post" ? await call.send({}) : await call;
    expect(response.body?.message).not.toBe("Access required.");
  });

  it.each([
    ["get", "/api/research/member/forgot-password"],
    ["put", "/api/research/member/forgot-password"],
    ["get", "/api/research/member/claim"],
    ["put", "/api/research/member/claim"],
    ["post", "/api/research/applications/status"],
    ["post", "/api/research/policies"],
    ["get", "/api/research/applications/resend-link"],
    ["post", "/api/research/applications"],
    ["post", "/api/research/member/claim-other"],
    ["get", "/api/research/member/profile"],
    ["post", "/api/research/member/me"],
    ["put", "/api/research/member/me"],
    ["delete", "/api/research/member/me"],
    ["get", "/api/research/member/me/extra"],
    ["get", "/api/research/member/Me"],
    ["get", "/api/research/member/%6De"],
    ["get", "/api/research/catalog"],
    ["post", "/api/research/cart"],
    ["put", "/api/research/cart"],
    ["get", "/api/research/cart-lines"],
    ["get", "/api/research/cart/lines"],
    ["get", "/api/research/carts"],
    ["post", "/api/research/store-credit"],
    ["get", "/api/research/store-credits"],
    ["get", "/api/research/store-credit/extra"],
    ["put", "/api/research/profile"],
    ["post", "/api/research/profile/sensitive"],
    ["post", "/api/research/plans/xenios30"],
    ["get", "/api/research/plans/xenios30/lookalike"],
    ["get", "/api/research/plans/xenios90"],
    ["get", `/api/research/plans/xenios30/${VALID_PLAN_ID}/acknowledge`],
    ["post", `/api/research/plans/xenios30/${VALID_PLAN_ID}/acknowledge/extra`],
    ["post", `/api/research/plans/xenios30/${VALID_PLAN_ID}/acknowledgements`],
    ["post", `/api/research/plans/xenios90/${VALID_PLAN_ID}/acknowledge`],
    ["post", "/api/research/documents"],
    ["put", "/api/research/documents"],
    ["get", `/api/research/documents/${VALID_DOCUMENT_ID}/access`],
    ["get", `/api/research/documents/${VALID_DOCUMENT_ID}/acknowledge`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/download`],
    ["get", `/api/research/documents/${VALID_DOCUMENT_ID}/download`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/access/extra`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/acknowledge/extra`],
    ["post", `/api/research/document/${VALID_DOCUMENT_ID}/access`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/accesses`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/acknowledgements`],
    ["post", "/api/research/documents/private-document-id/access"],
    ["post", "/api/research/documents/private-document-id/acknowledge"],
    ["post", "/api/research/documents//access"],
    ["post", "/api/research/documents//acknowledge"],
    ["post", "/api/research/documents/%E0%A4%A/access"],
    ["post", "/api/research/documents/%00/acknowledge"],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}%2Fextra/access`],
    ["post", `/api/research/documents/%30${VALID_DOCUMENT_ID.slice(1)}/acknowledge`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID.toUpperCase()}/access`],
    ["post", "/api/research/plans/xenios30/private-plan-id/acknowledge"],
    ["post", "/api/research/plans/xenios30//acknowledge"],
    ["post", "/api/research/plans/xenios30/%E0%A4%A/acknowledge"],
    ["post", "/api/research/plans/xenios30/%00/acknowledge"],
    ["post", "/api/research/plans/xenios30/%20/acknowledge"],
    ["post", `/api/research/plans/xenios30/${VALID_PLAN_ID}%2Fextra/acknowledge`],
  ] as const)("keeps wrong-method, lookalike, and private %s %s calls walled", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path);
    const response = method === "get" ? await call : await call.send({});
    expect(response.status).toBe(401);
    expect(response.body?.message).toBe("Access required.");
  });

  it.each([
    ["get", undefined],
    ["head", undefined],
    ["get", "Bearer invalid-member-jwt"],
    ["head", "Bearer invalid-member-jwt"],
  ] as const)("lets exact member/me %s reach its downstream guard before private reads (%s)", async (method, authorization) => {
    const { app, downstreamGuard, privateRead } = makeMemberMeGuardedApi();
    let call = (request(app) as any)[method]("/api/research/member/me");
    if (authorization !== undefined) call = call.set("Authorization", authorization);
    const response = await call;

    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    if (method === "head") {
      expect(response.text ?? "").toBe("");
    } else {
      expect(response.body).toEqual({ ok: false, message: "Sign in required." });
      expect(JSON.stringify(response.body)).not.toContain("must-not-render");
    }
    expect(downstreamGuard).toHaveBeenCalledTimes(1);
    expect(privateRead).not.toHaveBeenCalled();
  });

  it.each([
    ["post", "/api/research/member/me"],
    ["put", "/api/research/member/me"],
    ["delete", "/api/research/member/me"],
    ["get", "/api/research/member/me/extra"],
    ["head", "/api/research/member/me/extra"],
    ["get", "/api/research/member/Me"],
    ["get", "/api/research/member/%6De"],
  ] as const)("does not classify hostile member/me boundary %s %s as private", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path);
    const response = method === "get" || method === "head" ? await call : await call.send({});

    expect(response.status).toBe(401);
    if (method === "head") {
      expect(response.text ?? "").toBe("");
    } else {
      expect(response.body).toEqual({ ok: false, message: "Access required." });
    }
    expect(response.headers.pragma).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBeUndefined();
  });

  it.each([
    ["get", "/api/research/profile"],
    ["head", "/api/research/profile"],
    ["get", "/api/research/profile/sensitive"],
    ["head", "/api/research/profile/sensitive"],
  ] as const)("lets the downstream profile guard own private headers for %s %s", async (method, path) => {
    const response = await (request(makeWalledApi()) as any)[method](path);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it.each([
    ["get", "/api/research/plans/xenios30"],
    ["head", "/api/research/plans/xenios30"],
  ] as const)("lets the downstream Xenios30 guard own private headers for %s %s", async (method, path) => {
    const response = await (request(makeWalledApi()) as any)[method](path);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    if (method === "get") {
      expect(response.body).toEqual({ ok: false, message: "Sign in required." });
    } else {
      expect(response.text ?? "").toBe("");
    }
  });

  it.each([
    ["get", "/api/research/cart"],
    ["head", "/api/research/cart"],
    ["get", "/api/research/store-credit"],
    ["head", "/api/research/store-credit"],
  ] as const)("lets only the exact private commerce read reach downstream auth for %s %s", async (method, path) => {
    const response = await (request(makeWalledApi()) as any)[method](path);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    if (method === "head") {
      expect(response.text ?? "").toBe("");
    } else {
      expect(response.body).toEqual({ ok: false, message: "Sign in required." });
    }
  });

  const ORDER_READ_BOUNDARIES = [
    ["get", "/api/research/orders"],
    ["head", "/api/research/orders"],
    ["get", "/api/research/orders/ord%2F1%20x"],
    ["head", "/api/research/orders/ord%2F1%20x"],
  ] as const;

  it.each([
    ...ORDER_READ_BOUNDARIES.map(([method, path]) => [method, path, undefined, 0, "Access required."] as const),
    ...ORDER_READ_BOUNDARIES.map(([method, path]) => [method, path, "Bearer invalid-order-member", 1, "Sign in required."] as const),
  ])("sets private headers before %s %s auth denial (%s)", async (method, path, authorization, guardCalls, message) => {
    const { app, downstreamGuard, listForMember, getForMember } = makeOrderReadApi("deny");
    let call = (request(app) as any)[method](path);
    if (authorization !== undefined) call = call.set("Authorization", authorization);
    const response = await call;

    expect(response.status).toBe(401);
    expectPrivateHeaders(response);
    if (method === "head") expect(response.text ?? "").toBe("");
    else {
      expect(response.body).toEqual({ ok: false, message });
      expect(JSON.stringify(response.body)).not.toContain("ORDER_PRIVATE_SENTINEL");
    }
    expect(downstreamGuard).toHaveBeenCalledTimes(guardCalls);
    expect(listForMember).not.toHaveBeenCalled();
    expect(getForMember).not.toHaveBeenCalled();
  });

  it("retains private headers on allowed list/detail reads and a uniform missing detail", async () => {
    const { app, listForMember, getForMember } = makeOrderReadApi("allow");
    const bearer = { Authorization: "Bearer accepted-order-member" };
    const list = await request(app).get("/api/research/orders").set(bearer);
    const detail = await request(app).get("/api/research/orders/ord%2F1%20x").set(bearer);
    const missing = await request(app).get("/api/research/orders/ord_missing").set(bearer);

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(missing.status).toBe(404);
    for (const response of [list, detail, missing]) expectPrivateHeaders(response);
    expect(listForMember).toHaveBeenCalledWith("member-for-order-wall");
    expect(getForMember).toHaveBeenCalledWith("member-for-order-wall", "ord/1 x");
    expect(missing.body).toEqual({ ok: false, code: "order_not_found" });
  });

  it.each([
    ["put", "/api/research/orders"],
    ["patch", "/api/research/orders"],
    ["delete", "/api/research/orders"],
    ["post", "/api/research/orders/ord_1"],
    ["get", "/api/research/order"],
    ["get", "/api/research/orders-extra"],
    ["get", "/api/research/orders/"],
    ["get", "/api/research/orders/ord_1/extra"],
  ] as const)("does not widen the private order-read boundary for %s %s", async (method, path) => {
    const { app, downstreamGuard, listForMember, getForMember } = makeOrderReadApi("deny");
    const call = (request(app) as any)[method](path);
    const response = method === "get" ? await call : await call.send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, message: "Access required." });
    expect(response.headers.pragma).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(downstreamGuard).not.toHaveBeenCalled();
    expect(listForMember).not.toHaveBeenCalled();
    expect(getForMember).not.toHaveBeenCalled();
  });

  const PRIVATE_CATALOG_READ_BOUNDARIES = [
    ["get", "/api/research/products"],
    ["head", "/api/research/products"],
    ["get", "/api/research/products/member-product"],
    ["head", "/api/research/products/member-product"],
    ["get", "/api/research/goals"],
    ["head", "/api/research/goals"],
    ["get", "/api/research/guides"],
    ["head", "/api/research/guides"],
    ["get", "/api/research/guides/member-guide"],
    ["head", "/api/research/guides/member-guide"],
  ] as const;

  it.each([
    ...PRIVATE_CATALOG_READ_BOUNDARIES.map(([method, path]) => [method, path, undefined, 0, "Access required."] as const),
    ...PRIVATE_CATALOG_READ_BOUNDARIES.map(([method, path]) => [method, path, "Bearer invalid-member", 1, "Sign in required."] as const),
  ])("sets private headers before catalog boundary %s %s denial (%s)", async (method, path, authorization, guardCalls, message) => {
    const { app, downstreamGuard, privateMarker, privateReads } = makePrivateCatalogReadApi();
    let pending = (request(app) as any)[method](path);
    if (authorization !== undefined) pending = pending.set("Authorization", authorization);
    const response = await pending;

    expect(response.status).toBe(401);
    expectPrivateHeaders(response);
    if (method === "head") expect(response.text ?? "").toBe("");
    else {
      expect(response.body).toEqual({ ok: false, message });
      expect(JSON.stringify(response.body)).not.toContain(privateMarker);
    }
    expect(downstreamGuard).toHaveBeenCalledTimes(guardCalls);
    for (const privateRead of privateReads) expect(privateRead).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/research/products", 0],
    ["/api/research/products/member-product", 1],
    ["/api/research/goals", 2],
    ["/api/research/guides", 3],
    ["/api/research/guides/member-guide", 4],
  ] as const)("proves the exact permitted catalog route invokes only its sentinel reader: %s", async (path, readerIndex) => {
    const { app, downstreamGuard, privateMarker, privateReads } = makePrivateCatalogReadApi("allow");
    const response = await request(app).get(path).set("Authorization", "Bearer accepted-member");

    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(JSON.stringify(response.body)).toContain(privateMarker);
    expect(downstreamGuard).toHaveBeenCalledTimes(1);
    privateReads.forEach((privateRead, index) => {
      expect(privateRead).toHaveBeenCalledTimes(index === readerIndex ? 1 : 0);
    });
  });

  it.each([
    ["post", "/api/research/products"],
    ["get", "/api/research/product"],
    ["get", "/api/research/products/"],
    ["get", "/api/research/products/member-product/extra"],
    ["get", "/api/research/products-extra/member-product"],
    ["post", "/api/research/goals"],
    ["get", "/api/research/goal"],
    ["get", "/api/research/goals/member-goal"],
    ["post", "/api/research/guides"],
    ["get", "/api/research/guide"],
    ["get", "/api/research/guides/"],
    ["get", "/api/research/guides/member-guide/extra"],
  ] as const)("does not classify catalog lookalike boundary %s %s as private", async (method, path) => {
    const { app, downstreamGuard, privateMarker, privateReads } = makePrivateCatalogReadApi();
    const pending = (request(app) as any)[method](path).set("Authorization", "Bearer member-jwt");
    const response = method === "get" ? await pending : await pending.send({});

    expect(response.status).toBe(401);
    expect(response.headers.pragma).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(privateMarker);
    expect(downstreamGuard).not.toHaveBeenCalled();
    for (const privateRead of privateReads) expect(privateRead).not.toHaveBeenCalled();
  });

  const PRIVATE_DETAIL_DENIALS = [
    "/api/research/products/member-product%2Fextra",
    "/api/research/products/member-product%5Cextra",
    "/api/research/products/%62pc-157",
    "/api/research/products/bpc%2D157",
    "/api/research/products/%00",
    "/api/research/products/%E0%A4%A",
    "/api/research/products/BPC-157",
    "/api/research/products/bpc_157",
    "/api/research/products/-bpc-157",
    "/api/research/products/bpc-157-",
    "/api/research/products/bpc--157",
    `/api/research/products/${"a".repeat(121)}`,
    "/api/research/guides/member-guide%2Fextra",
    "/api/research/guides/member-guide%5Cextra",
  ] as const;

  it.each(PRIVATE_DETAIL_DENIALS.flatMap((path) => [["get", path], ["head", path]] as const))(
    "classifies detail-shaped denial without admitting it: %s %s",
    async (method, path) => {
    const { app, downstreamGuard, privateMarker, privateReads } = makePrivateCatalogReadApi();
    const response = await (request(app) as any)[method](path).set("Authorization", "Bearer member-jwt");

    expect(response.status).toBe(401);
    if (method === "head") expect(response.text ?? "").toBe("");
    else expect(response.body).toEqual({ ok: false, message: "Access required." });
    expectPrivateHeaders(response);
    expect(JSON.stringify(response.body)).not.toContain(privateMarker);
    expect(downstreamGuard).not.toHaveBeenCalled();
    for (const privateRead of privateReads) expect(privateRead).not.toHaveBeenCalled();
    },
  );

  it("lets only the exact Xenios30 acknowledge POST reach its downstream guard", async () => {
    const response = await request(makeWalledApi())
      .post(`/api/research/plans/xenios30/${VALID_PLAN_ID}/acknowledge`)
      .set("Authorization", "Bearer member-jwt-without-review-cookie")
      .send({});
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, message: "Sign in required." });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("lets only the signer-emitted download GET shape reach the downstream member guard", async () => {
    const response = await request(makeWalledApi())
      .get(canonicalDownloadPath())
      .set("Authorization", "Bearer member-jwt-without-review-cookie");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, message: "Sign in required." });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it.each([
    ["head", () => canonicalDownloadPath()],
    ["post", () => canonicalDownloadPath()],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=${DOWNLOAD_EXPIRY}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?sig=${"a".repeat(43)}`],
    ["get", () => `${canonicalDownloadPath()}&extra=1`],
    ["get", () => `${canonicalDownloadPath()}&exp=${DOWNLOAD_EXPIRY}`],
    ["get", () => `${canonicalDownloadPath()}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?sig=${"a".repeat(43)}&exp=${DOWNLOAD_EXPIRY}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?%65xp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=%31${String(DOWNLOAD_EXPIRY).slice(1)}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=${DOWNLOAD_EXPIRY}&sig=%61${"a".repeat(42)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=0${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=9007199254740992&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID.toUpperCase()}/download?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/%30${VALID_DOCUMENT_ID.slice(1)}/download?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}%2Fextra/download?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/private-document-id/download?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/download/extra?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/document/${VALID_DOCUMENT_ID}/download?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
    ["get", () => `/api/research/documents/${VALID_DOCUMENT_ID}/downloads?exp=${DOWNLOAD_EXPIRY}&sig=${"a".repeat(43)}`],
  ] as const)("keeps hostile download boundary case %s shared-walled", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path()).set(
      "Authorization",
      "Bearer member-jwt-without-review-cookie",
    );
    const response = method === "post" ? await call.send({}) : await call;
    expect(response.status).toBe(401);
    if (method === "head") {
      expect(response.text ?? "").toBe("");
    } else {
      expect(response.body).toEqual({ ok: false, message: "Access required." });
    }
    expect(response.headers.pragma).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBeUndefined();
  });

  it.each([
    ["get", "/api/research/documents"],
    ["head", "/api/research/documents"],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/access`],
    ["post", `/api/research/documents/${VALID_DOCUMENT_ID}/acknowledge`],
  ] as const)("lets only the exact Documents member boundary reach its downstream guard for %s %s", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path).set(
      "Authorization",
      "Bearer member-jwt-without-review-cookie",
    );
    const response = method === "post" ? await call.send({}) : await call;
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    if (method === "head") {
      expect(response.text ?? "").toBe("");
    } else {
      expect(response.body).toEqual({ ok: false, message: "Sign in required." });
    }
  });
});

describe("account-access document privacy", () => {
  it.each([
    "/research/reset-password",
    "/research/activate",
    "/research/apply/status",
    "/research/application/status",
    "/research/application-status",
    "/Research/Activate",
    "/research/%61pply/status",
  ])("sets private document headers for %s", async (path) => {
    const app = express();
    app.use(researchPageGate);
    app.use((_req, res) => res.send("spa"));

    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});
