export const EVENT_SCHEDULE_LABELS = { scheduled: "Scheduled", "not scheduled": "Not scheduled" } as const;
export type ReportedPartnerEvent = { id: string; name: string; date: string | null; location: null; status: keyof typeof EVENT_SCHEDULE_LABELS };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function dateOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Current portal projection is organization-scoped by the server and has no
// venue/review column. A schedule marker is not event approval or occurrence.
export function readPartnerEventRecords(value: unknown): ReportedPartnerEvent[] | null {
  if (!record(value) || !exact(value, ["ok", "events"]) || value.ok !== true || !Array.isArray(value.events)) return null;
  const rows: ReportedPartnerEvent[] = [];
  const ids = new Set<string>();
  for (const row of value.events) {
    if (!record(row) || !exact(row, ["id", "name", "date", "location", "status"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 || /[\u0000-\u001f\u007f]/.test(row.name)
      || !dateOrNull(row.date) || row.location !== null
      || typeof row.status !== "string" || !Object.hasOwn(EVENT_SCHEDULE_LABELS, row.status)
      || (row.status === "not scheduled" && row.date !== null)) return null;
    ids.add(row.id);
    rows.push({ id: row.id, name: row.name, date: row.date, location: null, status: row.status as ReportedPartnerEvent["status"] });
  }
  return rows;
}

export type EventRequestDraft = { name: string; date: string; location: string; description: string };
// Preserve the existing four required, trim-only request fields. The current
// server refuses intake; this helper does not invent registration or approval.
export function prepareEventRequest(draft: EventRequestDraft): { body: EventRequestDraft } | { error: string } {
  const body = { name: draft.name.trim(), date: draft.date.trim(), location: draft.location.trim(), description: draft.description.trim() };
  if (!body.name || !body.date || !body.location || !body.description) return { error: "Please fill in the event name, date, location, and description." };
  return { body };
}
