import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  requireCarePermission,
  type CareAccessDependencies,
} from "./access";
import {
  CARE_PERMISSIONS,
  CARE_ROLE_PERMISSIONS,
  CARE_ROLES,
  type CarePermission,
  type CarePrincipal,
  type CareRole,
} from "@shared/care/contracts";
import { registerCareApi } from "./index";
import type { CareManualAccessDependencies } from "./manual-access";

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
  const manualAccess: CareManualAccessDependencies = {
    loadReadiness: vi.fn(async () => ({
      persistenceReady: true,
      notificationsReady: true,
    })),
    allowRequest: vi.fn(async () => true),
    verifyHuman: vi.fn(async () => true),
    createRequest: vi.fn(async () => ({
      id: "123e4567-e89b-12d3-a456-426614174000",
    })),
    sendInternalAlert: vi.fn(async () => true),
    sendConfirmation: vi.fn(async () => true),
    setEmailStatus: vi.fn(async () => undefined),
  };
  registerCareApi(app, deps, { manualAccessDependencies: manualAccess });
  return app;
}

async function callBoundary(
  permission: CarePermission,
  deps: CareAccessDependencies,
) {
  const middleware = requireCarePermission(permission, deps);
  const req = {} as express.Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = {
    locals: {},
    status,
  } as unknown as express.Response;
  const next = vi.fn();

  await middleware(req, res, next);
  return { json, next, res, status };
}

describe("Care access boundary", () => {
  it("returns capability status without accepting clinical data", async () => {
    const response = await request(appFor(dependencies())).get("/api/care/status");
    expect(response.status).toBe(200);
    expect(response.body.capability).toMatchObject({
      rail: "care",
      state: "enabled",
    });
    expect(response.body.accessRequests).toMatchObject({
      acceptingRequests: true,
      workflow: "manual_human_follow_up",
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

  it.each([
    ["disabled", false],
    ["disabled", true],
    ["pending_provider", true],
    ["pending_pharmacy", true],
    ["pending_clinicians", true],
    ["pending_qa", true],
    ["enabled", false],
    ["ENABLED", true],
    [" enabled", true],
    ["enabled ", true],
    ["true", true],
    ["1", true],
  ])("fails closed for capability state %j with enabled=%j", async (state, enabled) => {
    const resolvePrincipal = vi.fn(async () => ({
      subjectId: "security-1",
      roles: ["care_security_admin" as const],
    }));
    const recordAccessDecision = vi.fn(async () => undefined);
    const result = await callBoundary(
      "care:security_audit",
      dependencies({
        loadCapabilityStatus: vi.fn(async () => ({
          rail: "care",
          state,
          enabled,
          publicMessage: "PRIVATE-CAPABILITY-MESSAGE",
          checkedAt: "2026-08-02T00:00:00.000Z",
        }) as never),
        resolvePrincipal,
        recordAccessDecision,
      }),
    );

    expect(result.status).toHaveBeenCalledWith(503);
    expect(result.json).toHaveBeenCalledWith({
      ok: false,
      code: "care_disabled",
      message: "Care is not currently available.",
    });
    expect(JSON.stringify(result.json.mock.calls)).not.toContain(
      "PRIVATE-CAPABILITY-MESSAGE",
    );
    expect(resolvePrincipal).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
    expect(result.next).not.toHaveBeenCalled();
  });

  it("fails closed when a direct caller supplies a malformed capability object", async () => {
    const result = await callBoundary(
      "care:security_audit",
      dependencies({
        loadCapabilityStatus: vi.fn(async () => ({
          rail: "research",
          state: "enabled",
          enabled: true,
          publicMessage: "PRIVATE-MALFORMED-MESSAGE",
          checkedAt: "not-a-date",
        }) as never),
      }),
    );

    expect(result.status).toHaveBeenCalledWith(503);
    expect(result.next).not.toHaveBeenCalled();
    expect(JSON.stringify(result.json.mock.calls)).not.toContain("PRIVATE");
  });

  it.each(
    CARE_ROLES.flatMap((role) =>
      CARE_PERMISSIONS.map((permission) => [role, permission] as const),
    ),
  )("enforces the exact direct-call persona matrix for %s and %s", async (role, permission) => {
    const principal: CarePrincipal = {
      subjectId: `${role}-subject`,
      roles: [role],
    };
    const recordAccessDecision = vi.fn(async () => undefined);
    const result = await callBoundary(
      permission,
      dependencies({
        resolvePrincipal: vi.fn(async () => principal),
        recordAccessDecision,
      }),
    );
    const allowed = CARE_ROLE_PERMISSIONS[role as CareRole].includes(permission);

    if (allowed) {
      expect(result.next).toHaveBeenCalledOnce();
      expect(result.status).not.toHaveBeenCalled();
      expect(result.res.locals.carePrincipal).toBe(principal);
    } else {
      expect(result.next).not.toHaveBeenCalled();
      expect(result.status).toHaveBeenCalledWith(403);
      expect(result.json).toHaveBeenCalledWith({
        ok: false,
        code: "care_forbidden",
      });
      expect(result.res.locals).not.toHaveProperty("carePrincipal");
    }
    expect(recordAccessDecision).toHaveBeenCalledWith({
      actorSubjectId: `${role}-subject`,
      permission,
      outcome: allowed ? "allowed" : "forbidden",
      occurredAt: expect.any(String),
    });
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
