// The admin-only client-list DRY-RUN importer.
//
// This module is structurally incapable of the actions the import flow must
// not take on its own: it sends nothing, creates no auth user, marks no
// consent, and activates nothing. Its entire output is (a) staged records in
// an injected staging store and (b) an aggregate report with zero identity.
//
// The flow it implements, and where it STOPS:
//
//   parse → normalize → dedupe → aggregate interests per person → attribute
//   (source partner + relationship owner) → consent_status = pending,
//   account_status = not_invited → staging store → REPORT.  ⛔ Everything
//   after (invitation waves, account creation) requires founder-approved
//   execution that lives elsewhere and does not exist in this lane.

import type {
  ImportDryRunReportDto,
  ImportMappingException,
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

export function runImportDryRun(input: ImportDryRunInput): ImportDryRunOutcome {
  type Person = {
    sourceName: string;
    rawInterests: string[];
    interestKeys: Set<string>;
    unmapped: string[];
    rowCount: number;
  };
  const people = new Map<string, Person>();
  const exceptions = new Map<string, ImportMappingException>();
  const ambiguous = new Map<string, number>();
  const interestMentions = new Map<string, number>();
  let mappedMentions = 0;

  const addException = (kind: ImportMappingException["kind"], detail: string) => {
    const k = `${kind}:${detail}`;
    const existing = exceptions.get(k);
    if (existing) {
      exceptions.set(k, { ...existing, occurrences: existing.occurrences + 1 });
    } else {
      exceptions.set(k, { kind, detail, occurrences: 1 });
    }
  };

  for (const row of input.rows) {
    const nameKey = normalizedNameKey(row.name);
    if (nameKey === "") continue;
    let person = people.get(nameKey);
    if (!person) {
      person = {
        sourceName: row.name.trim(),
        rawInterests: [],
        interestKeys: new Set(),
        unmapped: [],
        rowCount: 0,
      };
      people.set(nameKey, person);
    }
    person.rowCount += 1;

    const raw = row.product.trim();
    if (raw === "") {
      addException("empty_interest", "(empty product cell)");
      continue;
    }
    person.rawInterests.push(raw);
    if (isAmbiguousBlendString(raw)) {
      ambiguous.set(raw, (ambiguous.get(raw) ?? 0) + 1);
      addException("ambiguous_blend", raw);
    }
    for (const interest of splitInterests(raw)) {
      const key = canonicalizeInterest(interest);
      if (key === null) {
        person.unmapped.push(interest);
        addException("unmapped_interest", interest);
      } else if (key === "not-applicable") {
        addException("not_applicable_row", interest);
      } else {
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
      addException("duplicate_person", `(${person.rowCount} rows aggregated onto one person)`);
    }
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

  const unmappedInterests = Array.from(new Set(
    Array.from(exceptions.values())
      .filter((e) => e.kind === "unmapped_interest")
      .map((e) => e.detail),
  )).sort();

  const report: ImportDryRunReportDto = {
    batchId: input.batchId,
    sourceLabel: input.sourceLabel,
    dryRun: true,
    totalRows: input.rows.length,
    uniquePeople: staged.length,
    duplicateNameRows,
    multiInterestPeople: staged.filter((s) => s.interestKeys.length > 1).length,
    // The source file carries no contact fields; every person is missing
    // contact until enrichment happens in a later, separately approved step.
    missingContact: staged.filter((s) => s.contactEmail === null && s.contactPhone === null).length,
    mappedInterestMentions: mappedMentions,
    distinctInterestKeys: interestMentions.size,
    unmappedInterests,
    ambiguousBlendStrings: Array.from(ambiguous.entries()).map(([raw, occurrences]) => ({ raw, occurrences })),
    consentStatusCounts: { pending: staged.length, granted: 0, declined: 0 },
    accountStatusCounts: {
      not_invited: staged.length,
      invitation_approved: 0,
      invited: 0,
      active: 0,
    },
    invitationEligible: 0, // consent pending + no contact info ⇒ nobody, today.
    exceptions: Array.from(exceptions.values()),
    interestBreakdown: Array.from(interestMentions.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([interestKey, mentions]) => ({ interestKey, mentions })),
  };

  return { report, staged };
}
