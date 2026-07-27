import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { MemberRow } from "./member-auth";
import {
  buildRequireSuperAdmin,
  registerAdminAuthorityApi,
  type AdminAuthorityDependencies,
  type AdminExperiencePreference,
} from "./admin-authority";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const MEMBER_ID = "00000000-0000-4000-8000-000000000002";

function recoveryToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ amr: [{ method: "otp" }] }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

function member(authUserId: string, status = "active"): MemberRow {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    application_id: "00000000-0000-4000-8000-000000000200",
    auth_user_id: authUserId,
    email: "not-authority@example.test",
    first_name: "Avery",
    status,
    created_at: "2026-07-27T00:00:00.000Z",
  };
}

function harness(input?: {
  adminRoles?: string[];
  memberRow?: MemberRow | null;
  mode?: "legacy" | "dual" | "durable";
  verifiedEmail?: string | null;
}) {
  let preference: AdminExperiencePreference = {
    experience: "admin",
    version: 0,
  };
  const repository = {
    getActiveRoles: vi.fn(async (authUserId: string) =>
      authUserId === ADMIN_ID ? (input?.adminRoles ?? ["super_admin"]) as any : [],
    ),
    getPreference: vi.fn(async () => preference),
    setPreference: vi.fn(async ({ command }: any) => {
      if (command.expectedVersion !== preference.version) {
        throw new Error("preference version conflict");
      }
      preference = {
        experience: command.experience,
        version: preference.version + 1,
      };
      return preference;
    }),
  };
  const deps: AdminAuthorityDependencies = {
    verifyUser: vi.fn(async (jwt) => {
      if (jwt === "admin-token") {
        return {
          authUserId: ADMIN_ID,
          email: input?.verifiedEmail ?? "samuel@xenios.test",
        };
      }
      if (jwt === "member-token") {
        return { authUserId: MEMBER_ID, email: "member@example.test" };
      }
      return null;
    }),
    getMember: vi.fn(async (authUserId) => {
      if (authUserId === ADMIN_ID) return input?.memberRow ?? null;
      if (authUserId === MEMBER_ID) return member(MEMBER_ID);
      return null;
    }),
    repository,
    now: () => new Date("2026-07-27T00:00:00.000Z"),
    mode: () => input?.mode ?? "durable",
    legacyAdminEmail: () => "samuel@xenios.test",
  };
  const app = express();
  app.use(express.json());
  registerAdminAuthorityApi(app, deps);
  app.get("/api/admin/probe", buildRequireSuperAdmin(deps), (req, res) => {
    res.json({
      ok: true,
      actor: (req as any).adminAuthUserId,
      source: (req as any).adminAuthoritySource,
    });
  });
  return { app, deps, repository };
}

describe("durable administrator authority", () => {
  it("routes an active super_admin without a member row to /admin", async () => {
    const { app } = harness({ memberRow: null });
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authUserId: ADMIN_ID,
      destination: "/admin",
      adminAuthorized: true,
      memberAuthorized: false,
      authoritySource: "persisted_super_admin",
    });
  });

  it("defaults a mixed-role account to admin and switches only through the versioned server command", async () => {
    const { app, repository } = harness({ memberRow: member(ADMIN_ID) });
    const initial = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer admin-token");
    expect(initial.body.destination).toBe("/admin");

    const switched = await request(app)
      .post("/api/research/auth/experience")
      .set("Authorization", "Bearer admin-token")
      .send({
        experience: "member",
        expectedVersion: 0,
        idempotencyKey: "switch-member-0001",
      });
    expect(switched.status).toBe(200);
    expect(switched.body).toMatchObject({
      destination: "/research/member",
      preferredExperience: "member",
      preferenceVersion: 1,
      memberAuthorized: true,
    });
    expect(repository.setPreference).toHaveBeenCalledTimes(1);
  });

  it("does not let a preference grant membership", async () => {
    const { app, repository } = harness({ memberRow: null });
    const response = await request(app)
      .post("/api/research/auth/experience")
      .set("Authorization", "Bearer admin-token")
      .send({
        experience: "member",
        expectedVersion: 0,
        idempotencyKey: "switch-member-0002",
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("member_experience_unavailable");
    expect(repository.setPreference).not.toHaveBeenCalled();
  });

  it("keeps an ordinary member member-routed without admin authority", async () => {
    const { app } = harness();
    const response = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer member-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      destination: "/research/member",
      adminAuthorized: false,
      memberAuthorized: true,
      authoritySource: null,
    });
  });

  it("denies revoked, inactive, expired, or absent role state in durable mode", async () => {
    const { app } = harness({ adminRoles: [], memberRow: null });
    const landing = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", "Bearer admin-token");
    const genericAdmin = await request(app)
      .get("/api/admin/probe")
      .set("Authorization", "Bearer admin-token");

    expect(landing.status).toBe(403);
    expect(landing.body.code).toBe("account_not_authorized");
    expect(genericAdmin.status).toBe(403);
  });

  it("denies signed-out and recovery-purpose sessions before role lookup", async () => {
    const { app, repository } = harness();
    const signedOut = await request(app).get("/api/research/auth/landing");
    const recovery = await request(app)
      .get("/api/research/auth/landing")
      .set("Authorization", `Bearer ${recoveryToken()}`);

    expect(signedOut.status).toBe(401);
    expect(recovery.status).toBe(403);
    expect(recovery.body.code).toBe("recovery_session");
    expect(repository.getActiveRoles).not.toHaveBeenCalled();
  });

  it("never trusts an unverified client-only email claim", async () => {
    const { app } = harness({ adminRoles: [] });
    const response = await request(app)
      .get("/api/admin/probe")
      .set(
        "Authorization",
        "Bearer client-claims-samuel@xenios.test-without-provider-verification",
      );

    expect(response.status).toBe(401);
  });

  it("preserves the exact legacy guard only outside durable mode for phased cutover", async () => {
    const dual = harness({ adminRoles: [], mode: "dual", memberRow: null });
    const durable = harness({ adminRoles: [], mode: "durable", memberRow: null });
    const dualResponse = await request(dual.app)
      .get("/api/admin/probe")
      .set("Authorization", "Bearer admin-token");
    const durableResponse = await request(durable.app)
      .get("/api/admin/probe")
      .set("Authorization", "Bearer admin-token");

    expect(dualResponse.status).toBe(200);
    expect(dualResponse.body.source).toBe("legacy_cutover");
    expect(durableResponse.status).toBe(403);
  });

  it("rejects an optimistic-version conflict without changing preference", async () => {
    const { app } = harness({ memberRow: member(ADMIN_ID) });
    const response = await request(app)
      .post("/api/research/auth/experience")
      .set("Authorization", "Bearer admin-token")
      .send({
        experience: "member",
        expectedVersion: 9,
        idempotencyKey: "switch-member-0003",
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("preference_version_conflict");
  });
});
