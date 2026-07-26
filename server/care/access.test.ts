import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import { registerCareApi } from "./index";

function dependencies(
  overrides: Partial<CareAccessDependencies> = {},
): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "Care is available in supported locations.",
      checkedAt: "2026-07-25T00:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId: "security-1",
      roles: ["care_security_admin"],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
    ...overrides,
  };
}

function appFor(deps: CareAccessDependencies) {
  const app = express();
  registerCareApi(app, deps);
  return app;
}

describe("Care access boundary", () => {
  it("returns capability status without accepting clinical data", async () => {
    const response = await request(appFor(dependencies())).get("/api/care/status");
    expect(response.status).toBe(200);
    expect(response.body.capability).toMatchObject({
      rail: "care",
      state: "enabled",
    });
  });

  it("returns stable safe JSON when capability status lookup fails", async () => {
    const response = await request(
      appFor(dependencies({
        loadCapabilityStatus: vi.fn(async () => {
          throw new Error("care_capability_lookup_failed");
        }),
      })),
    ).get("/api/care/status");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "care_capability_lookup_failed",
    );
  });

  it("does not authenticate or audit a protected request while Care is disabled", async () => {
    const resolvePrincipal = vi.fn(async () => null);
    const recordAccessDecision = vi.fn(async () => undefined);
    const response = await request(
      appFor(dependencies({
        loadCapabilityStatus: vi.fn(async () => ({
          rail: "care",
          state: "pending_qa",
          enabled: false,
          publicMessage: "Care is completing quality review.",
          checkedAt: "2026-07-25T00:00:00.000Z",
        })),
        resolvePrincipal,
        recordAccessDecision,
      })),
    ).get("/api/care/audit/access");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
    expect(resolvePrincipal).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it("audits unauthenticated and forbidden attempts without request content", async () => {
    const unauthenticatedAudit = vi.fn(async () => undefined);
    const unauthenticated = await request(
      appFor(dependencies({
        resolvePrincipal: vi.fn(async () => null),
        recordAccessDecision: unauthenticatedAudit,
      })),
    ).get("/api/care/audit/access");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticatedAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorSubjectId: null,
      permission: "care:security_audit",
      outcome: "unauthenticated",
    }));
    expect(unauthenticatedAudit.mock.calls[0][0]).not.toHaveProperty("body");

    const forbiddenAudit = vi.fn(async () => undefined);
    const forbidden = await request(
      appFor(dependencies({
        resolvePrincipal: vi.fn(async () => ({
          subjectId: "patient-1",
          roles: ["care_patient"],
        })),
        recordAccessDecision: forbiddenAudit,
      })),
    ).get("/api/care/audit/access");
    expect(forbidden.status).toBe(403);
    expect(forbiddenAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorSubjectId: "patient-1",
      permission: "care:security_audit",
      outcome: "forbidden",
    }));
  });

  it("allows and audits only the narrow security role", async () => {
    const recordAccessDecision = vi.fn(async () => undefined);
    const response = await request(
      appFor(dependencies({ recordAccessDecision })),
    ).get("/api/care/audit/access");

    expect(response.status).toBe(200);
    expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({
      actorSubjectId: "security-1",
      permission: "care:security_audit",
      outcome: "allowed",
    }));
  });

  it("fails safely when authentication or role lookup rejects", async () => {
    const response = await request(
      appFor(dependencies({
        resolvePrincipal: vi.fn(async () => {
          throw new Error("care_role_lookup_failed");
        }),
      })),
    ).get("/api/care/audit/access");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("care_role_lookup_failed");
  });

  it("never authorizes when the allowed-decision audit write fails", async () => {
    const response = await request(
      appFor(dependencies({
        recordAccessDecision: vi.fn(async () => {
          throw new Error("care_access_audit_failed");
        }),
      })),
    ).get("/api/care/audit/access");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("care_access_audit_failed");
    expect(response.body).not.toEqual({ ok: true });
  });
});
