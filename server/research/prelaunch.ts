import type { Express, NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  effectiveProviderMode,
  isPrelaunchProviderMode,
  isPrelaunchRole,
  type PrelaunchAccessStatus,
  type PrelaunchDataContext,
  type PrelaunchLaunchStatus,
  type PrelaunchProviderMode,
  type PrelaunchRole,
  type PrelaunchRoleAssignmentView,
  type PrelaunchSeedContext,
} from "@shared/research/prelaunch";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";
import { denyRecoveryPurposeSession } from "./member-auth";
import {
  registerAdminAuthorityApi,
  type AdminAuthorityDependencies,
} from "./admin-authority";

type VerifiedPrelaunchUser = {
  id: string;
};

type SeedNamespaceRow = {
  namespace: string;
  seed_version: number;
  reset_group: string;
  release_eligible: boolean;
  status: string;
};

type PrelaunchSettings = {
  launchStatus: PrelaunchLaunchStatus;
  providerMode: PrelaunchProviderMode;
};

export type PrelaunchAccessAuditInput = {
  authUserId: string;
  routeGroup: string;
  role: PrelaunchRole | null;
  decision: "allowed" | "denied";
  reasonCode: string;
  requestId: string;
  seedNamespace: string | null;
  occurredAt: Date;
};

export type PrelaunchRepository = {
  getActiveRoles(authUserId: string, now: Date): Promise<PrelaunchRole[]>;
  getSeedNamespace(namespace: string): Promise<SeedNamespaceRow | null>;
  getSettings(): Promise<PrelaunchSettings>;
  appendAccessAudit(input: PrelaunchAccessAuditInput): Promise<void>;
  listRoleAssignments(): Promise<PrelaunchRoleAssignmentView[]>;
  grantRole(input: {
    authUserId: string;
    role: PrelaunchRole;
    actorAuthUserId: string;
    reason: string;
    expiresAt: string | null;
    idempotencyKey: string;
  }): Promise<PrelaunchRoleAssignmentView>;
  revokeRole(input: {
    assignmentId: string;
    actorAuthUserId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<void>;
};

export type PrelaunchDependencies = {
  verifyUser(jwt: string): Promise<VerifiedPrelaunchUser | null>;
  repository: PrelaunchRepository;
  now(): Date;
  requestId(): string;
};

const grantRoleSchema = z.object({
  authUserId: z.string().uuid(),
  role: z.string().refine(isPrelaunchRole, "Unknown pre-launch role."),
  reason: z.string().trim().min(3).max(500),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const revokeRoleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
});

function bearerToken(req: Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function requestedSeedNamespace(req: Request): string | null {
  const raw = req.header("x-xenios-seed-namespace");
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(value) ? value : "__invalid__";
}

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

async function resolveDataContext(
  repository: PrelaunchRepository,
  namespace: string | null,
): Promise<PrelaunchDataContext | null> {
  if (!namespace) {
    return {
      dataOrigin: "real",
      seedNamespace: null,
      seedVersion: null,
      resetGroup: null,
      releaseEligible: true,
    };
  }
  if (namespace === "__invalid__") return null;
  const row = await repository.getSeedNamespace(namespace);
  if (
    !row ||
    row.status !== "active" ||
    row.release_eligible !== false ||
    !Number.isInteger(row.seed_version) ||
    row.seed_version < 1
  ) {
    return null;
  }
  return {
    dataOrigin: "internal_seed",
    seedNamespace: row.namespace,
    seedVersion: row.seed_version,
    resetGroup: row.reset_group,
    releaseEligible: false,
  } satisfies PrelaunchSeedContext;
}

export function buildPrelaunchGuard(
  deps: PrelaunchDependencies,
  allowedRoles?: readonly PrelaunchRole[],
  options: { allowSeedContext?: boolean } = {},
) {
  return async function requirePrelaunchAccess(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    noStore(res);
    const jwt = bearerToken(req);
    if (!jwt) {
      return res.status(401).json({ ok: false, code: "sign_in_required" });
    }
    if (denyRecoveryPurposeSession(jwt, res)) return;

    let user: VerifiedPrelaunchUser | null;
    try {
      user = await deps.verifyUser(jwt);
    } catch {
      return res.status(503).json({ ok: false, code: "prelaunch_auth_unavailable" });
    }
    if (!user) {
      return res.status(401).json({ ok: false, code: "sign_in_required" });
    }

    const requestId = deps.requestId();
    const now = deps.now();
    const namespace = requestedSeedNamespace(req);

    try {
      const [roles, dataContext] = await Promise.all([
        deps.repository.getActiveRoles(user.id, now),
        namespace && options.allowSeedContext === false
          ? Promise.resolve(null)
          : resolveDataContext(deps.repository, namespace),
      ]);
      const role =
        roles.find((candidate) => !allowedRoles || allowedRoles.includes(candidate)) ??
        null;
      const allowed = role !== null && dataContext !== null;
      await deps.repository.appendAccessAudit({
        authUserId: user.id,
        routeGroup:
          req.path.startsWith("/api/internal") ||
          req.path.startsWith("/api/admin/research")
            ? req.path.slice(0, 200)
            : "/api/internal",
        role,
        decision: allowed ? "allowed" : "denied",
        reasonCode:
          dataContext === null
            ? "seed_namespace_unavailable"
            : role === null
              ? "role_required"
              : "authorized",
        requestId,
        seedNamespace: dataContext?.seedNamespace ?? namespace,
        occurredAt: now,
      });

      if (!allowed) {
        return res.status(403).json({
          ok: false,
          code:
            dataContext === null
              ? "seed_namespace_unavailable"
              : "prelaunch_role_required",
        });
      }
      const settings = await deps.repository.getSettings();
      const status: PrelaunchAccessStatus = {
        roles,
        dataContext,
        providerMode: effectiveProviderMode(
          settings.providerMode,
          dataContext.dataOrigin,
        ),
        launchStatus: settings.launchStatus,
      };
      (
        req as Request & {
          prelaunchAccess?: PrelaunchAccessStatus;
          prelaunchActorId?: string;
        }
      ).prelaunchAccess = status;
      (req as Request & { prelaunchActorId?: string }).prelaunchActorId =
        user.id;
      return next();
    } catch {
      return res.status(503).json({ ok: false, code: "prelaunch_access_unavailable" });
    }
  };
}

function assignmentView(row: Record<string, unknown>): PrelaunchRoleAssignmentView {
  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id),
    role: String(row.role) as PrelaunchRole,
    grantedAt: String(row.granted_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

export function buildPrelaunchProductionDependencies(): PrelaunchDependencies {
  const admin = getSupabaseAdmin();
  const repository: PrelaunchRepository = {
    async getActiveRoles(authUserId, now) {
      const { data, error } = await admin
        .from("research_prelaunch_role_assignments")
        .select("role")
        .eq("auth_user_id", authUserId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.role)
        .filter(isPrelaunchRole);
    },

    async getSeedNamespace(namespace) {
      const { data, error } = await admin
        .from("research_prelaunch_seed_namespaces")
        .select("namespace,seed_version,reset_group,release_eligible,status")
        .eq("namespace", namespace)
        .maybeSingle();
      if (error) throw error;
      return (data as SeedNamespaceRow | null) ?? null;
    },

    async getSettings() {
      const { data, error } = await admin
        .from("research_prelaunch_settings")
        .select("launch_status,provider_mode")
        .eq("key", "canonical")
        .single();
      if (error) throw error;
      const launchStatus = String(data.launch_status) as PrelaunchLaunchStatus;
      const providerMode = isPrelaunchProviderMode(data.provider_mode)
        ? data.provider_mode
        : "disabled";
      return { launchStatus, providerMode };
    },

    async appendAccessAudit(input) {
      const { error } = await admin.from("research_prelaunch_access_audit").insert({
        auth_user_id: input.authUserId,
        route_group: input.routeGroup,
        role: input.role,
        decision: input.decision,
        reason_code: input.reasonCode,
        request_id: input.requestId,
        seed_namespace: input.seedNamespace,
        occurred_at: input.occurredAt.toISOString(),
      });
      if (error) throw error;
    },

    async listRoleAssignments() {
      const { data, error } = await admin
        .from("research_prelaunch_role_assignments")
        .select("id,auth_user_id,role,granted_at,expires_at,revoked_at")
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => assignmentView(row));
    },

    async grantRole(input) {
      const { data, error } = await admin.rpc("research_admin_role_grant", {
        p_actor_auth_user_id: input.actorAuthUserId,
        p_target_auth_user_id: input.authUserId,
        p_role: input.role,
        p_reason: input.reason,
        p_expires_at: input.expiresAt,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("assignment_not_created");
      return assignmentView(row);
    },

    async revokeRole(input) {
      const { data, error } = await admin.rpc("research_admin_role_revoke", {
        p_actor_auth_user_id: input.actorAuthUserId,
        p_assignment_id: input.assignmentId,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      if (!data) throw new Error("assignment_not_active");
    },
  };

  return {
    async verifyUser(jwt) {
      if (!supabaseConfigured()) throw new Error("supabase_not_configured");
      const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
      if (error || !data?.user?.id) return null;
      return { id: data.user.id };
    },
    repository,
    now: () => new Date(),
    requestId: () => randomUUID(),
  };
}

export function registerPrelaunchApi(
  app: Express,
  deps: PrelaunchDependencies,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => unknown,
  adminAuthority?: AdminAuthorityDependencies,
) {
  const requirePrelaunch = buildPrelaunchGuard(deps);
  if (adminAuthority) registerAdminAuthorityApi(app, adminAuthority);

  app.get("/api/internal/prelaunch/status", requirePrelaunch, (req, res) => {
    noStore(res);
    res.json({
      ok: true,
      status: (req as Request & { prelaunchAccess: PrelaunchAccessStatus })
        .prelaunchAccess,
    });
  });

  app.get(
    "/api/admin/research/prelaunch/roles",
    requireAdmin,
    async (_req, res) => {
      noStore(res);
      try {
        res.json({
          ok: true,
          assignments: await deps.repository.listRoleAssignments(),
        });
      } catch {
        res
          .status(503)
          .json({ ok: false, code: "prelaunch_role_repository_unavailable" });
      }
    },
  );

  app.post(
    "/api/admin/research/prelaunch/roles",
    requireAdmin,
    async (req, res) => {
      noStore(res);
      const parsed = grantRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        const assignment = await deps.repository.grantRole({
          authUserId: parsed.data.authUserId,
          role: parsed.data.role as PrelaunchRole,
          actorAuthUserId: String(
            (req as Request & { adminAuthUserId?: string }).adminAuthUserId ??
              "",
          ),
          reason: parsed.data.reason,
          expiresAt: parsed.data.expiresAt ?? null,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        return res.status(201).json({ ok: true, assignment });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "prelaunch_role_not_granted" });
      }
    },
  );

  app.delete(
    "/api/admin/research/prelaunch/roles/:assignmentId",
    requireAdmin,
    async (req, res) => {
      noStore(res);
      const id = z.string().uuid().safeParse(req.params.assignmentId);
      const body = revokeRoleSchema.safeParse(req.body);
      if (!id.success || !body.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        await deps.repository.revokeRole({
          assignmentId: id.data,
          actorAuthUserId: String(
            (req as Request & { adminAuthUserId?: string }).adminAuthUserId ??
              "",
          ),
          reason: body.data.reason,
          idempotencyKey: body.data.idempotencyKey,
        });
        return res.json({ ok: true });
      } catch {
        return res
          .status(409)
          .json({ ok: false, code: "prelaunch_role_not_revoked" });
      }
    },
  );
}
