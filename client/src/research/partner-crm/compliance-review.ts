export const CONTENT_REVIEW_LABELS = {
  submitted: "Submitted", approved: "Approved", declined: "Declined", expired: "Expired", withdrawn: "Withdrawn",
} as const;
export type ContentReviewRecord = {
  id: string; title: string; submittedAt: string | null; status: keyof typeof CONTENT_REVIEW_LABELS;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function dateOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// History does not include expiry, approved wording, disclosure, or current-use permission.
export function readComplianceReview(value: unknown): ContentReviewRecord[] | null {
  if (!record(value) || !exact(value, ["ok", "submissions"]) || value.ok !== true || !Array.isArray(value.submissions)) return null;
  const rows: ContentReviewRecord[] = [];
  const ids = new Set<string>();
  for (const row of value.submissions) {
    if (!record(row) || !exact(row, ["id", "title", "submittedAt", "status"])
      || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.id) || ids.has(row.id)
      || typeof row.title !== "string" || !row.title.trim() || row.title.length > 200 || /[\u0000-\u001f\u007f]/.test(row.title)
      || !dateOrNull(row.submittedAt)
      || typeof row.status !== "string" || !Object.hasOwn(CONTENT_REVIEW_LABELS, row.status)) return null;
    ids.add(row.id);
    rows.push({ id: row.id, title: row.title, submittedAt: row.submittedAt, status: row.status as ContentReviewRecord["status"] });
  }
  return rows;
}

export type ComplianceDraft = { title: string; link: string; description: string };
export type ComplianceSubmission = { title: string; link: string | null; description: string };
// Match the existing route's trim/length contract. A draft link remains opaque POST data,
// not a rendered navigation target or a URL that this client fetches.
export function prepareComplianceDraft(draft: ComplianceDraft): { body: ComplianceSubmission } | { error: string } {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const link = draft.link.trim() || null;
  if (!title || !description) return { error: "Please add a title and a description of the content." };
  if (title.length > 200 || description.length > 5000 || (link !== null && link.length > 500)) {
    return { error: "Use at most 200 characters for the title, 500 for the draft link, and 5000 for the description." };
  }
  return { body: { title, link, description } };
}
