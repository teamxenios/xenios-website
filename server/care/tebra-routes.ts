import type { Request, RequestHandler } from "express";
import { TEBRA_SYNC_ENTITIES, type TebraSyncEntity } from "@shared/care/tebra";
import { requireCarePermission, type CareAccessDependencies } from "./access";
import type { TebraAdminService } from "./tebra-admin";
import { tebraErrorEnvelope } from "./tebra-redaction";

/**
 * Care administrator surfaces for the Tebra connector.
 *
 * This module deliberately exports handlers rather than registering them. Two
 * separate rules point the same way. registerCareApi in server/care/index.ts is
 * the composition seam and belongs to the integration lane, and the route
 * inventory in server/release-control-plane.test.ts, which counts every Express
 * registration in the repository, is leased to the release manager. Registering
 * here would either break that guard or require editing a file this lane does
 * not own. So the connector supplies the pieces and the owning lane performs
 * the two registrations and updates the inventory in the same change. The exact
 * wiring is written down in docs/care/TEBRA_CONNECTOR.md.
 *
 * Authorization reuses the existing Care access middleware, so the capability
 * check, the role check, and the access audit that already guard Care apply
 * here unchanged. care:administer is held only by clinical_admin.
 */

export interface TebraRouteDependencies {
  access: CareAccessDependencies;
  service: TebraAdminService;
}

export interface TebraAdminHandlers {
  /** The existing Care permission gate, bound to care:administer. */
  requireAdmin: RequestHandler;
  /** GET TEBRA_ROUTE_CONTRACTS.status */
  status: RequestHandler;
  /** POST TEBRA_ROUTE_CONTRACTS.sync */
  sync: RequestHandler;
}

function requestedEntity(req: Request): TebraSyncEntity | null | undefined {
  const raw = (req.body as { entity?: unknown } | undefined)?.entity;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  return (TEBRA_SYNC_ENTITIES as readonly string[]).includes(raw)
    ? (raw as TebraSyncEntity)
    : undefined;
}

function careHeaders(res: Parameters<RequestHandler>[1]): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

export function createTebraAdminHandlers(deps: TebraRouteDependencies): TebraAdminHandlers {
  return {
    requireAdmin: requireCarePermission("care:administer", deps.access),

    status: async (_req, res) => {
      careHeaders(res);
      try {
        res.json({ ok: true, integration: await deps.service.status() });
      } catch {
        // Adapter and repository failures stay inside the Care boundary. The
        // operator learns the integration is unavailable and nothing more.
        res.status(503).json(tebraErrorEnvelope("tebra_unavailable"));
      }
    },

    sync: async (req, res) => {
      careHeaders(res);

      const entity = requestedEntity(req);
      if (entity === undefined) {
        res.status(400).json(tebraErrorEnvelope("tebra_invalid_payload"));
        return;
      }

      try {
        const result = await deps.service.sync(entity ?? undefined);
        // The run is bounded and already complete, but 202 is the honest
        // status: a lease may have deferred it, and the outcomes say which.
        res.status(202).json({ ok: true, outcomes: result.outcomes });
      } catch {
        res.status(503).json(tebraErrorEnvelope("tebra_unavailable"));
      }
    },
  };
}
