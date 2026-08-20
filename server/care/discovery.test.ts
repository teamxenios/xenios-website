import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareProductionAdapters } from "./production-deps";
import { createCareProductionDependencies } from "./production-deps";
import { registerCareApi } from "./index";

const FIXED_NOW = new Date("2026-08-20T18:30:00.000Z");

function productionAdapters(
  overrides: Partial<CareProductionAdapters> = {},
): CareProductionAdapters {
  return {
    authenticate: vi.fn(async (token: string) =>
      token === "valid-account-token" ? { id: "server-subject-1" } : null,
    ),
    loadActiveRoles: vi.fn(async () => ["research_admin"]),
    loadPatientId: vi.fn(async () => null),
    loadCapability: vi.fn(async () => ({
      state: "disabled",
      approved_by: null,
      approved_at: null,
    })),
    writeAccessAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

function composedApp(adapters: CareProductionAdapters) {
  const app = express();
  app.use(express.json());
  registerCareApi(
    app,
    createCareProductionDependencies(adapters, {
      CARE_ENABLED: "false",
      CARE_ENABLE_APPROVED: "false",
    }),
    () => FIXED_NOW,
  );
  return app;
}

const authenticatedPost = (
  app: ReturnType<typeof composedApp>,
  body: Record<string, unknown>,
) => request(app)
  .post("/api/care/discovery")
  .set("Authorization", "Bearer valid-account-token")
  .send(body);

describe("Research-to-Care discovery composition", () => {
  it("returns only a server-authored metadata handoff while Care is disabled", async () => {
    const adapters = productionAdapters();
    const response = await authenticatedPost(composedApp(adapters), {
      consent: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      discovery: {
        sourceRail: "research",
        destinationRail: "care",
        intent: "learn_about_care",
        subjectId: "server-subject-1",
        consentedAt: FIXED_NOW.toISOString(),
      },
      nextPath: "/care/eligibility",
    });
    expect(response.body).not.toHaveProperty("created");
    expect(response.body).not.toHaveProperty("persisted");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(adapters.authenticate).toHaveBeenCalledWith("valid-account-token");
    expect(adapters.loadActiveRoles).toHaveBeenCalledWith("server-subject-1");
    expect(adapters.loadPatientId).toHaveBeenCalledWith("server-subject-1");
    expect(adapters.loadCapability).not.toHaveBeenCalled();
    expect(adapters.writeAccessAudit).not.toHaveBeenCalled();
  });

  it("requires the production bearer-token identity boundary", async () => {
    const adapters = productionAdapters();
    const app = composedApp(adapters);

    const missing = await request(app)
      .post("/api/care/discovery")
      .send({ consent: true });
    const invalid = await request(app)
      .post("/api/care/discovery")
      .set("Authorization", "Bearer invalid-account-token")
      .send({ consent: true });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(missing.body).toEqual({ ok: false, code: "care_auth_required" });
    expect(invalid.body).toEqual({ ok: false, code: "care_auth_required" });
  });

  it("fails closed without leaking identity-provider errors", async () => {
    const response = await authenticatedPost(
      composedApp(productionAdapters({
        authenticate: vi.fn(async () => {
          throw new Error("PRIVATE_IDENTITY_PROVIDER_FAILURE");
        }),
      })),
      { consent: true },
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE");
  });

  it("fails closed when the server-side identity projection cannot be resolved", async () => {
    const response = await authenticatedPost(
      composedApp(productionAdapters({
        loadActiveRoles: vi.fn(async () => {
          throw new Error("PRIVATE_IDENTITY_PROJECTION_FAILURE");
        }),
      })),
      { consent: true },
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE");
  });

  it.each([
    {},
    { consent: false },
    { consent: "true" },
  ])("rejects missing or non-explicit consent: %j", async (body) => {
    const response = await authenticatedPost(
      composedApp(productionAdapters()),
      body,
    );
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      code: "care_invalid_request",
    });
  });

  it.each([
    ["subjectId", "browser-subject"],
    ["consentedAt", "1999-01-01T00:00:00.000Z"],
    ["timestamp", "1999-01-01T00:00:00.000Z"],
    ["sku", "SKU-1"],
    ["productId", "product-1"],
    ["orderId", "order-1"],
    ["purchaseId", "purchase-1"],
    ["price", 1],
    ["clinicalData", { diagnosis: "private" }],
    ["activateCare", true],
    ["nextPath", "https://attacker.example"],
  ])("rejects browser-authored %s metadata", async (key, value) => {
    const response = await authenticatedPost(
      composedApp(productionAdapters()),
      { consent: true, [key]: value },
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      code: "care_invalid_request",
    });
    expect(JSON.stringify(response.body)).not.toContain(String(value));
  });
});
