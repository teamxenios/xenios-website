export const IDENTITY_RECORD_LABELS = { verified: "Verified", not_started: "Not started", pending: "Pending" } as const;
export type ReportedAgreement = { id: string; title: string; version: string; acknowledged: boolean };
export type PartnerOnboardingReport = {
  verification: { state: keyof typeof IDENTITY_RECORD_LABELS };
  agreements: ReportedAgreement[];
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const label = (value: unknown, limit: number): value is string => typeof value === "string"
  && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

// Validate the existing source DTO, but do not display its free-form identity
// detail as a review receipt or an instruction that no action is required.
export function readPartnerOnboardingReport(value: unknown): PartnerOnboardingReport | null {
  if (!record(value) || !exact(value, ["ok", "verification", "agreements"]) || value.ok !== true
    || !record(value.verification) || !exact(value.verification, ["state", "detail"])
    || typeof value.verification.state !== "string" || !Object.hasOwn(IDENTITY_RECORD_LABELS, value.verification.state)
    || !label(value.verification.detail, 2000) || !Array.isArray(value.agreements)) return null;
  const agreements: ReportedAgreement[] = [];
  const ids = new Set<string>();
  for (const row of value.agreements) {
    if (!record(row) || !exact(row, ["id", "title", "version", "acknowledged"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || !label(row.title, 200) || typeof row.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(row.version)
      || typeof row.acknowledged !== "boolean") return null;
    ids.add(row.id);
    agreements.push({ id: row.id, title: row.title, version: row.version, acknowledged: row.acknowledged });
  }
  return { verification: { state: value.verification.state as PartnerOnboardingReport["verification"]["state"] }, agreements };
}
