export type ReportedTrainingModule = {
  id: string;
  title: string;
  summary: string;
  required: true;
  completed: boolean;
  completedAt: string | null;
};
export type PartnerTrainingReport = { modules: ReportedTrainingModule[]; certified: boolean };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const label = (value: unknown, limit: number): value is string => typeof value === "string"
  && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
function dateOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The existing source projects only required modules and a stored certification
// marker. It supplies no certification date, expiry, version, or access grant.
export function readPartnerTrainingReport(value: unknown): PartnerTrainingReport | null {
  if (!record(value) || !exact(value, ["ok", "modules", "certified"]) || value.ok !== true
    || !Array.isArray(value.modules) || typeof value.certified !== "boolean") return null;
  const modules: ReportedTrainingModule[] = [];
  const ids = new Set<string>();
  for (const row of value.modules) {
    if (!record(row) || !exact(row, ["id", "title", "summary", "required", "completed", "completedAt"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || !label(row.title, 200) || !label(row.summary, 2000) || row.required !== true
      || typeof row.completed !== "boolean" || !dateOrNull(row.completedAt)
      || (!row.completed && row.completedAt !== null)) return null;
    ids.add(row.id);
    modules.push({ id: row.id, title: row.title, summary: row.summary, required: true, completed: row.completed, completedAt: row.completedAt });
  }
  return { modules, certified: value.certified };
}
