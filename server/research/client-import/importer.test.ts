import { describe, expect, it } from "vitest";

import { runImportDryRun, type ImportSourceRow } from "./importer";

// SYNTHETIC rows only. The shape mirrors the real partner file (two columns,
// name + product string) without carrying a single real identity.
const ROWS: readonly ImportSourceRow[] = Object.freeze([
  { name: "Alex Fixture", product: "BPC-157/TB-500 (15/15mg)" },
  { name: "Alex Fixture", product: "R (20mg)" },
  { name: "alex  fixture", product: "CJC/Ipamorelin" }, // same person, messy spacing
  { name: "Blake Sample", product: "CJC/Ipamorelin & AOD" }, // ambiguous blend join
  { name: "Casey Placeholder", product: "AOD/MOTs-C/Tesamorelin/Ipamorelin" },
  { name: "Devon Example", product: "Totally Unknown Product 9000" },
  { name: "Emery Mock", product: "N/A" },
  { name: "Frankie Demo", product: "" },
]);

function run(rows: readonly ImportSourceRow[] = ROWS) {
  return runImportDryRun({
    batchId: "imp-test-0001",
    sourceLabel: "synthetic-fixture-file",
    rows,
    sourcePartner: "vitality_advisors",
    relationshipOwner: "Seth Grant",
  });
}

describe("runImportDryRun", () => {
  it("deduplicates people by normalized name and aggregates their interests", () => {
    const { report, staged } = run();
    expect(report.uniquePeople).toBe(6);
    expect(report.duplicateNameRows).toBe(2);
    const alex = staged.find((s) => s.normalizedNameKey === "alex fixture");
    expect(alex?.interestKeys).toEqual(["bpc157-tb500", "cjc-ipa", "retatrutide"]);
    expect(report.multiInterestPeople).toBe(2); // alex (3 keys) + blake (cjc-ipa + aod-9604)
  });

  it("splits '&'-joined strings AND flags them as ambiguous blends, never silently merging", () => {
    const { report, staged } = run();
    expect(report.ambiguousBlendStrings).toEqual([
      { raw: "CJC/Ipamorelin & AOD", occurrences: 1 },
    ]);
    const blake = staged.find((s) => s.normalizedNameKey === "blake sample");
    expect(blake?.interestKeys).toEqual(["aod-9604", "cjc-ipa"]);
    // the verbatim string survives for audit
    expect(blake?.rawInterests).toEqual(["CJC/Ipamorelin & AOD"]);
  });

  it("surfaces unmapped interests as exceptions without inventing a mapping", () => {
    const { report, staged } = run();
    expect(report.unmappedInterests).toEqual(["Totally Unknown Product 9000"]);
    const devon = staged.find((s) => s.normalizedNameKey === "devon example");
    expect(devon?.interestKeys).toEqual([]);
    expect(devon?.unmappedInterests).toEqual(["Totally Unknown Product 9000"]);
  });

  it("stages everyone as consent-pending, not-invited, contactless, attributed to the partner", () => {
    const { report, staged } = run();
    for (const record of staged) {
      expect(record.consentStatus).toBe("pending");
      expect(record.accountStatus).toBe("not_invited");
      expect(record.contactEmail).toBeNull();
      expect(record.sourcePartner).toBe("vitality_advisors");
      expect(record.relationshipOwner).toBe("Seth Grant");
    }
    expect(report.missingContact).toBe(report.uniquePeople);
    expect(report.invitationEligible).toBe(0);
    expect(report.consentStatusCounts).toEqual({
      pending: report.uniquePeople,
      granted: 0,
      declined: 0,
    });
  });

  it("keeps every person name OUT of the report", () => {
    const { report } = run();
    const serialized = JSON.stringify(report);
    for (const name of ["Alex", "Fixture", "Blake", "Sample", "Casey", "Devon", "Emery", "Frankie"]) {
      expect(serialized).not.toContain(name);
    }
  });

  it("is deterministic and idempotent for identical input", () => {
    const first = run();
    const second = run();
    expect(second.report).toEqual(first.report);
    expect(second.staged).toEqual(first.staged);
  });

  it("counts N/A and empty cells as exceptions, not people-with-interests", () => {
    const { report } = run();
    const kinds = report.exceptions.map((e) => e.kind);
    expect(kinds).toContain("not_applicable_row");
    expect(kinds).toContain("empty_interest");
  });
});
