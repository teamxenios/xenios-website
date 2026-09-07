import type { AttributionChannel } from "@shared/research/distribution";

// Labels for the existing attribution-channel contract, not CRM permissions.
export const LEAD_CHANNEL_LABELS: Record<AttributionChannel, string> = {
  signed_link: "Signed link", code: "Code", qr: "QR code", campaign: "Campaign",
  organization: "Organization", event: "Event", manual: "Manual",
};
export type LeadAggregate = Readonly<{ period: string; channel: AttributionChannel; leads: number }>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/**
 * Read the existing {ok:true, rows} API envelope, without coercion, inferred
 * totals, new roles, or carrying extra identity/contact fields into the UI.
 * Null is unreadable; [] is a successful read with no aggregate rows.
 */
export function readLeadAggregates(value: unknown): LeadAggregate[] | null {
  if (!record(value) || !exactKeys(value, ["ok", "rows"]) || value.ok !== true || !Array.isArray(value.rows)) return null;
  const rows: LeadAggregate[] = [];
  const seen = new Set<string>();
  for (const row of value.rows) {
    if (!record(row) || !exactKeys(row, ["period", "channel", "leads"])
      || typeof row.period !== "string" || row.period.length !== 7 || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.period)
      || typeof row.channel !== "string" || !Object.hasOwn(LEAD_CHANNEL_LABELS, row.channel)
      || typeof row.leads !== "number" || !Number.isSafeInteger(row.leads) || row.leads < 0) return null;
    const key = `${row.period}|${row.channel}`;
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({ period: row.period, channel: row.channel as AttributionChannel, leads: row.leads });
  }
  return rows;
}
