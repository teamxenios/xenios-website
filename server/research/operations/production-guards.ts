import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../../supabase";
import {
  denyRecoveryPurposeSession,
  requireActiveMember,
  type MemberRow,
} from "../member-auth";
import type {
  OperationsRouteGuards,
  OperationsRouteRequest,
} from "./routes";
import type { OperationsActor, OperationsRole } from "./state-machines";

interface AuthenticatedOperationsRequest extends OperationsRouteRequest {
  operationsAuthUser?: User;
}

function bearer(req: Request): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function requireAuthUser(nextGuard: (req: AuthenticatedOperationsRequest, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return async (req: AuthenticatedOperationsRequest, res, next) => {
    try {
      if (!supabaseConfigured()) {
        res.status(503).json({ ok: false, code: "not_configured", message: "Authentication is not configured." });
        return;
      }
      const jwt = bearer(req);
      if (!jwt) {
        res.status(401).json({ ok: false, code: "signed_out", message: "Sign in required." });
        return;
      }
      const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
      if (error || !data.user) {
        res.status(401).json({ ok: false, code: "signed_out", message: "Sign in required." });
        return;
      }
      if (denyRecoveryPurposeSession(jwt, res)) return;
      req.operationsAuthUser = data.user;
      await nextGuard(req, res, next);
    } catch (error) {
      console.error("[research operations] authorization failed:", error);
      res.status(401).json({ ok: false, code: "signed_out", message: "Sign in required." });
    }
  };
}

function wrapAdmin(requireAdmin: RequestHandler): RequestHandler {
  return (req: OperationsRouteRequest, res, next) => {
    requireAdmin(req, res, () => {
      req.operationsActor = {
        id: String((req as Request & { adminEmail?: unknown }).adminEmail ?? "admin"),
        role: "admin",
      };
      next();
    });
  };
}

function wrapActiveMember(): RequestHandler {
  return (req: OperationsRouteRequest, res, next) => {
    void requireActiveMember(req, res, () => {
      const member = (req as Request & { researchMember?: MemberRow }).researchMember;
      if (!member) {
        res.status(403).json({ ok: false, code: "forbidden", message: "Active membership is required." });
        return;
      }
      req.operationsMemberRef = member.id;
      req.operationsActor = { id: member.auth_user_id, role: "professional" };
      next();
    });
  };
}

export function buildOperationsProductionGuards(
  requireAdmin: RequestHandler,
  client: SupabaseClient = getSupabaseAdmin(),
): OperationsRouteGuards {
  const requireLogistics = requireAuthUser(async (req, res, next) => {
    const authUserId = req.operationsAuthUser!.id;
    const result = await client
      .from("research_operations_staff_roles")
      .select("role")
      .eq("auth_user_id", authUserId)
      .eq("enabled", true)
      .maybeSingle();
    if (result.error) throw new Error(`staff role load failed: ${result.error.message}`);
    const role = String((result.data as { role?: unknown } | null)?.role ?? "") as OperationsRole;
    if (!["mitch", "logistics"].includes(role)) {
      res.status(403).json({ ok: false, code: "forbidden", message: "A logistics assignment is required." });
      return;
    }
    req.operationsActor = { id: authUserId, role };
    next();
  });

  const requireAffiliate = requireAuthUser(async (req, res, next) => {
    const authUserId = req.operationsAuthUser!.id;
    const member = await client
      .from("research_members")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (member.error) throw new Error(`affiliate member lookup failed: ${member.error.message}`);
    if (!member.data) {
      res.status(403).json({ ok: false, code: "login_refused", message: "No affiliate account is linked to this login." });
      return;
    }
    const partner = await client
      .from("research_partners")
      .select("id, role, state")
      .eq("member_id", (member.data as { id: string }).id)
      .maybeSingle();
    if (partner.error) throw new Error(`affiliate partner lookup failed: ${partner.error.message}`);
    const row = partner.data as { id?: unknown; role?: unknown; state?: unknown } | null;
    if (
      !row ||
      !["affiliate", "research_rep", "senior_research_rep", "professional_partner"].includes(String(row.role)) ||
      String(row.state) === "terminated"
    ) {
      res.status(403).json({ ok: false, code: "login_refused", message: "Affiliate access is unavailable." });
      return;
    }
    const jwt = bearer(req);
    const sessionKey = createHash("sha256").update(jwt).digest("hex");
    const session = await client.from("research_partner_security_sessions").upsert(
      {
        partner_id: String(row.id),
        auth_user_id: authUserId,
        session_key: sessionKey,
        started_at: req.operationsAuthUser!.last_sign_in_at ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        user_agent: String(req.headers["user-agent"] ?? "Unknown device").slice(0, 240),
      },
      { onConflict: "partner_id,session_key" },
    );
    if (session.error) throw new Error(`affiliate session record failed: ${session.error.message}`);
    req.operationsActor = { id: authUserId, role: "affiliate" };
    req.operationsSessionKey = sessionKey;
    next();
  });

  return {
    requireAdmin: wrapAdmin(requireAdmin),
    requireLogistics,
    requireAffiliate,
    requireMember: wrapActiveMember(),
    actorOf(req): OperationsActor | null {
      return req.operationsActor ?? null;
    },
    memberRefOf(req): string | null {
      return req.operationsMemberRef ?? null;
    },
  };
}
