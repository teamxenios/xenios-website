import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import {
  getAnalytics,
  listLoi,
  listNotesByType,
  type AnalyticsSummary,
  type LoiRow,
  type NoteRow,
} from "../supabase-store";
import {
  excludeCareManualAccessRows,
  isCareManualAccessOperationsRow,
  partitionCareManualAccessRows,
} from "./manual-access-classifier";

// ---------------------------------------------------------------------------
// Care ↔ generic LOI domain boundary.
//
// Care access requests live in `loi_submissions`, the same table the generic
// Early Interest / LOI admin surfaces read (server/routes.ts, a protected
// core-site file that this candidate must not edit). Without this boundary a
// Care request appears in BOTH the dedicated Care queue and the generic LOI
// queue, and the generic status writer can stamp a legacy LOI status onto it,
// which then shows up as a foreign status inside the Care queue: two competing
// administrative workflows over one record.
//
// The boundary is composed from the Care registrar, which server/index.ts
// mounts BEFORE `registerRoutes`, so these prefix-scoped handlers run first:
//
//   GET   /api/admin/loi             answers with the generic rows only
//   PATCH /api/admin/loi/:id/status  refuses a Care row (404, before any write)
//                                    and otherwise defers to the generic route
//   GET   /api/admin/export?type=loi answers the CSV with generic rows only
//   GET   /api/admin/analytics       answers with Care rows removed from the LOI
//                                    total and daily counts
//
// Registered with `app.use(prefix, …)` rather than a second route so the
// release route census still sees exactly one registration per generic door.
// Every answer sits behind the same canonical admin guard the generic routes
// use; nothing here grants authority.
// ---------------------------------------------------------------------------

export interface CareLoiBoundaryDependencies {
  listLoi(): Promise<LoiRow[]>;
  listNotesByType(recordType: string): Promise<NoteRow[]>;
  getAnalytics(): Promise<AnalyticsSummary>;
}

export function buildCareLoiBoundaryProductionDependencies(): CareLoiBoundaryDependencies {
  return { listLoi, listNotesByType, getAnalytics };
}

export const CARE_LOI_BOUNDARY_PREFIXES = Object.freeze({
  loi: "/api/admin/loi",
  export: "/api/admin/export",
  analytics: "/api/admin/analytics",
});

// Express routes case-insensitively, so the refusal must too: `/STATUS` is the
// same door as `/status` for the generic writer behind us.
const LOI_STATUS_PATH = /^\/([^/]+)\/status\/?$/iu;
const UUID_32 = /^[0-9a-f]{32}$/u;

/**
 * Postgres `uuid` equality accepts upper-case hex, braces and missing hyphens
 * as the same value, and the generic writer updates by `eq("id", …)`. The
 * boundary therefore compares canonical 32-hex forms; a value that is not a
 * uuid spelling is compared verbatim (Postgres will reject it downstream).
 */
export function canonicalRowIdentity(value: string): string {
  const compact = value.trim().replace(/^\{|\}$/gu, "").replace(/-/gu, "").toLowerCase();
  return UUID_32.test(compact) ? compact : value;
}

function isReadMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * Mirrors the generic export's CSV shape (server/routes.ts `toCsv`) so the
 * Care-filtered generic export is byte-identical for generic rows. Pinned by
 * server/care/loi-boundary-parity.test.ts against the real generic handler.
 */
export function genericLoiCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/u.test(str) ? `"${str.replace(/"/gu, '""')}"` : str;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => esc(row[h])).join(","))].join("\n");
}

function joinNotes(rows: LoiRow[], notes: NoteRow[]): Record<string, unknown>[] {
  const byRecord = new Map<string, string[]>();
  for (const n of notes) {
    const ts = n.created_at ? `${n.created_at} ` : "";
    const author = n.author ? `${n.author}: ` : "";
    const line = `${ts}${author}${n.note}`.trim();
    const list = byRecord.get(n.record_id) ?? [];
    list.push(line);
    byRecord.set(n.record_id, list);
  }
  return rows.map((r) => ({
    ...(r as unknown as Record<string, unknown>),
    notes: (byRecord.get(String(r.id)) ?? []).join(" | "),
  }));
}

/** Removes Care rows from the generic analytics without recomputing them. */
export function subtractCareFromAnalytics(
  summary: AnalyticsSummary,
  rows: readonly LoiRow[],
): AnalyticsSummary {
  const { care } = partitionCareManualAccessRows(rows);
  const daily = summary.daily.map((bucket) => ({ ...bucket }));
  const byDate = new Map(daily.map((bucket) => [bucket.date, bucket]));
  for (const row of care) {
    const key = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : "";
    const bucket = byDate.get(key);
    if (bucket && bucket.loi > 0) bucket.loi -= 1;
  }
  return {
    ...summary,
    loiTotal: Math.max(0, summary.loiTotal - care.length),
    daily,
  };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function registerCareLoiBoundary(
  app: Express,
  guard: RequestHandler,
  deps: CareLoiBoundaryDependencies,
): void {
  const guarded =
    (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(
        guard(req, res, (error?: unknown) => {
          if (error) return next(error);
          handler(req, res, next).catch(next);
        }),
      ).catch(next);
    };

  app.use(
    CARE_LOI_BOUNDARY_PREFIXES.loi,
    (req: Request, res: Response, next: NextFunction) => {
      if (isReadMethod(req.method) && (req.path === "/" || req.path === "")) {
        return guarded(async (_req, response) => {
          try {
            const rows = await deps.listLoi();
            response.json({ success: true, data: excludeCareManualAccessRows(rows) });
          } catch (err) {
            console.error("[care/loi-boundary] list error:", err);
            response.status(500).json({ success: false, message: "Failed to load early interest" });
          }
        })(req, res, next);
      }
      const match = req.method === "PATCH" ? LOI_STATUS_PATH.exec(req.path) : null;
      if (match) {
        const id = canonicalRowIdentity(decodeSegment(match[1]));
        return guarded(async (_req, response, pass) => {
          let row: LoiRow | undefined;
          try {
            row = (await deps.listLoi()).find(
              (candidate) => canonicalRowIdentity(String(candidate.id)) === id,
            );
          } catch (err) {
            // Fail closed: if the boundary cannot tell whether this is a Care
            // row, the generic writer must not run.
            console.error("[care/loi-boundary] status lookup error:", err);
            response.status(500).json({ success: false, message: "Failed to update status" });
            return;
          }
          if (row && isCareManualAccessOperationsRow(row)) {
            // Non-revealing: the generic LOI system has no such record.
            response.status(404).json({ success: false, message: "Not found" });
            return;
          }
          pass();
        })(req, res, next);
      }
      next();
    },
  );

  app.use(
    CARE_LOI_BOUNDARY_PREFIXES.export,
    (req: Request, res: Response, next: NextFunction) => {
      if (!isReadMethod(req.method) || (req.path !== "/" && req.path !== "")) return next();
      if (String(req.query.type || "waitlist") !== "loi") return next();
      return guarded(async (_req, response) => {
        try {
          const [rows, notes] = await Promise.all([deps.listLoi(), deps.listNotesByType("loi")]);
          const csv = genericLoiCsv(joinNotes(excludeCareManualAccessRows(rows), notes));
          response.setHeader("Content-Type", "text/csv; charset=utf-8");
          response.setHeader("Content-Disposition", 'attachment; filename="xenios-loi.csv"');
          response.send(csv);
        } catch (err) {
          console.error("[care/loi-boundary] export error:", err);
          response.status(500).json({ success: false, message: "Failed to export" });
        }
      })(req, res, next);
    },
  );

  app.use(
    CARE_LOI_BOUNDARY_PREFIXES.analytics,
    (req: Request, res: Response, next: NextFunction) => {
      if (!isReadMethod(req.method) || (req.path !== "/" && req.path !== "")) return next();
      return guarded(async (_req, response) => {
        try {
          const [summary, rows] = await Promise.all([deps.getAnalytics(), deps.listLoi()]);
          response.json({ success: true, data: subtractCareFromAnalytics(summary, rows) });
        } catch (err) {
          console.error("[care/loi-boundary] analytics error:", err);
          response.status(500).json({ success: false, message: "Failed to load analytics" });
        }
      })(req, res, next);
    },
  );
}
