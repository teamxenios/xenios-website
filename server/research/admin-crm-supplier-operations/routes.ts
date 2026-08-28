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

const recommendationSchema = z.object({
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
    const status = error.code === "trust_dial_never"
      ? 403
      : error.code === "invalid_request" || error.code === "unsafe_request"
        ? 400
        : 503;
    return res.status(status).json({ ok: false, code: error.code, message: error.message });
  }
  console.error("[admin crm supplier operations] unavailable");
  return res.status(503).json({ ok: false, code: "unavailable", message: "Operations workspace unavailable." });
}

/**
 * Global registration remains Lead-owned. Composition must inject read-only
 * source projections and one durable atomic Trust Dial/recommendation
 * authority, then mount behind the existing requireSupabaseAdmin guard.
 */
export function registerAdminCrmSupplierOperationsApi(
  app: Express,
  deps: AdminCrmSupplierOperationsRouteDependencies,
): void {
  app.get("/api/admin/research/crm-supplier-operations", deps.requireAdmin, async (req, res) => {
    res.set("Cache-Control", "no-store");
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
    res.set("Cache-Control", "no-store");
    try {
      const actorId = await actorFor(req, deps);
      if (!actorId) return res.status(403).json({ ok: false, code: "actor_not_permitted" });
      const parsed = recommendationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, code: "invalid_request", message: "Review request is invalid." });
      }
      const recommendation = await deps.service.recordRecommendation(actorId, parsed.data);
      return res.status(201).json({ ok: true, recommendation });
    } catch (error) {
      return failure(res, error);
    }
  });
}
