import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ADMIN_CRM_ACTIONS } from "@shared/research/admin-crm-supplier-operations";
import { AdminCrmRefusal, type AdminCrmSupplierOperationsService } from "./service";

export interface AdminCrmSupplierOperationsRouteDependencies {
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
  /** Resolve a storage-layer actor id from the already verified admin email. */
  resolveActorId: (verifiedAdminEmail: string) => Promise<string | null>;
  service: AdminCrmSupplierOperationsService;
}

const queueActionSchema = z.object({
  action: z.enum(ADMIN_CRM_ACTIONS),
  targetType: z.string().min(1).max(200),
  targetId: z.string().min(1).max(200),
  reason: z.string().min(8).max(1000),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

async function actorFor(req: Request, deps: AdminCrmSupplierOperationsRouteDependencies): Promise<string | null> {
  const verifiedEmail = (req as Request & { adminEmail?: unknown }).adminEmail;
  if (typeof verifiedEmail !== "string" || !verifiedEmail.trim()) return null;
  return deps.resolveActorId(verifiedEmail);
}

function failure(res: Response, error: unknown): Response {
  if (error instanceof AdminCrmRefusal) {
    const status = error.code === "trust_dial_never" ? 403 : 400;
    return res.status(status).json({ ok: false, code: error.code, message: error.message });
  }
  console.error("[admin crm supplier operations] unavailable", error);
  return res.status(503).json({ ok: false, code: "unavailable", message: "Operations workspace unavailable." });
}

/**
 * Registration is deliberately not called by server/routes.ts in Pack 05.
 * Integration must rebase/recreate this slice, wire a storage-scoped
 * repository, then mount behind the existing requireSupabaseAdmin guard.
 */
export function registerAdminCrmSupplierOperationsApi(
  app: Express,
  deps: AdminCrmSupplierOperationsRouteDependencies,
): void {
  app.get("/api/admin/research/crm-supplier-operations", deps.requireAdmin, async (req, res) => {
    try {
      const actorId = await actorFor(req, deps);
      if (!actorId) return res.status(403).json({ ok: false, code: "actor_not_permitted" });
      const snapshot = await deps.service.readSnapshot(actorId);
      return res.status(200).json({ ok: true, snapshot });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.post("/api/admin/research/crm-supplier-operations/actions", deps.requireAdmin, async (req, res) => {
    try {
      const actorId = await actorFor(req, deps);
      if (!actorId) return res.status(403).json({ ok: false, code: "actor_not_permitted" });
      const parsed = queueActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, code: "invalid_request", message: "Action request is invalid." });
      }
      const queued = await deps.service.queueAction(actorId, parsed.data);
      return res.status(202).json({ ok: true, queued });
    } catch (error) {
      return failure(res, error);
    }
  });
}
