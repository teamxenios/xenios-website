import type { Request } from "express";
import {
  CARE_CAPABILITY_STATES,
  isCareRole,
  type CareCapabilityState,
  type CarePrincipal,
  type CareRole,
} from "@shared/care/contracts";
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  supabaseConfigured,
} from "../supabase";
import type {
  CareAccessDecision,
  CareAccessDependencies,
} from "./access";
import { careCapabilityStatusForState } from "./capability";

export interface CareCapabilityRow {
  state: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface CareProductionAdapters {
  authenticate: (token: string) => Promise<{ id: string } | null>;
  loadActiveRoles: (userId: string) => Promise<readonly string[]>;
  loadCapability: () => Promise<CareCapabilityRow | null>;
  writeAccessAudit: (decision: CareAccessDecision) => Promise<void>;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

function safeCapabilityState(value: string): CareCapabilityState {
  return (CARE_CAPABILITY_STATES as readonly string[]).includes(value)
    ? (value as CareCapabilityState)
    : "disabled";
}

export function createCareProductionDependencies(
  adapters: CareProductionAdapters,
  env: NodeJS.ProcessEnv = process.env,
): CareAccessDependencies {
  return {
    loadCapabilityStatus: async () => {
      const row = await adapters.loadCapability();
      if (!row) return careCapabilityStatusForState("disabled");

      const stored = safeCapabilityState(row.state);
      const fullyApproved =
        stored === "enabled" &&
        Boolean(row.approved_by) &&
        Boolean(row.approved_at) &&
        env.CARE_ENABLED === "true" &&
        env.CARE_ENABLE_APPROVED === "true";

      return careCapabilityStatusForState(
        stored === "enabled" && !fullyApproved ? "pending_qa" : stored,
      );
    },
    resolvePrincipal: async (req) => {
      const token = bearerToken(req);
      if (!token) return null;
      const user = await adapters.authenticate(token);
      if (!user) return null;
      const roles = (await adapters.loadActiveRoles(user.id)).filter(isCareRole) as CareRole[];
      const principal: CarePrincipal = { subjectId: user.id, roles };
      return principal;
    },
    recordAccessDecision: adapters.writeAccessAudit,
  };
}

export function buildCareProductionDependencies(
  env: NodeJS.ProcessEnv = process.env,
): CareAccessDependencies {
  if (!supabaseConfigured() || !env.SUPABASE_ANON_KEY) {
    return createCareProductionDependencies({
      authenticate: async () => null,
      loadActiveRoles: async () => [],
      loadCapability: async () => null,
      writeAccessAudit: async () => undefined,
    }, env);
  }

  const admin = getSupabaseAdmin();
  const anon = getSupabaseAnon();
  return createCareProductionDependencies({
    authenticate: async (token) => {
      const { data, error } = await anon.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    loadActiveRoles: async (userId) => {
      const { data, error } = await admin
        .from("care_role_assignments")
        .select("role")
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (error) throw new Error("care_role_lookup_failed");
      return (data ?? []).map((row) => String(row.role));
    },
    loadCapability: async () => {
      const { data, error } = await admin
        .from("care_capabilities")
        .select("state, approved_by, approved_at")
        .eq("capability_key", "care")
        .maybeSingle();
      if (error) throw new Error("care_capability_lookup_failed");
      return data as CareCapabilityRow | null;
    },
    writeAccessAudit: async (decision) => {
      const { error } = await admin.from("care_access_audit").insert({
        actor_user_id: decision.actorSubjectId,
        permission: decision.permission,
        outcome: decision.outcome,
        occurred_at: decision.occurredAt,
      });
      if (error) throw new Error("care_access_audit_failed");
    },
  }, env);
}
