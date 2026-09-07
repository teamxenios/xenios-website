export const PAYOUT_STATUS_LABELS = {
  built: "Built", submitted: "Submitted", completed: "Completed", failed: "Failed", cancelled: "Cancelled",
} as const;
export type PayoutRecordStatus = keyof typeof PAYOUT_STATUS_LABELS;
export type PayoutRecords = Readonly<{
  method: { label: string; configured: boolean };
  payouts: Array<{ id: string; date: string; amountCents: number; method: string; status: PayoutRecordStatus }>;
}>;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const SETUP_LABELS = ["Payout method on file", "Payout method submitted, awaiting review", "Payout method needs attention", "No payout method on file"];
function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Read-only projection of the current portal batch DTO, never provider execution authority.
export function readPayoutRecords(value: unknown): PayoutRecords | null {
  if (!record(value) || !exactKeys(value, ["ok", "method", "payouts"]) || value.ok !== true
    || !record(value.method) || !exactKeys(value.method, ["label", "configured"])
    || typeof value.method.label !== "string" || !SETUP_LABELS.includes(value.method.label)
    || typeof value.method.configured !== "boolean"
    || value.method.configured !== (value.method.label === "Payout method on file")
    || !Array.isArray(value.payouts)) return null;
  const payouts: PayoutRecords["payouts"] = [];
  const ids = new Set<string>();
  for (const row of value.payouts) {
    if (!record(row) || !exactKeys(row, ["id", "date", "amountCents", "method", "status"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || !calendarDate(row.date)
      || typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents) || row.amountCents < 0
      || typeof row.method !== "string" || (row.method !== "No provider configured" && !/^[a-z][a-z0-9_-]{0,63}$/.test(row.method))
      || typeof row.status !== "string" || !Object.hasOwn(PAYOUT_STATUS_LABELS, row.status)) return null;
    ids.add(row.id);
    payouts.push({ id: row.id, date: row.date, amountCents: row.amountCents, method: row.method, status: row.status as PayoutRecordStatus });
  }
  return { method: { label: value.method.label, configured: value.method.configured }, payouts };
}
