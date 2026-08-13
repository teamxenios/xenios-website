import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ADMIN_LANDING_ROLE_PRIORITY,
  type AuthenticatedExperience,
  type AuthenticatedLandingResponse,
} from "@shared/research/admin-access";
import type { PrelaunchRole } from "@shared/research/prelaunch";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";
import { denyRecoveryPurposeSession } from "./member-auth";

type VerifiedUser = {
  id: string;
  email: string | null;
};

type LandingMember = {
  id: string;
  status: string;
};

export type AuthenticatedLandingDependencies = {
  verifyUser(jwt: string): Promise<VerifiedUser | null>;
  getActiveRoles(authUserId: string, now: Date): Promise<PrelaunchRole[]>;
  getMember(authUserId: string, email: string | null): Promise<LandingMember | null>;
  getPreferredExperience(authUserId: string): Promise<AuthenticatedExperience | null>;
  setPreferredExperience(
    authUserId: string,
    experience: AuthenticatedExperience,
    now: Date,
  ): Promise<void>;
  appendAudit(input: {
    authUserId: string;
    routeGroup: string;
    role: PrelaunchRole | null;
    decision: "allowed" | "denied";
    reasonCode: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<void>;
  now(): Date;
  requestId(): string;
};

const preferenceSchema = z.object({
  experience: z.enum(["admin", "member"]),
});

function bearerToken(req: Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function primaryAdminRole(roles: readonly PrelaunchRole[]): PrelaunchRole | null {
  return ADMIN_LANDING_ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null;
}

function memberDestination(member: LandingMember): "/research/member" | "/research/activate" | null {
  if (member.status === "active") return "/research/member";
  if (member.status === "pending_activation") return "/research/activate";
  return null;
}

export function buildDurableAdministratorGuard(
  deps: AuthenticatedLandingDependencies,
) {
  return async function requireDurableAdministrator(
    req: Request,
    res: Response,
    next: () => void,
  ) {
    noStore(res);
    const jwt = bearerToken(req);
    if (!jwt) {
      return res.status(401).json({ ok: false, code: "sign_in_required" });
    }
    if (denyRecoveryPurposeSession(jwt, res)) return;
    try {
      const user = await deps.verifyUser(jwt);
      if (!user) {
        return res.status(401).json({ ok: false, code: "sign_in_required" });
      }
      const now = deps.now();
      const roles = await deps.getActiveRoles(user.id, now);
      const role = primaryAdminRole(roles);
      await deps.appendAudit({
        authUserId: user.id,
        routeGroup: req.path.slice(0, 200) || "/api/admin",
        role,
        decision: role ? "allowed" : "denied",
        reasonCode: role ? "durable_admin_role" : "active_admin_role_required",
        requestId: deps.requestId(),
        occurredAt: now,
      });
      if (!role) {
        return res
          .status(403)
          .json({ ok: false, code: "administrator_role_required" });
      }
      (
        req as Request & {
          adminEmail?: string;
          adminAuthUserId?: string;
          adminRole?: PrelaunchRole;
        }
      ).adminEmail = user.email ?? undefined;
      (req as Request & { adminAuthUserId?: string }).adminAuthUserId = user.id;
      (req as Request & { adminRole?: PrelaunchRole }).adminRole = role;
      return next();
    } catch {
      return res
        .status(503)
        .json({ ok: false, code: "administrator_access_unavailable" });
    }
  };
}

export function registerAuthenticatedLandingApi(
  app: Express,
  deps: AuthenticatedLandingDependencies,
) {
  async function resolve(
    req: Request,
    res: Response,
    requestedPreference?: AuthenticatedExperience,
  ) {
    noStore(res);
    const jwt = bearerToken(req);
    if (!jwt) {
      return res.status(401).json({ ok: false, code: "sign_in_required" });
    }
    if (denyRecoveryPurposeSession(jwt, res)) return;

    try {
      const user = await deps.verifyUser(jwt);
      if (!user) {
        return res.status(401).json({ ok: false, code: "sign_in_required" });
      }

      const now = deps.now();
      const [roles, member, storedPreference] = await Promise.all([
        deps.getActiveRoles(user.id, now),
        deps.getMember(user.id, user.email),
        deps.getPreferredExperience(user.id),
      ]);
      const adminRole = primaryAdminRole(roles);
      const resolvedMemberDestination = member ? memberDestination(member) : null;
      const availableExperiences: AuthenticatedExperience[] = [
        ...(adminRole ? (["admin"] as const) : []),
        ...(resolvedMemberDestination ? (["member"] as const) : []),
      ];

      if (availableExperiences.length === 0) {
        await deps.appendAudit({
          authUserId: user.id,
          routeGroup: "/api/research/auth/landing",
          role: null,
          decision: "denied",
          reasonCode: "authenticated_role_or_membership_required",
          requestId: deps.requestId(),
          occurredAt: now,
        });
        return res.status(403).json({
          ok: false,
          code: "authenticated_access_unavailable",
        });
      }

      if (
        requestedPreference &&
        !availableExperiences.includes(requestedPreference)
      ) {
        await deps.appendAudit({
          authUserId: user.id,
          routeGroup: "/api/research/auth/experience",
          role: adminRole,
          decision: "denied",
          reasonCode: `${requestedPreference}_experience_unavailable`,
          requestId: deps.requestId(),
          occurredAt: now,
        });
        return res.status(403).json({ ok: false, code: "experience_unavailable" });
      }

      const defaultExperience: AuthenticatedExperience = adminRole ? "admin" : "member";
      if (requestedPreference) {
        await deps.setPreferredExperience(user.id, requestedPreference, now);
      }
      // A stored preference is advisory only. Every request re-verifies the
      // durable role and member row; losing either authorization silently
      // removes that experience from the available set.
      const effectivePreference = requestedPreference ?? storedPreference;
      const selectedExperience =
        effectivePreference && availableExperiences.includes(effectivePreference)
          ? effectivePreference
          : defaultExperience;
      const destination =
        selectedExperience === "admin" ? "/admin" : resolvedMemberDestination!;
      const response: AuthenticatedLandingResponse = {
        ok: true,
        destination,
        defaultExperience,
        selectedExperience,
        availableExperiences,
        primaryAdminRole: adminRole,
        persistedPreference: requestedPreference ?? storedPreference,
      };

      await deps.appendAudit({
        authUserId: user.id,
        routeGroup: requestedPreference
          ? "/api/research/auth/experience"
          : "/api/research/auth/landing",
        role: adminRole,
        decision: "allowed",
        reasonCode: `landing_${selectedExperience}`,
        requestId: deps.requestId(),
        occurredAt: now,
      });
      return res.json(response);
    } catch {
      return res
        .status(503)
        .json({ ok: false, code: "authenticated_access_unavailable" });
    }
  }

  app.get("/api/research/auth/landing", (req, res) => resolve(req, res));

  app.post("/api/research/auth/experience", (req, res) => {
    const parsed = preferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      noStore(res);
      return res.status(400).json({ ok: false, code: "invalid_experience" });
    }
    return resolve(req, res, parsed.data.experience);
  });
}

export function buildAuthenticatedLandingProductionDependencies(): AuthenticatedLandingDependencies {
  const admin = getSupabaseAdmin();
  return {
    async verifyUser(jwt) {
      if (!supabaseConfigured()) throw new Error("supabase_not_configured");
      const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
      if (error || !data?.user?.id) return null;
      return {
        id: data.user.id,
        email:
          typeof data.user.email === "string"
            ? data.user.email.trim().toLowerCase()
            : null,
      };
    },
    async getActiveRoles(authUserId, now) {
      const { data, error } = await admin
        .from("research_prelaunch_role_assignments")
        .select("role")
        .eq("auth_user_id", authUserId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
      if (error) throw error;
      const known = new Set<string>(ADMIN_LANDING_ROLE_PRIORITY);
      return (data ?? [])
        .map((row) => String(row.role))
        .filter((role): role is PrelaunchRole => known.has(role));
    },
    async getMember(authUserId, email) {
      let query = admin
        .from("research_members")
        .select("id,status")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      let { data, error } = await query;
      if (error) throw error;
      if (!data && email) {
        ({ data, error } = await admin
          .from("research_members")
          .select("id,status")
          .eq("email", email)
          .maybeSingle());
        if (error) throw error;
      }
      return data ? { id: String(data.id), status: String(data.status) } : null;
    },
    async getPreferredExperience(authUserId) {
      const { data, error } = await admin
        .from("research_authenticated_experience_preferences")
        .select("preferred_experience")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      if (error) throw error;
      return data?.preferred_experience === "admin" ||
        data?.preferred_experience === "member"
        ? data.preferred_experience
        : null;
    },
    async setPreferredExperience(authUserId, experience, now) {
      const { error } = await admin
        .from("research_authenticated_experience_preferences")
        .upsert(
          {
            auth_user_id: authUserId,
            preferred_experience: experience,
            updated_at: now.toISOString(),
          },
          { onConflict: "auth_user_id" },
        );
      if (error) throw error;
    },
    async appendAudit(input) {
      const { error } = await admin.from("research_prelaunch_access_audit").insert({
        auth_user_id: input.authUserId,
        route_group: input.routeGroup,
        role: input.role,
        decision: input.decision,
        reason_code: input.reasonCode,
        request_id: input.requestId,
        seed_namespace: null,
        occurred_at: input.occurredAt.toISOString(),
      });
      if (error) throw error;
    },
    now: () => new Date(),
    requestId: () => randomUUID(),
  };
}
