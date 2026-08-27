// Client-list import: the wire vocabulary for the admin-only staging importer.
//
// The import pipeline is deliberately incapable of side effects a founder has
// not separately approved:
//
//   parse → normalize → dedupe → aggregate → attribute → staging (consent
//   pending, not invited) → [founder approves an invitation wave] → invitation
//   → [the person accepts] → active account
//
// Everything before the founder approval is a DRY RUN over staging data. The
// importer never sends anything, never creates an auth user, and never marks
// consent. Reports carry COUNTS and mapping exceptions — never person names,
// emails, or any row-level identity. Raw source rows live only in the staging
// store (service-role), never in git, fixtures, logs, or test output.

export const IMPORT_CONSENT_STATES = ["pending", "granted", "declined"] as const;
export type ImportConsentState = (typeof IMPORT_CONSENT_STATES)[number];

export const IMPORT_ACCOUNT_STATES = [
  "not_invited",
  "invitation_approved",
  "invited",
  "active",
] as const;
export type ImportAccountState = (typeof IMPORT_ACCOUNT_STATES)[number];

/**
 * A staged person AFTER normalization — the shape the staging store holds.
 * This type never crosses the admin report boundary; reports are counts only.
 */
export type StagedClientRecord = Readonly<{
  /** Opaque staging id — NOT derived from the person's name. */
  stagingId: string;
  /** Original person-name string, kept ONLY in the staging store for audit. */
  sourceName: string;
  normalizedNameKey: string;
  /** Canonical interest keys after alias mapping (e.g. "bpc157-tb500"). */
  interestKeys: readonly string[];
  /** The verbatim product strings, preserved for audit. */
  rawInterests: readonly string[];
  /** Interests that no alias rule could map — surfaced as exceptions. */
  unmappedInterests: readonly string[];
  sourcePartner: string;
  relationshipOwner: string;
  consentStatus: ImportConsentState;
  accountStatus: ImportAccountState;
  /** Email/phone/state are absent in the source file; required before invite. */
  contactEmail: string | null;
  contactPhone: string | null;
  usState: string | null;
}>;

/**
 * Canonical exception codes. The report carries the CODE, an occurrence
 * count, and — only where a product string is involved — a non-reversible
 * 12-hex reference derived from that product string, so an operator holding
 * the source file can correlate rows without any raw input crossing the
 * boundary (P1-11, 2026-08-27). Person names never produce a reference at
 * all: name-derived hashes are dictionary-guessable and therefore not
 * non-reversible in practice.
 */
export const IMPORT_EXCEPTION_KINDS = [
  "unmapped_interest",
  "ambiguous_blend",
  "duplicate_person",
  "empty_interest",
  "not_applicable_row",
  "formula_like_value",
  "suffix_ambiguity",
  "punctuation_variant_names",
] as const;
export type ImportExceptionKind = (typeof IMPORT_EXCEPTION_KINDS)[number];

export const IMPORT_ROW_REJECTION_CODES = [
  "blank_name",
  "name_too_long",
  "product_too_long",
  "malformed_row",
] as const;
export type ImportRowRejectionCode = (typeof IMPORT_ROW_REJECTION_CODES)[number];

export type ImportMappingException = Readonly<{
  kind: ImportExceptionKind;
  /** Non-reversible product-string reference; null for name-derived kinds. */
  ref: string | null;
  occurrences: number;
}>;

export type ProductStringRef = Readonly<{ ref: string; occurrences: number }>;

/**
 * The admin-facing dry-run report: aggregate truth, zero identity, zero raw
 * input. Counts, canonical codes, canonical interest keys, and non-reversible
 * product-string references are the ONLY things that cross this boundary —
 * never a person name, never a verbatim product cell.
 */
export type ImportDryRunReportDto = Readonly<{
  batchId: string;
  sourceLabel: string;
  dryRun: true;
  totalRows: number;
  /** Rows refused outright; every one is counted, none silently dropped. */
  rejectedRows: number;
  rejectionCounts: Readonly<Record<ImportRowRejectionCode, number>>;
  /** totalRows - rejectedRows: the rows the pipeline actually staged from. */
  processedRows: number;
  uniquePeople: number;
  duplicateNameRows: number;
  multiInterestPeople: number;
  /** Everyone, today: the source file has no email/phone columns. */
  missingContact: number;
  /** Unique (person, interest-key) pairs — a repeated interest on one person never inflates demand. */
  mappedInterestMentions: number;
  distinctInterestKeys: number;
  unmappedInterests: readonly ProductStringRef[];
  ambiguousBlendStrings: readonly ProductStringRef[];
  consentStatusCounts: Readonly<Record<ImportConsentState, number>>;
  accountStatusCounts: Readonly<Record<ImportAccountState, number>>;
  /** People eligible for an invitation wave TODAY (consent + contact present). */
  invitationEligible: number;
  exceptions: readonly ImportMappingException[];
  /** Demand aggregation by canonical key, most-demanded first. */
  interestBreakdown: readonly Readonly<{ interestKey: string; mentions: number }>[];
}>;
