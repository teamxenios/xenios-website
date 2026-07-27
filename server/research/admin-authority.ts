import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type {
  AdminAuthorityMode,
  AdminAuthoritySource,
  AuthenticatedExperience,
  AuthenticatedExperienceCommand,
  AuthenticatedLandingResponse,
} from "@shared/research/admin-authority";
import { isPrelaunchRole, type PrelaunchRole } from "@shared/research/prelaunch";
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  supabaseConfigured,
} from "../supabase";
import {
  denyRecoveryPurposeSession,
  getMemberByAuthUserId,
  type MemberRow,
} from "./member-auth";

const experienceCommandSchema = z.object({
  experience: z.enum(["admin", "member"]),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export type VerifiedAdminIdentity = {
  authUserId: string;
  email: string | null;
};

export type AdminAuthority = {
  roles: PrelaunchRole[];
  source: AdminAuthoritySource;
};

export type AdminExperiencePreference = {
  experience: AuthenticatedExperience;
  version: number;
};

export type AdminAuthorityRepository = {
  getActiveRoles(authUserId: string, now: Date): Promise<PrelaunchRole[]>;
  getPreference(authUserId: string): Promise<AdminExperiencePreference>;
  setPreference(input: {
    authUserId: string;
    command: AuthenticatedExperienceCommand;
  }): Promise<AdminExperiencePreference>;
};

export type AdminAuthorityDependencies = {
  verifyUser(jwt: string): Promise<VerifiedAdminIdentity | null>;
  getMember(authUserId: string): Promise<MemberRow | null>;
  repository: AdminAuthorityRepository;
  now(): Date;
  mode(): AdminAuthorityMode;
  legacyAdminEmail(): string | null;
};

function bearerToken(req: Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

export function configuredAdminAuthorityMode(): AdminAuthorityMode {
  const value = process.env.RESEARCH_ADMIN_AUTHORITY_MODE?.trim().toLowerCase();
  return value === "dual" || value === "durable" ? value : "legacy";
}

export function activeRoles(
  rows: Array<{ role?: unknown }>,
): PrelaunchRole[] {
  return rows
    .map((row) => row.role)
    .filter(isPrelaunchRole);
}

export function buildAdminAuthorityProductionDependencies(): AdminAuthorityDependencies {
  const admin = getSupabaseAdmin();
  return {
    async verifyUser(jwt) {
      if (!supabaseConfigured()) throw new Error("supabase_not_configured");
      const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
      if (error || !data?.user?.id) return null;
      return {
        authUserId: data.user.id,
        email: data.user.email ?? null,
      };
    },
    getMember: getMemberByAuthUserId,
    repository: {
      async getActiveRoles(authUserId, now) {
        const { data, error } = await admin
          .from("research_prelaunch_role_assignments")
          .select("role")
          .eq("auth_user_id", authUserId)
          .is("revoked_at", null)
          .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
        if (error) throw error;
        return activeRoles(data ?? []);
      },
      async getPreference(authUserId) {
        const { data, error } = await admin
          .from("research_admin_experience_preferences")
          .select("preferred_experience,version")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        if (error) throw error;
        return {
          experience:
            data?.preferred_experience === "member" ? "member" : "admin",
          version:
            Number.isInteger(data?.version) && Number(data?.version) >= 0
              ? Number(data?.version)
              : 0,
        };
      },
      async setPreference({ authUserId, command }) {
        const { data, error } = await admin.rpc(
          "research_admin_set_experience_preference",
          {
            p_actor_auth_user_id: authUserId,
            p_preferred_experience: command.experience,
            p_expected_version: command.expectedVersion,
            p_idempotency_key: command.idempotencyKey,
          },
        );
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error("preference_not_updated");
        return {
          experience:
            row.preferred_experience === "member" ? "member" : "admin",
          version: Number(row.version),
        };
      },
    },
    now: () => new Date(),
    mode: configuredAdminAuthorityMode,
    legacyAdminEmail: () => {
      const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      return value || null;
    },
  };
}

async function resolveAuthority(
  deps: AdminAuthorityDependencies,
  identity: VerifiedAdminIdentity,
): Promise<AdminAuthority | null> {
  const roles = await deps.repository.getActiveRoles(
    identity.authUserId,
    deps.now(),
  );
  if (roles.includes("super_admin")) {
    return { roles, source: "persisted_super_admin" };
  }
  if (deps.mode() === "durable") return null;
  const legacyEmail = deps.legacyAdminEmail();
  if (
    legacyEmail &&
    identity.email &&
    identity.email.trim().toLowerCase() === legacyEmail
  ) {
    return { roles, source: "legacy_cutover" };
  }
  return null;
}

export function buildRequireSuperAdmin(deps: AdminAuthorityDependencies) {
  return async function requireSuperAdmin(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    noStore(res);
    const jwt = bearerToken(req);
    if (!jwt) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }
    if (denyRecoveryPurposeSession(jwt, res)) return;
    try {
      const identity = await deps.verifyUser(jwt);
      if (!identity) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }
      const authority = await resolveAuthority(deps, identity);
      if (!authority) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      Object.assign(req as Request & Record<string, unknown>, {
        adminAuthUserId: identity.authUserId,
        adminEmail: identity.email,
        adminRoles: authority.roles,
        adminAuthoritySource: authority.source,
      });
      return next();
    } catch {
      return res
        .status(503)
        .json({ success: false, message: "Admin authorization unavailable" });
    }
  };
}

function memberDestination(
  member: MemberRow,
): "/research/member" | "/research/activate" {
  return member.status === "pending_activation"
    ? "/research/activate"
    : "/research/member";
}

async function resolveLanding(
  deps: AdminAuthorityDependencies,
  identity: VerifiedAdminIdentity,
): Promise<AuthenticatedLandingResponse | null> {
  const [authority, member, preference] = await Promise.all([
    resolveAuthority(deps, identity),
    deps.getMember(identity.authUserId),
    deps.repository.getPreference(identity.authUserId),
  ]);
  const adminAuthorized = authority !== null;
  const memberAuthorized = member !== null && member.status !== "closed";
  if (!adminAuthorized && !memberAuthorized) return null;

  const preferredExperience =
    adminAuthorized && preference.experience === "member" && memberAuthorized
      ? "member"
      : adminAuthorized
        ? "admin"
        : "member";
  return {
    ok: true,
    authUserId: identity.authUserId,
    destination:
      preferredExperience === "admin"
        ? "/admin"
        : memberDestination(member as MemberRow),
    preferredExperience,
    preferenceVersion: preference.version,
    adminAuthorized,
    memberAuthorized,
    authoritySource: authority?.source ?? null,
  };
}

async function verifiedIdentity(
  deps: AdminAuthorityDependencies,
  req: Request,
  res: Response,
): Promise<VerifiedAdminIdentity | null | undefined> {
  noStore(res);
  const jwt = bearerToken(req);
  if (!jwt) {
    res.status(401).json({ ok: false, code: "sign_in_required" });
    return null;
  }
  if (denyRecoveryPurposeSession(jwt, res)) return null;
  try {
    const identity = await deps.verifyUser(jwt);
    if (!identity) {
      res.status(401).json({ ok: false, code: "sign_in_required" });
      return null;
    }
    return identity;
  } catch {
    res
      .status(503)
      .json({ ok: false, code: "admin_authority_unavailable" });
    return undefined;
  }
}

export function registerAdminAuthorityApi(
  app: import("express").Express,
  deps: AdminAuthorityDependencies,
) {
  app.get("/api/research/auth/landing", async (req, res) => {
    const identity = await verifiedIdentity(deps, req, res);
    if (!identity) return;
    try {
      const landing = await resolveLanding(deps, identity);
      if (!landing) {
        return res
          .status(403)
          .json({ ok: false, code: "account_not_authorized" });
      }
      return res.json(landing);
    } catch {
      return res
        .status(503)
        .json({ ok: false, code: "admin_authority_unavailable" });
    }
  });

  app.post("/api/research/auth/experience", async (req, res) => {
    const identity = await verifiedIdentity(deps, req, res);
    if (!identity) return;
    const parsed = experienceCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "validation_failed" });
    }
    try {
      const authority = await resolveAuthority(deps, identity);
      if (!authority) {
        return res
          .status(403)
          .json({ ok: false, code: "super_admin_required" });
      }
      if (
        parsed.data.experience === "member" &&
        !(await deps.getMember(identity.authUserId))
      ) {
        return res
          .status(409)
          .json({ ok: false, code: "member_experience_unavailable" });
      }
      await deps.repository.setPreference({
        authUserId: identity.authUserId,
        command: parsed.data,
      });
      const landing = await resolveLanding(deps, identity);
      if (!landing) throw new Error("landing_unavailable");
      return res.json(landing);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      return res.status(message.includes("version") ? 409 : 503).json({
        ok: false,
        code: message.includes("version")
          ? "preference_version_conflict"
          : "admin_authority_unavailable",
      });
    }
  });
}
