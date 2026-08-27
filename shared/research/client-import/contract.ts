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

export type ImportMappingException = Readonly<{
  kind:
    | "unmapped_interest"
    | "ambiguous_blend"
    | "duplicate_person"
    | "empty_interest"
    | "not_applicable_row";
  /** The offending PRODUCT string — never a person name. */
  detail: string;
  occurrences: number;
}>;

/** The admin-facing dry-run report: aggregate truth, zero identity. */
export type ImportDryRunReportDto = Readonly<{
  batchId: string;
  sourceLabel: string;
  dryRun: true;
  totalRows: number;
  uniquePeople: number;
  duplicateNameRows: number;
  multiInterestPeople: number;
  /** Everyone, today: the source file has no email/phone columns. */
  missingContact: number;
  mappedInterestMentions: number;
  distinctInterestKeys: number;
  unmappedInterests: readonly string[];
  ambiguousBlendStrings: readonly Readonly<{ raw: string; occurrences: number }>[];
  consentStatusCounts: Readonly<Record<ImportConsentState, number>>;
  accountStatusCounts: Readonly<Record<ImportAccountState, number>>;
  /** People eligible for an invitation wave TODAY (consent + contact present). */
  invitationEligible: number;
  exceptions: readonly ImportMappingException[];
  /** Demand aggregation by canonical key, most-demanded first. */
  interestBreakdown: readonly Readonly<{ interestKey: string; mentions: number }>[];
}>;
