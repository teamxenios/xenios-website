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

const VALID_PLAN_ID = "00000000-0000-4000-8000-000000000030";
const VALID_DOCUMENT_ID = "00000000-0000-4000-8000-0000000000d0";

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
  return app;
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
    ["get", "/api/research/catalog"],
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

  it("does not let a Bearer token bypass the shared wall for document download", async () => {
    const response = await request(makeWalledApi())
      .get(`/api/research/documents/${VALID_DOCUMENT_ID}/download?exp=9999999999999&sig=private`)
      .set("Authorization", "Bearer member-jwt-without-review-cookie");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, message: "Access required." });
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
