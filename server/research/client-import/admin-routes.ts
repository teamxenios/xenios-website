// Admin-only HTTP surface for client-import dry runs.
//
// PRODUCTION-DISABLED (P1-10/11, 2026-08-27): server/index.ts wraps this
// registration in RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED === "true" — with the
// flag absent (the production default) no route exists at all. The import
// surface is not required for the customer-portal deploy, and it stays dark
// until its validation/privacy hardening clears independent re-review. The
// local dry-run CLI (scripts/research/client-import-dry-run.ts) remains the
// authorized-operator path.
//
// The surface accepts rows and returns REPORTS. It never returns staged
// records, never echoes a person's name, and has no invitation/send/activate
// route AT ALL — those actions require founder-approved execution that this
// lane does not implement. Raw person-name and product strings are bounded
// and normalized in the importer; the report carries canonical exception
// codes plus counts, and the only free text it may carry are product-string
// details, each length-clamped before they cross the boundary.

import type { Express, Request, Response } from "express";
import { runImportDryRun, type ImportSourceRow } from "./importer";
import type { ClientImportStagingStore } from "./staging-store";

export interface ClientImportAdminGuards {
  requireAdmin: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

export type ClientImportAdminDeps = Readonly<{
  store: ClientImportStagingStore;
  /** Injected so tests are deterministic; production passes a UUID factory. */
  newBatchId?: () => string;
}>;

const BASE = "/api/admin/research/client-imports";
const MAX_ROWS = 5_000;

export function registerClientImportAdminApi(
  app: Express,
  deps: ClientImportAdminDeps,
  guards: ClientImportAdminGuards,
): void {
  const guarded = (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) => {
      void Promise.resolve(guards.requireAdmin(req, res, async () => {
        try {
          await handler(req, res);
        } catch {
          res.status(500).json({ kind: "error" });
        }
      }));
    };

  app.post(`${BASE}/dry-run`, guarded(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceLabel = body.sourceLabel;
    const sourcePartner = body.sourcePartner;
    const relationshipOwner = body.relationshipOwner;
    const rows = body.rows;
    if (
      typeof sourceLabel !== "string" || sourceLabel.trim() === "" ||
      typeof sourcePartner !== "string" || sourcePartner.trim() === "" ||
      typeof relationshipOwner !== "string" || relationshipOwner.trim() === "" ||
      !Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS ||
      !rows.every(
        (r): r is ImportSourceRow =>
          typeof r === "object" && r !== null &&
          typeof (r as ImportSourceRow).name === "string" &&
          typeof (r as ImportSourceRow).product === "string",
      )
    ) {
      res.status(400).json({ kind: "denied", reason: "invalid_import_payload" });
      return;
    }
    const batchId = (deps.newBatchId ?? (() => `imp-${Math.random().toString(36).slice(2, 10)}`))();
    const outcome = runImportDryRun({
      batchId,
      sourceLabel: sourceLabel.trim(),
      rows,
      sourcePartner: sourcePartner.trim(),
      relationshipOwner: relationshipOwner.trim(),
    });
    await deps.store.saveBatch(outcome.report, outcome.staged);
    res.status(201).json({ kind: "ok", data: outcome.report });
  }));

  app.get(`${BASE}/:batchId`, guarded(async (req, res) => {
    const raw = req.params.batchId;
    const report = await deps.store.reportFor(typeof raw === "string" ? raw : "");
    if (report === null) {
      res.status(404).json({ kind: "denied", reason: "batch_not_found" });
      return;
    }
    res.json({ kind: "ok", data: report });
  }));

  app.get(BASE, guarded(async (_req, res) => {
    res.json({ kind: "ok", data: await deps.store.listReports() });
  }));
}
