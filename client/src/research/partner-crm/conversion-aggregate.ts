export type ConversionAggregate = Readonly<{ period: string; activations: number; renewals?: number | null }>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Read aggregate events only. Missing history is not zero, a person, a purchase, or a permission. */
export function readConversionAggregates(value: unknown): ConversionAggregate[] | null {
  if (!record(value) || !Object.hasOwn(value, "ok") || value.ok !== true || !Object.hasOwn(value, "rows") || !Array.isArray(value.rows)
    || Object.keys(value).length !== 2) return null;
  const rows: ConversionAggregate[] = [];
  const periods = new Set<string>();
  for (const row of value.rows) {
    if (!record(row) || !Object.hasOwn(row, "period") || !Object.hasOwn(row, "activations")
      || Object.keys(row).some((key) => !["period", "activations", "renewals"].includes(key))
      || typeof row.period !== "string" || row.period.length !== 7 || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.period)
      || periods.has(row.period) || !count(row.activations)
      || (Object.hasOwn(row, "renewals") && row.renewals !== null && !count(row.renewals))) return null;
    periods.add(row.period);
    rows.push({ period: row.period, activations: row.activations,
      ...(Object.hasOwn(row, "renewals") ? { renewals: row.renewals as number | null } : {}) });
  }
  return rows;
}
