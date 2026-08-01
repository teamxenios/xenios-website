import { describe, expect, it } from "vitest";

import {
  MANIFEST_APPROVER,
  MANIFEST_FILE_PATHS_PRESENT,
  MANIFEST_IDENTITY_RULE,
  MANIFEST_ROWS,
  MANIFEST_ROW_COUNT,
  MANIFEST_STATUS,
} from "./manifest-data";
import {
  COMPETITOR_EXPANSION_CATEGORY,
  MANIFEST_COVERAGE_STATES,
  MANIFEST_RIGHTS_PATHS,
  isPlaceholderCell,
  manifestByVariant,
  manifestBySku,
  manifestImageId,
  manifestPublicStatus,
  productImageManifest,
} from "./manifest";

const manifest = productImageManifest();

describe("the manifest parses the workbook without inventing anything", () => {
  it("carries every one of the 1179 data rows", () => {
    expect(MANIFEST_ROWS.length).toBe(MANIFEST_ROW_COUNT);
    expect(manifest.length).toBe(1179);
  });

  it("derives sequential image ids that match the workbook", () => {
    expect(manifest[0].imageId).toBe("IMG-00001");
    expect(manifest[manifest.length - 1].imageId).toBe("IMG-01179");
    expect(manifestImageId(0)).toBe("IMG-00001");
    manifest.forEach((entry, index) => {
      expect(entry.imageId).toBe(manifestImageId(index));
    });
  });

  it("holds no file path and no approved status, because the workbook holds none", () => {
    expect(MANIFEST_FILE_PATHS_PRESENT).toBe(0);
    expect(MANIFEST_STATUS).toBe("Needed");
    for (const entry of manifest) {
      expect(entry.filePath).toBeNull();
      expect(entry.status).toBe("Needed");
      expect(manifestPublicStatus(entry)).toBe("NONE");
    }
  });

  it("applies the same identity rule and approver to every row", () => {
    expect(MANIFEST_IDENTITY_RULE).toBe("Exact product and variant required");
    expect(MANIFEST_APPROVER).toBe("Product + Brand + Quality");
    for (const entry of manifest) {
      expect(entry.identityRule).toBe(MANIFEST_IDENTITY_RULE);
      expect(entry.approver).toBe(MANIFEST_APPROVER);
    }
  });

  it("resolves every row into a closed rights path and coverage state", () => {
    for (const entry of manifest) {
      expect(MANIFEST_RIGHTS_PATHS).toContain(entry.rightsPath);
      expect(MANIFEST_COVERAGE_STATES).toContain(entry.coverageState);
      expect(entry.coverageState).not.toBe("APPROVED_ASSET");
    }
  });

  it("reproduces the workbook category counts exactly", () => {
    const counts = new Map<string, number>();
    for (const entry of manifest) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    expect(Object.fromEntries([...counts].sort())).toEqual({
      "AI, Tracking & Education": 24,
      "Bloodwork & Testing": 42,
      "Care & Telemedicine": 12,
      "Competitor Expansion Candidate": 73,
      "Memberships & Programs": 20,
      "Peptides & Research": 86,
      "Provider & Performance Network": 7,
      "Quantum & Regenerative": 8,
      "Shipping & Fulfillment": 7,
      Supplements: 893,
      "White Label & Partners": 7,
    });
  });

  it("reproduces the workbook priority split", () => {
    const p0 = manifest.filter((entry) => entry.priority === "P0").length;
    expect(p0).toBe(200);
    expect(manifest.length - p0).toBe(979);
  });
});

describe("derived flags", () => {
  it("marks competitor expansion candidates, which are references and not offers", () => {
    const candidates = manifest.filter((entry) => entry.isExpansionCandidate);
    expect(candidates.length).toBe(73);
    for (const entry of candidates) {
      expect(entry.category).toBe(COMPETITOR_EXPANSION_CATEGORY);
    }
  });

  it("separates a strength variant from a format variant", () => {
    const blend = manifest.find((entry) => entry.sku === "PEP-001");
    expect(blend?.variant).toBe("15 mg / 15 mg");
    expect(blend?.variantCarriesStrength).toBe(true);

    const format = manifest.find((entry) => entry.variant === "Capsules");
    expect(format?.variantCarriesStrength).toBe(false);

    for (const entry of manifest) {
      if (entry.variant === null) expect(entry.variantCarriesStrength).toBe(false);
    }
  });

  it("keeps the three placeholder SKU rows rather than collapsing them", () => {
    const withoutSku = manifest.filter((entry) => isPlaceholderCell(entry.sku));
    expect(withoutSku.length).toBe(3);
    const bucket = manifestByVariant().get("-::-");
    expect(bucket?.length).toBe(3);
  });
});

describe("indexes", () => {
  it("groups every row under its SKU", () => {
    const bySku = manifestBySku();
    const total = [...bySku.values()].reduce((sum, rows) => sum + rows.length, 0);
    expect(total).toBe(manifest.length);
    expect(bySku.get("PEP-005")?.map((entry) => entry.variant)).toEqual(["5 mg / 5 mg", "20 mg"]);
  });

  it("treats a dash and an empty cell as a placeholder, not a value", () => {
    expect(isPlaceholderCell("-")).toBe(true);
    expect(isPlaceholderCell("  ")).toBe(true);
    expect(isPlaceholderCell(null)).toBe(true);
    expect(isPlaceholderCell("TBD")).toBe(true);
    expect(isPlaceholderCell("PEP-001")).toBe(false);
  });
});
