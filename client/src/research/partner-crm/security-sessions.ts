export type ReportedPartnerSession = {
  id: string;
  startedAt: string;
  device: string | null;
  approximateLocation: string | null;
  current: boolean;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const nullableLabel = (value: unknown): value is string | null => value === null
  || (typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value));
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === datePart && Number.isFinite(Date.parse(value));
}

// The DTO has no completeness/source-ready marker or revocation authority.
// Preserve only the reported fields; never infer the actual current browser session.
export function readPartnerSecuritySessions(value: unknown): ReportedPartnerSession[] | null {
  if (!record(value) || !exact(value, ["ok", "sessions"]) || value.ok !== true || !Array.isArray(value.sessions)) return null;
  const sessions: ReportedPartnerSession[] = [];
  const ids = new Set<string>();
  for (const row of value.sessions) {
    if (!record(row) || !exact(row, ["id", "startedAt", "device", "approximateLocation", "current"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || !timestamp(row.startedAt) || !nullableLabel(row.device) || !nullableLabel(row.approximateLocation)
      || typeof row.current !== "boolean") return null;
    ids.add(row.id);
    sessions.push({ id: row.id, startedAt: row.startedAt, device: row.device, approximateLocation: row.approximateLocation, current: row.current });
  }
  return sessions;
}
