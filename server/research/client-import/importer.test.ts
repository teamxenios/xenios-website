import { describe, expect, it } from "vitest";

import {
  MAX_NAME_CHARS,
  MAX_PRODUCT_CHARS,
  isFormulaLike,
  productStringRef,
  runImportDryRun,
  sanitizeImportText,
  type ImportSourceRow,
} from "./importer";

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

describe("runImportDryRun — aggregation", () => {
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
      { ref: productStringRef("CJC/Ipamorelin & AOD"), occurrences: 1 },
    ]);
    const blake = staged.find((s) => s.normalizedNameKey === "blake sample");
    expect(blake?.interestKeys).toEqual(["aod-9604", "cjc-ipa"]);
    // the verbatim string survives for audit IN THE STAGING RECORD only
    expect(blake?.rawInterests).toEqual(["CJC/Ipamorelin & AOD"]);
  });

  it("surfaces unmapped interests as references without inventing a mapping", () => {
    const { report, staged } = run();
    expect(report.unmappedInterests).toEqual([
      { ref: productStringRef("Totally Unknown Product 9000"), occurrences: 1 },
    ]);
    const devon = staged.find((s) => s.normalizedNameKey === "devon example");
    expect(devon?.interestKeys).toEqual([]);
    expect(devon?.unmappedInterests).toEqual(["Totally Unknown Product 9000"]);
  });

  it("a repeated product interest on one person never inflates demand", () => {
    const { report } = run([
      { name: "Alex Fixture", product: "DSIP" },
      { name: "Alex Fixture", product: "DSIP" },
      { name: "alex fixture", product: "dsip" },
    ]);
    expect(report.mappedInterestMentions).toBe(1);
    expect(report.interestBreakdown).toEqual([{ interestKey: "dsip", mentions: 1 }]);
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

  it("is deterministic and idempotent for identical input (repeated batch)", () => {
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

describe("runImportDryRun — rejection accounting (never silent)", () => {
  it("rejects whitespace-only names explicitly and counts them", () => {
    const { report } = run([
      { name: "   ", product: "DSIP" },
      { name: "\t​‮", product: "DSIP" }, // zero-width + bidi override only
      { name: "Alex Fixture", product: "DSIP" },
    ]);
    expect(report.rejectedRows).toBe(2);
    expect(report.rejectionCounts.blank_name).toBe(2);
    expect(report.processedRows).toBe(1);
    expect(report.totalRows).toBe(3);
    expect(report.uniquePeople).toBe(1);
  });

  it("rejects a 10k-character name and a 10k-character product, each counted", () => {
    const { report } = run([
      { name: "N".repeat(10_000), product: "DSIP" },
      { name: "Alex Fixture", product: "P".repeat(10_000) },
      { name: "Alex Fixture", product: "DSIP" },
    ]);
    expect(report.rejectionCounts.name_too_long).toBe(1);
    expect(report.rejectionCounts.product_too_long).toBe(1);
    expect(report.rejectedRows).toBe(2);
    expect(report.processedRows).toBe(1);
  });

  it("bounds are exact: at the limit passes, one over rejects", () => {
    const okName = "N".repeat(MAX_NAME_CHARS);
    const overName = "N".repeat(MAX_NAME_CHARS + 1);
    const okProduct = "P".repeat(MAX_PRODUCT_CHARS);
    const { report } = run([
      { name: okName, product: okProduct },
      { name: overName, product: "DSIP" },
    ]);
    expect(report.rejectionCounts.name_too_long).toBe(1);
    expect(report.uniquePeople).toBe(1);
  });

  it("rejects malformed rows defensively when reached without route validation", () => {
    const { report } = run([
      { name: 42, product: "DSIP" } as unknown as ImportSourceRow,
      { name: "Alex Fixture", product: null } as unknown as ImportSourceRow,
      { name: "Alex Fixture", product: "DSIP" },
    ]);
    expect(report.rejectionCounts.malformed_row).toBe(2);
    expect(report.processedRows).toBe(1);
  });
});

describe("runImportDryRun — Unicode and ambiguity classification", () => {
  it("Unicode-equivalent names (NFC vs NFD) collapse to ONE person", () => {
    const { report, staged } = run([
      { name: "Renée Fixture", product: "DSIP" }, // é precomposed
      { name: "Renée Fixture", product: "KPV" }, // e + combining acute
    ]);
    expect(report.uniquePeople).toBe(1);
    expect(staged[0]?.interestKeys).toEqual(["dsip", "kpv"]);
  });

  it("classifies punctuation-variant names instead of silently merging or splitting", () => {
    const { report } = run([
      { name: "O'Brien Fixture", product: "DSIP" },
      { name: "OBrien Fixture", product: "KPV" },
    ]);
    // Two staged people (no silent merge), one classified ambiguity.
    expect(report.uniquePeople).toBe(2);
    expect(report.exceptions.some((e) => e.kind === "punctuation_variant_names")).toBe(true);
  });

  it("classifies suffix ambiguity (Jr) instead of deciding it is one person", () => {
    const { report } = run([
      { name: "Jordan Fixture", product: "DSIP" },
      { name: "Jordan Fixture Jr", product: "KPV" },
    ]);
    expect(report.uniquePeople).toBe(2);
    expect(report.exceptions.some((e) => e.kind === "suffix_ambiguity")).toBe(true);
  });

  it("formula-shaped product cells are classified, never mapped, never echoed", () => {
    const evil = "=HYPERLINK(\"https://attacker.invalid\")";
    const { report } = run([{ name: "Alex Fixture", product: evil }]);
    const formula = report.exceptions.find((e) => e.kind === "formula_like_value");
    expect(formula).toBeDefined();
    expect(formula?.ref).toBe(productStringRef(evil));
    expect(report.mappedInterestMentions).toBe(0);
    expect(JSON.stringify(report)).not.toContain("HYPERLINK");
    expect(JSON.stringify(report)).not.toContain("attacker");
  });
});

describe("runImportDryRun — the report boundary", () => {
  it("keeps every person name OUT of the report", () => {
    const { report } = run();
    const serialized = JSON.stringify(report);
    for (const name of ["Alex", "Fixture", "Blake", "Sample", "Casey", "Devon", "Emery", "Frankie"]) {
      expect(serialized).not.toContain(name);
    }
  });

  it("keeps every RAW PRODUCT STRING out of the report — references only", () => {
    const { report } = run();
    const serialized = JSON.stringify(report);
    // Raw product text must not appear anywhere, mapped or unmapped.
    for (const raw of [
      "BPC-157/TB-500 (15/15mg)",
      "CJC/Ipamorelin & AOD",
      "Totally Unknown Product 9000",
      "AOD/MOTs-C/Tesamorelin/Ipamorelin",
    ]) {
      expect(serialized).not.toContain(raw);
    }
    // References are 12-hex, recomputable by an operator holding the file.
    for (const entry of [...report.unmappedInterests, ...report.ambiguousBlendStrings]) {
      expect(entry.ref).toMatch(/^[0-9a-f]{12}$/);
    }
    for (const e of report.exceptions) {
      expect(e.ref === null || /^[0-9a-f]{12}$/.test(e.ref)).toBe(true);
    }
  });
});

describe("sanitizers", () => {
  it("sanitizeImportText strips control and bidi characters and collapses whitespace", () => {
    expect(sanitizeImportText("  A‮ B \t C  ")).toBe("AB C");
  });

  it("isFormulaLike flags the CSV-injection alphabet but not negative-number-looking strings", () => {
    expect(isFormulaLike("=SUM(A1)")).toBe(true);
    expect(isFormulaLike("@cmd")).toBe(true);
    expect(isFormulaLike("+alias")).toBe(true);
    expect(isFormulaLike("-5mg dose note")).toBe(false);
  });
});
