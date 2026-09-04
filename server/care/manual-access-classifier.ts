import type { LoiRow } from "../supabase-store";
import { CARE_MANUAL_ACCESS_SOURCE_PAGE } from "@shared/care/manual-access";

// ---------------------------------------------------------------------------
// The ONE canonical, server-safe classifier for Xenios Care manual-access rows.
//
// Care access requests are persisted by server/care/manual-access.ts into the
// generic `loi_submissions` table with four strong markers. Every operational
// consumer that must tell a Care request apart from a generic Early Interest /
// LOI record (the dedicated Care admin projection, and the Care-domain boundary
// that keeps Care rows out of the generic LOI list, CSV export, analytics and
// status writer) imports this module. There must never be a second copy of this
// logic: a drifting copy is how one record ends up with two competing
// administrative workflows.
//
// Pure by construction: only a type import from the store (erased at runtime)
// and shared Care constants, so server/routes.ts-adjacent code and the Care
// registrar can both consume it without an import cycle.
// ---------------------------------------------------------------------------

export const CARE_ACCESS_BUSINESS_NAME = "Xenios Care access request";
export const CARE_ACCESS_ROLE_PREFIX = "care_access:";
export const CARE_ACCESS_SCHEMA = "xenios_care_manual_access_v1";

/** Parses the persisted operational payload; never throws. */
export function parseCareRawPayload(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function rawPayloadHasCareSchema(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).schema === CARE_ACCESS_SCHEMA
  );
}

/**
 * Current production writes all four markers. Recognition accepts ANY strong
 * marker so a partial future schema drift becomes a visible data-quality
 * warning in the Care queue instead of making a successfully saved request
 * disappear, and so a malformed operational payload can never demote a Care
 * request into the generic LOI workflow.
 */
export function isCareManualAccessOperationsRow(row: LoiRow): boolean {
  const raw = parseCareRawPayload(row.why_interested);
  return (
    row.business_name === CARE_ACCESS_BUSINESS_NAME ||
    row.role?.startsWith(CARE_ACCESS_ROLE_PREFIX) === true ||
    rawPayloadHasCareSchema(raw) ||
    (row.source_page === CARE_MANUAL_ACCESS_SOURCE_PAGE &&
      row.landing_page === CARE_MANUAL_ACCESS_SOURCE_PAGE)
  );
}

/** Rows that belong to the generic Early Interest / LOI workflow only. */
export function excludeCareManualAccessRows<T extends LoiRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isCareManualAccessOperationsRow(row));
}

export function partitionCareManualAccessRows<T extends LoiRow>(
  rows: readonly T[],
): { care: T[]; generic: T[] } {
  const care: T[] = [];
  const generic: T[] = [];
  for (const row of rows) {
    (isCareManualAccessOperationsRow(row) ? care : generic).push(row);
  }
  return { care, generic };
}
