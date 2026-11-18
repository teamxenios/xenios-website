import contentBatch from "./data/reviewed-public-content.json";
import committedTable from "./data/reviewed-search-terms.json";

/**
 * Reviewed alternative names for exact listings, read by the quote-request picker's search.
 *
 * A record names the same substance or listing another way ("copper peptide" for a GHK-Cu
 * row). It is not a topic, a benefit or a recommendation: a health or goal word is never an
 * identity term, and this table has no other kind. A term matches only when the whole
 * normalized query equals it. No stemming, substring or fuzzy match, so "peptide" never
 * matches a row through "copper peptide".
 *
 * Approval is the committed table, reviewed by its sha256. Withdrawal is a commit that
 * removes the record, effective when that commit is deployed; there is no runtime switch.
 * Each record's review expiry is enforced on every lookup.
 *
 * The table is bound to the reviewed dataset bytes: its datasetSha256 must equal the one the
 * reviewed public content is bound to, and the catalog adds terms only to rows of a dataset
 * whose bytes registered as reviewed (isReviewedDatasetVariant). A mismatch leaves search
 * as it was. A malformed table refuses to load, like the reviewed media file. Every committed
 * target is checked against the bound dataset in CI (reviewed-search-terms.test.ts).
 *
 * Holds are not in the table. The catalog reads the current inquiry-review, strength-review,
 * form and formulation holds on every read, so a hold added later suppresses the match with
 * no edit here.
 *
 * Adapted from the reviewed-search-intent proposal in Samuel's 2026-11-18 referral/AE/search
 * package (its identity-alias half only).
 */
export type ReviewedSearchTermEntry = Readonly<{ term: string; expiresAtMs: number }>;
export type ReviewedSearchTerms = Readonly<{
  revision: string;
  /** Terms reviewed for this exact source identity, or undefined. Search only: never in a DTO. */
  entriesFor(offeringId: string, sourceVariantId: string): readonly ReviewedSearchTermEntry[] | undefined;
}>;

const TABLE_KEYS = ["schemaVersion", "revision", "datasetSha256", "records"] as const;
const RECORD_KEYS = ["id", "kind", "terms", "targets", "evidence", "reviewExpiresAt"] as const;
const TARGET_KEYS = ["offeringId", "sourceVariantId"] as const;
const EVIDENCE_KEYS = ["source", "revision"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isClean = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max
  && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);

/** The one normalization for terms and queries. */
export function normalizeSearchTerm(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function refuse(reason: string): never {
  throw new Error("reviewed-search-terms: " + reason);
}

/** The key datasetIdentities uses for one source identity. */
export const searchTermIdentityKey = (offeringId: string, sourceVariantId: string): string =>
  JSON.stringify([offeringId, sourceVariantId]);

/**
 * Validate a term table. Throws on any malformed, duplicate or ambiguous record, and, when the
 * bound dataset's identities are given, on any target that is not in it. Returns an empty
 * lookup when the table is bound to other dataset bytes than the reviewed ones.
 */
export function loadReviewedSearchTerms(table: unknown, reviewedDatasetSha256: string,
  datasetIdentities?: ReadonlySet<string>): ReviewedSearchTerms {
  if (!isRecord(table) || !hasExactKeys(table, TABLE_KEYS)) refuse("table shape");
  if (table.schemaVersion !== 1) refuse("schemaVersion");
  if (!isClean(table.revision, 100)) refuse("revision");
  if (typeof table.datasetSha256 !== "string" || !/^[0-9a-f]{64}$/.test(table.datasetSha256)) refuse("datasetSha256");
  if (!Array.isArray(table.records) || table.records.length > 1000) refuse("records");
  const revision = table.revision;

  const byIdentity = new Map<string, ReviewedSearchTermEntry[]>();
  const ids = new Set<string>();
  const terms = new Set<string>();
  for (const record of table.records as unknown[]) {
    if (!isRecord(record) || !hasExactKeys(record, RECORD_KEYS)) refuse("record shape");
    if (!isClean(record.id, 100) || ids.has(record.id)) refuse("record id");
    ids.add(record.id);
    if (record.kind !== "identity_alias") refuse("kind " + record.id);
    const expiresAtMs = typeof record.reviewExpiresAt === "string" ? Date.parse(record.reviewExpiresAt) : NaN;
    if (!Number.isFinite(expiresAtMs)) refuse("reviewExpiresAt " + record.id);
    if (!Array.isArray(record.evidence) || record.evidence.length < 1 || record.evidence.length > 10
      || !record.evidence.every((item) => isRecord(item) && hasExactKeys(item, EVIDENCE_KEYS)
        && isClean(item.source, 500) && isClean(item.revision, 200))) refuse("evidence " + record.id);
    if (!Array.isArray(record.terms) || record.terms.length < 1 || record.terms.length > 30) refuse("terms " + record.id);
    const recordTerms: string[] = [];
    for (const value of record.terms as unknown[]) {
      if (!isClean(value, 120)) refuse("term " + record.id);
      const term = normalizeSearchTerm(value);
      // One term, one record: a term in two records would be ambiguous.
      if (terms.has(term)) refuse("duplicate term " + JSON.stringify(term));
      terms.add(term);
      recordTerms.push(term);
    }
    if (!Array.isArray(record.targets) || record.targets.length < 1 || record.targets.length > 500) refuse("targets " + record.id);
    const targets = new Set<string>();
    for (const target of record.targets as unknown[]) {
      if (!isRecord(target) || !hasExactKeys(target, TARGET_KEYS)
        || typeof target.offeringId !== "string" || !/^mo_[0-9a-f]+$/.test(target.offeringId)
        || typeof target.sourceVariantId !== "string" || !/^mov_[0-9a-f]+$/.test(target.sourceVariantId)) refuse("target " + record.id);
      const identity = searchTermIdentityKey(target.offeringId, target.sourceVariantId);
      if (targets.has(identity)) refuse("duplicate target " + record.id);
      if (datasetIdentities && !datasetIdentities.has(identity)) refuse("target not in the dataset " + record.id);
      targets.add(identity);
      const entries = byIdentity.get(identity) ?? [];
      for (const term of recordTerms) entries.push(Object.freeze({ term, expiresAtMs }));
      byIdentity.set(identity, entries);
    }
  }

  // Bound to other bytes than the reviewed dataset: inert, never a guess.
  if (table.datasetSha256 !== reviewedDatasetSha256) {
    return Object.freeze({ revision, entriesFor: () => undefined });
  }
  for (const [identity, entries] of byIdentity) byIdentity.set(identity, Object.freeze(entries) as ReviewedSearchTermEntry[]);
  return Object.freeze({
    revision,
    entriesFor: (offeringId: string, sourceVariantId: string) => byIdentity.get(searchTermIdentityKey(offeringId, sourceVariantId)),
  });
}

/**
 * True when the whole normalized query equals an unexpired reviewed term of this row. The clock
 * is read only when the row has terms, so an empty table changes nothing.
 */
export function matchesReviewedSearchTerm(
  entries: readonly ReviewedSearchTermEntry[] | undefined, query: string, clock: () => number,
): boolean {
  if (!entries || entries.length === 0 || query.length > 120) return false;
  const term = normalizeSearchTerm(query);
  if (!term) return false;
  const now = clock();
  if (!Number.isFinite(now)) return false;
  return entries.some((entry) => entry.term === term && now < entry.expiresAtMs);
}

/** The committed, reviewed table, bound to the reviewed public-content dataset digest. */
export const REVIEWED_SEARCH_TERMS: ReviewedSearchTerms = loadReviewedSearchTerms(committedTable, contentBatch.datasetSha256);
