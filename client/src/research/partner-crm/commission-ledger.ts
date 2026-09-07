import type { CommissionState } from "@shared/research/distribution";

export const COMMISSION_STATE_LABELS: Record<CommissionState, string> = {
  pending: "Pending", held: "Held", approved: "Approved", payable: "Payable", paid: "Paid",
  reversed: "Reversed", disputed: "Disputed", forfeited: "Forfeited",
};
export type CommissionLedgerEntry = Readonly<{
  id: string; date: string; description: string; commissionCents: number; state: CommissionState;
  ledger: "AFFILIATE_COMMISSION";
}>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Project only the current affiliate ledger contract; never combine ledgers, net amounts, or infer payment. */
export function readCommissionLedger(value: unknown): CommissionLedgerEntry[] | null {
  if (!record(value) || !exactKeys(value, ["ok", "entries"]) || value.ok !== true || !Array.isArray(value.entries)) return null;
  const entries: CommissionLedgerEntry[] = [];
  const seen = new Set<string>();
  for (const row of value.entries) {
    if (!record(row) || !exactKeys(row, ["id", "date", "description", "commissionCents", "state", "ledger"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || seen.has(row.id)
      || !calendarDate(row.date)
      || (row.description !== "Referred order commission" && row.description !== "Reversal of a referred order commission")
      || typeof row.commissionCents !== "number" || !Number.isSafeInteger(row.commissionCents)
      || typeof row.state !== "string" || !Object.hasOwn(COMMISSION_STATE_LABELS, row.state)
      || row.ledger !== "AFFILIATE_COMMISSION") return null;
    seen.add(row.id);
    entries.push({ id: row.id, date: row.date, description: row.description, commissionCents: row.commissionCents,
      state: row.state as CommissionState, ledger: row.ledger });
  }
  return entries;
}

/** Format recorded cents without floating-point division losing a minor unit. */
export function formatCommissionCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "Amount unavailable";
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}$${(absolute / 100n).toLocaleString("en-US")}.${String(absolute % 100n).padStart(2, "0")}`;
}
