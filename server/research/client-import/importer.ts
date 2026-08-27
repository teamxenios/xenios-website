// The admin-only client-list DRY-RUN importer.
//
// This module is structurally incapable of the actions the import flow must
// not take on its own: it sends nothing, creates no auth user, marks no
// consent, and activates nothing. Its entire output is (a) staged records in
// an injected staging store and (b) an aggregate report with zero identity
// and zero raw input.
//
// Hardening rules (P1-11, 2026-08-27):
//   * Every input string is Unicode-normalized (NFKC), stripped of control
//     and format characters (bidi overrides included), and whitespace-
//     collapsed before anything reads it.
//   * Oversized or blank-name rows are REJECTED, explicitly and countably —
//     never silently dropped. totalRows = rejectedRows + processedRows.
//   * A person's repeated interest in the same product counts ONCE: demand
//     mentions are unique (person, canonical-key) pairs.
//   * Formula-shaped product cells (leading = + - @, the CSV-injection
//     alphabet) are never mapped and never echoed; they surface as the
//     canonical code `formula_like_value` with a non-reversible reference.
//   * Nothing name-derived and no verbatim product string enters the report.
//     Product strings surface only as sha256-prefix references an operator
//     can recompute from the source file they already hold.
//
// The flow, and where it STOPS:
//
//   parse → normalize → reject/stage → dedupe → aggregate interests per
//   person → attribute (source partner + relationship owner) →
//   consent_status = pending, account_status = not_invited → staging store →
//   REPORT.  ⛔ Everything after (invitation waves, account creation) requires
//   founder-approved execution that lives elsewhere and does not exist here.

import { createHash } from "node:crypto";
import type {
  ImportDryRunReportDto,
  ImportExceptionKind,
  ImportMappingException,
  ImportRowRejectionCode,
  StagedClientRecord,
} from "@shared/research/client-import/contract";
import {
  canonicalizeInterest,
  isAmbiguousBlendString,
  normalizedNameKey,
  splitInterests,
} from "./normalize";

export type ImportSourceRow = Readonly<{ name: string; product: string }>;

export type ImportDryRunInput = Readonly<{
  batchId: string;
  sourceLabel: string;
  rows: readonly ImportSourceRow[];
  sourcePartner: string;
  relationshipOwner: string;
}>;

export type ImportDryRunOutcome = Readonly<{
  report: ImportDryRunReportDto;
  /** Staged records — identity-bearing; go ONLY to the staging store. */
  staged: readonly StagedClientRecord[];
}>;

export const MAX_NAME_CHARS = 200;
export const MAX_PRODUCT_CHARS = 500;

/** NFKC + strip control/format characters + collapse whitespace + trim. */
export function sanitizeImportText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Non-reversible product-string reference: 12 hex of sha256 over the sanitized string. */
export function productStringRef(sanitizedProduct: string): string {
  return createHash("sha256").update(sanitizedProduct, "utf8").digest("hex").slice(0, 12);
}

/** The CSV-injection alphabet: a cell that starts a formula in a spreadsheet. */
export function isFormulaLike(value: string): boolean {
  return /^[=+@-]/.test(value) && !/^[+-]?\d/.test(value);
}

const KNOWN_NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "md", "phd", "do", "np"]);

function withoutSuffix(nameKey: string): string {
  const parts = nameKey.split(" ");
  const last = parts[parts.length - 1]?.replace(/[.,]/g, "");
  return parts.length > 1 && last !== undefined && KNOWN_NAME_SUFFIXES.has(last)
    ? parts.slice(0, -1).join(" ")
    : nameKey;
}

function punctuationStripped(nameKey: string): string {
  return nameKey.replace(/[^\p{L}\p{N} ]/gu, "");
}

export function runImportDryRun(input: ImportDryRunInput): ImportDryRunOutcome {
  type Person = {
    sourceName: string;
    rawInterests: string[];
    interestKeys: Set<string>;
    unmapped: string[];
    rowCount: number;
  };
  const people = new Map<string, Person>();
  const exceptions = new Map<string, { kind: ImportExceptionKind; ref: string | null; occurrences: number }>();
  const ambiguous = new Map<string, number>(); // ref -> occurrences
  const unmappedRefs = new Map<string, number>(); // ref -> occurrences
  const interestMentions = new Map<string, number>(); // canonical key -> unique-person mentions
  const rejectionCounts: Record<ImportRowRejectionCode, number> = {
    blank_name: 0,
    name_too_long: 0,
    product_too_long: 0,
    malformed_row: 0,
  };
  let rejectedRows = 0;
  let mappedMentions = 0;

  const reject = (code: ImportRowRejectionCode) => {
    rejectedRows += 1;
    rejectionCounts[code] += 1;
  };

  const addException = (kind: ImportExceptionKind, ref: string | null) => {
    const k = `${kind}:${ref ?? ""}`;
    const existing = exceptions.get(k);
    if (existing) existing.occurrences += 1;
    else exceptions.set(k, { kind, ref, occurrences: 1 });
  };

  for (const row of input.rows) {
    // The route refuses non-string payloads wholesale; this guard is the
    // defense-in-depth for any other caller. Explicit, counted, never silent.
    if (typeof row?.name !== "string" || typeof row?.product !== "string") {
      reject("malformed_row");
      continue;
    }
    const name = sanitizeImportText(row.name);
    const product = sanitizeImportText(row.product);
    if (name === "") {
      reject("blank_name");
      continue;
    }
    if (name.length > MAX_NAME_CHARS) {
      reject("name_too_long");
      continue;
    }
    if (product.length > MAX_PRODUCT_CHARS) {
      reject("product_too_long");
      continue;
    }

    const nameKey = normalizedNameKey(name);
    let person = people.get(nameKey);
    if (!person) {
      person = { sourceName: name, rawInterests: [], interestKeys: new Set(), unmapped: [], rowCount: 0 };
      people.set(nameKey, person);
    }
    person.rowCount += 1;

    if (product === "") {
      addException("empty_interest", null);
      continue;
    }
    person.rawInterests.push(product);
    if (isAmbiguousBlendString(product)) {
      const ref = productStringRef(product);
      ambiguous.set(ref, (ambiguous.get(ref) ?? 0) + 1);
      addException("ambiguous_blend", ref);
    }
    for (const interest of splitInterests(product)) {
      if (isFormulaLike(interest)) {
        // Never mapped, never echoed: classification + reference only.
        addException("formula_like_value", productStringRef(interest));
        continue;
      }
      const key = canonicalizeInterest(interest);
      if (key === null) {
        person.unmapped.push(interest);
        const ref = productStringRef(interest);
        unmappedRefs.set(ref, (unmappedRefs.get(ref) ?? 0) + 1);
        addException("unmapped_interest", ref);
      } else if (key === "not-applicable") {
        addException("not_applicable_row", null);
      } else if (!person.interestKeys.has(key)) {
        // Unique (person, key): a repeated interest never inflates demand.
        person.interestKeys.add(key);
        interestMentions.set(key, (interestMentions.get(key) ?? 0) + 1);
        mappedMentions += 1;
      }
    }
  }

  let duplicateNameRows = 0;
  for (const person of Array.from(people.values())) {
    if (person.rowCount > 1) {
      duplicateNameRows += person.rowCount - 1;
      addException("duplicate_person", null);
    }
  }

  // Ambiguity classification over the deduplicated people (name-derived, so
  // counts only — no references of any kind).
  const keys = Array.from(people.keys());
  const bySuffixless = new Map<string, number>();
  const byPunctuationless = new Map<string, number>();
  for (const key of keys) {
    const s = withoutSuffix(key);
    bySuffixless.set(s, (bySuffixless.get(s) ?? 0) + 1);
    const p = punctuationStripped(key);
    byPunctuationless.set(p, (byPunctuationless.get(p) ?? 0) + 1);
  }
  for (const count of Array.from(bySuffixless.values())) {
    // ≥2 distinct staged people collapse onto one suffix-stripped name:
    // possibly the same person split by "Jr."/"MD"-style suffixes.
    if (count > 1) addException("suffix_ambiguity", null);
  }
  for (const count of Array.from(byPunctuationless.values())) {
    if (count > 1) addException("punctuation_variant_names", null);
  }

  const staged: StagedClientRecord[] = Array.from(people.entries()).map(([nameKey, p], index) => ({
    stagingId: `${input.batchId}-p${String(index + 1).padStart(4, "0")}`,
    sourceName: p.sourceName,
    normalizedNameKey: nameKey,
    interestKeys: Array.from(p.interestKeys).sort(),
    rawInterests: p.rawInterests,
    unmappedInterests: p.unmapped,
    sourcePartner: input.sourcePartner,
    relationshipOwner: input.relationshipOwner,
    consentStatus: "pending",
    accountStatus: "not_invited",
    contactEmail: null,
    contactPhone: null,
    usState: null,
  }));

  const toRefs = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([ref, occurrences]) => ({ ref, occurrences }));

  const report: ImportDryRunReportDto = {
    batchId: input.batchId,
    sourceLabel: input.sourceLabel,
    dryRun: true,
    totalRows: input.rows.length,
    rejectedRows,
    rejectionCounts,
    processedRows: input.rows.length - rejectedRows,
    uniquePeople: staged.length,
    duplicateNameRows,
    multiInterestPeople: staged.filter((s) => s.interestKeys.length > 1).length,
    // The source file carries no contact fields; every person is missing
    // contact until enrichment happens in a later, separately approved step.
    missingContact: staged.filter((s) => s.contactEmail === null && s.contactPhone === null).length,
    mappedInterestMentions: mappedMentions,
    distinctInterestKeys: interestMentions.size,
    unmappedInterests: toRefs(unmappedRefs),
    ambiguousBlendStrings: toRefs(ambiguous),
    consentStatusCounts: { pending: staged.length, granted: 0, declined: 0 },
    accountStatusCounts: {
      not_invited: staged.length,
      invitation_approved: 0,
      invited: 0,
      active: 0,
    },
    invitationEligible: 0, // consent pending + no contact info ⇒ nobody, today.
    exceptions: Array.from(exceptions.values()) as readonly ImportMappingException[],
    interestBreakdown: Array.from(interestMentions.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([interestKey, mentions]) => ({ interestKey, mentions })),
  };

  return { report, staged };
}
