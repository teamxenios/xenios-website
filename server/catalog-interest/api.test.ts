import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerCatalogInterestApi, type CatalogInterestApiDependencies } from "./api";

const authority = {
  revision: "catalog-2026-10-22",
  url: "https://xeniostechnology.com/catalog/current.pdf",
  approvedAt: "2026-10-20T00:00:00.000Z",
  expiresAt: "2026-11-20T00:00:00.000Z",
  revokedAt: null,
  reviewedOrigin: "https://xeniostechnology.com" as const,
  state: "approved" as const,
};

function build(overrides: Partial<CatalogInterestApiDependencies> = {}) {
  const record = vi.fn(async () => ({
    ok: true as const,
    receipt: "XHC-ABCDEF123456",
    status: "queued" as const,
    catalogRevision: authority.revision,
    replayed: false,
  }));
  const deps: CatalogInterestApiDependencies = {
    authority: () => authority,
    teamRecipient: () => "catalog-team@xeniostechnology.com",
    store: { record },
    rateLimit: async () => "allowed",
    verifyChallenge: async () => true,
    requestIp: () => "203.0.113.1",
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerCatalogInterestApi(app, deps);
  return { app, record };
}

const validBody = {
  requestId: "11111111-1111-4111-8111-111111111111",
  email: "person@example.com",
  marketingConsent: false,
  confirmEmpty: "",
};

describe("POST /api/catalog-interest", () => {
  it("returns a durable receipt with private no-store response headers", async () => {
    const { app, record } = build();
    const response = await request(app).post("/api/catalog-interest").send(validBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      receipt: "XHC-ABCDEF123456",
      status: "queued",
      catalogRevision: authority.revision,
      replayed: false,
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("strictly rejects attribution, referrer, and arbitrary free text", async () => {
    const { app, record } = build();
    for (const extra of [
      { source_page: "/about" },
      { referrer_url: "https://example.com/person" },
      { medicalNotes: "do not store" },
    ]) {
      const response = await request(app).post("/api/catalog-interest").send({
        ...validBody,
        ...extra,
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("invalid_request");
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("checks the durable rate limiter before Turnstile or storage", async () => {
    const verifyChallenge = vi.fn(async () => true);
    const { app, record } = build({
      rateLimit: async () => "denied",
      verifyChallenge,
    });
    const response = await request(app).post("/api/catalog-interest").send(validBody);
    expect(response.status).toBe(429);
    expect(response.body.code).toBe("too_many_requests");
    expect(verifyChallenge).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("fails closed when the durable limiter reports uncertainty", async () => {
    const verifyChallenge = vi.fn(async () => true);
    const { app, record } = build({
      rateLimit: async () => "unavailable",
      verifyChallenge,
    });
    const response = await request(app).post("/api/catalog-interest").send(validBody);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("temporarily_unavailable");
    expect(verifyChallenge).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("fails verification without writing a lead", async () => {
    const { app, record } = build({ verifyChallenge: async () => false });
    const response = await request(app).post("/api/catalog-interest").send(validBody);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("verification_failed");
    expect(record).not.toHaveBeenCalled();
  });

  it("forwards the bounded Turnstile token and canonical request IP", async () => {
    const verifyChallenge = vi.fn(async () => true);
    const { app } = build({ verifyChallenge });
    const response = await request(app).post("/api/catalog-interest").send({
      ...validBody,
      turnstileToken: "test-turnstile-token",
    });
    expect(response.status).toBe(200);
    expect(verifyChallenge).toHaveBeenCalledWith("test-turnstile-token", "203.0.113.1");
  });

  it("maps a changed fingerprint to 409", async () => {
    const { app } = build({
      store: { record: async () => ({ ok: false, code: "request_conflict" }) },
    });
    const response = await request(app).post("/api/catalog-interest").send(validBody);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("request_conflict");
  });

  it("fails closed on authority, database, or adapter uncertainty", async () => {
    const missingAuthority = build({ authority: () => null });
    expect((await request(missingAuthority.app).post("/api/catalog-interest").send(validBody)).status)
      .toBe(503);

    const failedStore = build({
      store: { record: async () => { throw new Error("uncertain write"); } },
    });
    const response = await request(failedStore.app).post("/api/catalog-interest").send(validBody);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ ok: false, code: "temporarily_unavailable" });
  });

  it("fails closed when rate limiting or verification throws", async () => {
    const failedLimiter = build({
      rateLimit: async () => { throw new Error("rate limit unavailable"); },
    });
    const limiterResponse = await request(failedLimiter.app)
      .post("/api/catalog-interest")
      .send(validBody);
    expect(limiterResponse.status).toBe(503);
    expect(limiterResponse.body.code).toBe("temporarily_unavailable");

    const failedVerification = build({
      verifyChallenge: async () => { throw new Error("verification unavailable"); },
    });
    const verificationResponse = await request(failedVerification.app)
      .post("/api/catalog-interest")
      .send(validBody);
    expect(verificationResponse.status).toBe(503);
    expect(verificationResponse.body.code).toBe("temporarily_unavailable");
  });
});
