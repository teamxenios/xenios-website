export const CAMPAIGN_LINK_LABELS = { "link issued": "Link issued", "link revoked": "Link revoked" } as const;
export type CampaignLinkRecord = { id: string; name: string; window: string | null; status: keyof typeof CAMPAIGN_LINK_LABELS };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function issuedWindow(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^Link issued \d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const datePart = value.slice("Link issued ".length);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === datePart;
}

// The current API groups the partner's link campaign codes. It does not return
// scheduled campaigns, review decisions, performance, or current link eligibility.
export function readCampaignLinkRecords(value: unknown): CampaignLinkRecord[] | null {
  if (!record(value) || !exact(value, ["ok", "campaigns"]) || value.ok !== true || !Array.isArray(value.campaigns)) return null;
  const rows: CampaignLinkRecord[] = [];
  const ids = new Set<string>();
  for (const row of value.campaigns) {
    if (!record(row) || !exact(row, ["id", "name", "window", "status"])
      || typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 || /[\u0000-\u001f\u007f]/.test(row.name)
      || row.id !== row.name || ids.has(row.name) || !issuedWindow(row.window)
      || typeof row.status !== "string" || !Object.hasOwn(CAMPAIGN_LINK_LABELS, row.status)) return null;
    ids.add(row.name);
    rows.push({ id: row.name, name: row.name, window: row.window, status: row.status as CampaignLinkRecord["status"] });
  }
  return rows;
}

export type CampaignRequestDraft = { name: string; timeframe: string; description: string };
// Preserve the existing trim-only, required-field client request body. The
// current server refuses this request route; no intake schema or grant is invented.
export function prepareCampaignRequest(draft: CampaignRequestDraft): { body: CampaignRequestDraft } | { error: string } {
  const body = { name: draft.name.trim(), timeframe: draft.timeframe.trim(), description: draft.description.trim() };
  if (!body.name || !body.timeframe || !body.description) return { error: "Please fill in the campaign name, timeframe, and description." };
  return { body };
}
