import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  buildPrelaunchGuard,
  registerPrelaunchApi,
  type PrelaunchAccessAuditInput,
  type PrelaunchDependencies,
  type PrelaunchRepository,
} from "./prelaunch";

function buildHarness(options?: {
  roles?: string[];
  namespaceExists?: boolean;
  providerMode?: "disabled" | "capture" | "live";
  auditFails?: boolean;
}) {
  const audits: PrelaunchAccessAuditInput[] = [];
  const assignments: Record<string, unknown>[] = [];
  const repository: PrelaunchRepository = {
    getActiveRoles: vi.fn(async () => (options?.roles ?? []) as any),
    getSeedNamespace: vi.fn(async (namespace) =>
      options?.namespaceExists === false
        ? null
        : {
            namespace,
            seed_version: 2,
            reset_group: "release-train",
            release_eligible: false,
            status: "active",
          },
    ),
    getSettings: vi.fn(async () => ({
      launchStatus: "internal_review",
      providerMode: options?.providerMode ?? "disabled",
    })),
    appendAccessAudit: vi.fn(async (input) => {
      if (options?.auditFails) throw new Error("audit unavailable");
      audits.push(input);
    }),
    listRoleAssignments: vi.fn(async () => assignments as any),
    grantRole: vi.fn(async (input) => {
      const row = {
        id: "d35ee684-fb37-467b-948b-d33913864943",
        authUserId: input.authUserId,
        role: input.role,
        grantedAt: "2026-07-26T00:00:00.000Z",
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      assignments.push(row);
      return row;
    }),
    revokeRole: vi.fn(async () => undefined),
  };
  const deps: PrelaunchDependencies = {
    verifyUser: vi.fn(async (jwt) => (jwt === "valid" ? { id: "user-1" } : null)),
    repository,
    now: () => new Date("2026-07-26T00:00:00.000Z"),
    requestId: () => "d85ecb29-bf4b-4c5f-b993-ad25297cf61f",
  };
  const app = express();
  app.use(express.json());
  registerPrelaunchApi(app, deps, (req, _res, next) => {
    (req as any).adminEmail = "admin@example.test";
    next();
  });
  return { app, deps, repository, audits };
}

describe("private pre-launch access", () => {
  it("fails closed before repository access when no verified session exists", async () => {
    const { app, repository } = buildHarness({
      roles: ["approved_internal_reviewer"],
    });
    const response = await request(app).get("/api/internal/prelaunch/status");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("sign_in_required");
    expect(repository.getActiveRoles).not.toHaveBeenCalled();
  });

  it("denies a verified user without an allowed role and records the decision", async () => {
    const { app, audits } = buildHarness();
    const response = await request(app)
      .get("/api/internal/prelaunch/status")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("prelaunch_role_required");
    expect(audits).toMatchObject([
      {
        authUserId: "user-1",
        role: null,
        decision: "denied",
        reasonCode: "role_required",
      },
    ]);
  });

  it("authorizes an allowed role and keeps real data in the real provider mode", async () => {
    const { app } = buildHarness({
      roles: ["product_admin"],
      providerMode: "live",
    });
    const response = await request(app)
      .get("/api/internal/prelaunch/status")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
    expect(response.body.status).toMatchObject({
      roles: ["product_admin"],
      dataContext: {
        dataOrigin: "real",
        seedNamespace: null,
        releaseEligible: true,
      },
      providerMode: "live",
      launchStatus: "internal_review",
    });
  });

  it("allows only a persisted active seed namespace and captures live provider actions", async () => {
    const { app, audits } = buildHarness({
      roles: ["approved_internal_reviewer"],
      providerMode: "live",
    });
    const response = await request(app)
      .get("/api/internal/prelaunch/status")
      .set("Authorization", "Bearer valid")
      .set("X-Xenios-Seed-Namespace", "website3-review");

    expect(response.status).toBe(200);
    expect(response.body.status).toMatchObject({
      dataContext: {
        dataOrigin: "internal_seed",
        seedNamespace: "website3-review",
        seedVersion: 2,
        resetGroup: "release-train",
        releaseEligible: false,
      },
      providerMode: "capture",
    });
    expect(audits[0]).toMatchObject({
      decision: "allowed",
      seedNamespace: "website3-review",
    });
  });

  it("denies an unknown seed namespace even when the role is valid", async () => {
    const { app, audits } = buildHarness({
      roles: ["internal_team"],
      namespaceExists: false,
    });
    const response = await request(app)
      .get("/api/internal/prelaunch/status")
      .set("Authorization", "Bearer valid")
      .set("X-Xenios-Seed-Namespace", "unknown-seed");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("seed_namespace_unavailable");
    expect(audits[0]).toMatchObject({
      decision: "denied",
      reasonCode: "seed_namespace_unavailable",
    });
  });

  it("fails closed when the access audit cannot be written", async () => {
    const { app } = buildHarness({
      roles: ["super_admin"],
      auditFails: true,
    });
    const response = await request(app)
      .get("/api/internal/prelaunch/status")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("prelaunch_access_unavailable");
  });

  it("supports the existing admin boundary for controlled role lifecycle", async () => {
    const { app, repository } = buildHarness();
    const response = await request(app)
      .post("/api/admin/research/prelaunch/roles")
      .send({
        authUserId: "d98b5fa7-275a-4277-b407-0c23593edaae",
        role: "operations_admin",
        reason: "Approved for internal operations review.",
        expiresAt: null,
      });

    expect(response.status).toBe(201);
    expect(response.body.assignment.role).toBe("operations_admin");
    expect(repository.grantRole).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedBy: "admin@example.test",
        role: "operations_admin",
      }),
    );
  });

  it("can scope the guard to a domain-specific subset without client flags", async () => {
    const { deps } = buildHarness({ roles: ["product_admin"] });
    const app = express();
    const guarded = vi.fn((_req, res) => res.json({ ok: true }));
    app.get(
      "/api/internal/clinical",
      buildPrelaunchGuard(deps, ["clinical_admin", "super_admin"]),
      guarded,
    );
    const response = await request(app)
      .get("/api/internal/clinical")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(403);
    expect(guarded).not.toHaveBeenCalled();
  });
});

describe("pre-launch migration posture", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/research-prelaunch-foundation.sql"),
    "utf8",
  );

  it("forces RLS and revokes browser authority on every foundation table", () => {
    expect(sql.match(/force row level security/g)).toHaveLength(5);
    expect(sql.match(/revoke all on table/g)).toHaveLength(5);
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  it("creates no fabricated operational or seed record", () => {
    const inserts = sql.match(/insert into public\.[a-z0-9_]+/gi) ?? [];
    expect(inserts).toEqual(["insert into public.research_prelaunch_settings"]);
    expect(sql).not.toMatch(
      /insert into public\.research_(products|inventory|orders|members|partners|care)/i,
    );
    expect(sql).not.toMatch(/insert into public\.research_prelaunch_seed_namespaces/i);
    expect(sql).not.toMatch(/insert into public\.research_prelaunch_role_assignments/i);
  });

  it("enforces seed isolation and append-only audit/capture history", () => {
    expect(sql).toContain("check (release_eligible = false)");
    expect(sql).toContain("check (data_origin = 'internal_seed')");
    expect(sql).toContain("research_prelaunch_access_audit_no_mutation");
    expect(sql).toContain("research_prelaunch_external_capture_no_mutation");
    expect(sql).toMatch(/set search_path = pg_catalog/);
  });
});
