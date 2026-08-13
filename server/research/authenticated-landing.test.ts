import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrelaunchRole } from "@shared/research/prelaunch";
import {
  buildDurableAdministratorGuard,
  registerAuthenticatedLandingApi,
  type AuthenticatedLandingDependencies,
} from "./authenticated-landing";

function deps(options: {
  user?: { id: string; email: string | null } | null;
  roles?: PrelaunchRole[];
  member?: { id: string; status: string } | null;
  preference?: "admin" | "member" | null;
} = {}) {
  const audits: Array<Record<string, unknown>> = [];
  let preference = options.preference ?? null;
  const value: AuthenticatedLandingDependencies = {
    verifyUser: vi.fn(async () =>
      options.user === undefined
        ? { id: "00000000-0000-4000-8000-000000000001", email: "person@example.test" }
        : options.user,
    ),
    getActiveRoles: vi.fn(async () => options.roles ?? []),
    getMember: vi.fn(async () => options.member ?? null),
    getPreferredExperience: vi.fn(async () => preference),
    setPreferredExperience: vi.fn(async (_authUserId, next) => {
      preference = next;
    }),
    appendAudit: vi.fn(async (input) => {
      audits.push(input);
    }),
    now: () => new Date("2026-07-26T12:00:00.000Z"),
    requestId: () => "request-1",
  };
  const app = express();
  app.use(express.json());
  registerAuthenticatedLandingApi(app, value);
  app.get(
    "/api/admin/protected",
    buildDurableAdministratorGuard(value),
    (req, res) =>
      res.json({
        ok: true,
        authUserId: (req as Request & { adminAuthUserId?: string })
          .adminAuthUserId,
        role: (req as Request & { adminRole?: string }).adminRole,
      }),
  );
  return { app, value, audits };
}

describe("authenticated landing", () => {
  it("fails closed while signed out", async () => {
    const { app, value } = deps();
    const response = await request(app).get("/api/research/auth/landing");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("sign_in_required");
    expect(value.getActiveRoles).not.toHaveBeenCalled();
  });

  it("routes a durable administrator role to admin without an email check", async () => {
    const { app, value, audits } = deps({
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        email: "samuel@xeniostechnology.com",
      },
      roles: ["super_admin"],
    });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      destination: "/admin",
      defaultExperience: "admin",
      selectedExperience: "admin",
      availableExperiences: ["admin"],
      primaryAdminRole: "super_admin",
      persistedPreference: null,
    });
    expect(value.getActiveRoles).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      new Date("2026-07-26T12:00:00.000Z"),
    );
    expect(audits[0]).toMatchObject({
      role: "super_admin",
      decision: "allowed",
      reasonCode: "landing_admin",
    });
  });

  it("uses deterministic role priority for mixed administrator roles", async () => {
    const { app } = deps({
      roles: ["approved_internal_reviewer", "internal_team", "operations_admin"],
    });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");

    expect(response.status).toBe(200);
    expect(response.body.primaryAdminRole).toBe("internal_team");
  });

  it("defaults a mixed-role user to admin but honors an intentional member switch", async () => {
    const { app, value } = deps({
      roles: ["super_admin"],
      member: { id: "member-1", status: "active" },
    });

    const defaultResponse = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");
    expect(defaultResponse.body).toMatchObject({
      destination: "/admin",
      defaultExperience: "admin",
      availableExperiences: ["admin", "member"],
    });

    const memberResponse = await request(app)
      .post("/api/research/auth/experience")
      .set("Authorization", "Bearer password-token")
      .send({ experience: "member" });
    expect(memberResponse.status).toBe(200);
    expect(memberResponse.body).toMatchObject({
      destination: "/research/member",
      defaultExperience: "admin",
      selectedExperience: "member",
      persistedPreference: "member",
    });
    expect(value.setPreferredExperience).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "member",
      new Date("2026-07-26T12:00:00.000Z"),
    );

    const nextEntry = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");
    expect(nextEntry.body).toMatchObject({
      destination: "/research/member",
      selectedExperience: "member",
      persistedPreference: "member",
    });
  });

  it("routes a member-only identity to its membership destination", async () => {
    const { app } = deps({
      member: { id: "member-1", status: "pending_activation" },
    });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      destination: "/research/activate",
      defaultExperience: "member",
      availableExperiences: ["member"],
      primaryAdminRole: null,
    });
  });

  it("rejects an unrelated authenticated identity and records the denial", async () => {
    const { app, audits } = deps();
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("authenticated_access_unavailable");
    expect(audits[0]).toMatchObject({
      role: null,
      decision: "denied",
      reasonCode: "authenticated_role_or_membership_required",
    });
  });

  it("does not allow an admin-only identity to manufacture member experience", async () => {
    const { app } = deps({ roles: ["super_admin"] });
    const response = await request(app)
      .post("/api/research/auth/experience")
      .set("Authorization", "Bearer password-token")
      .send({ experience: "member" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("experience_unavailable");
  });

  it("ignores a client-only preference claim and keeps the verified default", async () => {
    const { app } = deps({
      roles: ["super_admin"],
      member: { id: "member-1", status: "active" },
    });
    const response = await request(app)
      .get("/api/research/auth/landing?experience=member")
      .set("Authorization", "Bearer password-token")
      .set("x-xenios-experience", "member");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      destination: "/admin",
      selectedExperience: "admin",
      persistedPreference: null,
    });
  });

  it("fails closed for a recovery-purpose session before role resolution", async () => {
    const payload = Buffer.from(
      JSON.stringify({ amr: [{ method: "otp" }] }),
    ).toString("base64url");
    const token = `header.${payload}.signature`;
    const { app, value } = deps({ roles: ["super_admin"] });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("recovery_session");
    expect(value.getActiveRoles).not.toHaveBeenCalled();
  });

  it("does not apply a stale member preference after membership is unavailable", async () => {
    const { app } = deps({
      roles: ["super_admin"],
      preference: "member",
    });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      destination: "/admin",
      selectedExperience: "admin",
      persistedPreference: "member",
    });
  });

  it("denies a revoked or expired administrator role when no membership exists", async () => {
    // The repository returns active/unexpired roles only. An empty result is
    // the fail-closed shape for a revoked or expired assignment.
    const { app } = deps({ roles: [] });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token")
      .set("x-user-email", "samuel@xeniostechnology.com");
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("authenticated_access_unavailable");
  });

  it("fails closed when durable role resolution is unavailable", async () => {
    const { app, value } = deps({
      member: { id: "member-1", status: "active" },
    });
    vi.mocked(value.getActiveRoles).mockRejectedValueOnce(new Error("repository unavailable"));
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer password-token");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("authenticated_access_unavailable");
  });

  it("authorizes admin APIs from the durable role without a member row", async () => {
    const { app, audits } = deps({
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        email: "samuel@xeniostechnology.com",
      },
      roles: ["super_admin"],
    });
    const response = await request(app)
      .get("/api/admin/protected")
      .set("Authorization", "Bearer password-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      authUserId: "00000000-0000-4000-8000-000000000002",
      role: "super_admin",
    });
    expect(audits[0]).toMatchObject({
      routeGroup: "/api/admin/protected",
      decision: "allowed",
      reasonCode: "durable_admin_role",
    });
  });

  it("denies admin APIs when a role is revoked, expired, inactive, or absent", async () => {
    const { app } = deps({ roles: [] });
    const response = await request(app)
      .get("/api/admin/protected")
      .set("Authorization", "Bearer password-token")
      .set("x-user-email", "samuel@xeniostechnology.com");
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("administrator_role_required");
  });

  it("denies recovery sessions at the durable admin guard", async () => {
    const payload = Buffer.from(
      JSON.stringify({ amr: [{ method: "magiclink" }] }),
    ).toString("base64url");
    const { app, value } = deps({ roles: ["super_admin"] });
    const response = await request(app)
      .get("/api/admin/protected")
      .set("Authorization", `Bearer header.${payload}.signature`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("recovery_session");
    expect(value.getActiveRoles).not.toHaveBeenCalled();
  });
});
