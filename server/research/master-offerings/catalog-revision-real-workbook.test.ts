/**
 * The five-mutation proof against the real workbook.
 *
 * catalog-revision-diff.test.ts proves the classification on a hermetic five-row
 * catalog. This file proves it again on the real 1,236-row master workbook, so
 * the result is not an artefact of a tidy fixture. It also verifies, by running
 * the code rather than by asserting it, the two identity facts the whole design
 * rests on:
 *
 *   1. An offering id is exactly "mo_" + sha256(canonicalKey)[0:20], and a
 *      variant id is exactly "mov_" + sha256(canonicalKey + "|" + normalized
 *      label)[0:20]. So a rename issues a new id, silently.
 *   2. The generated member-safe dataset cannot be used to repair that. The
 *      canonical key is on the reader's banned-key list, the file never carries
 *      it, and the reader hardcodes it to the empty string on load.
 *
 * The private intake lives under .local and is gitignored, so this file skips
 * itself when the intake is absent. Reproduce it with:
 *   python scripts/research/export-master-offerings.py <workbook.xlsx>
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogRevisionFromNormalized } from "./catalog-revision";
import { buildCatalogRevisionDiff, idContinuityMap } from "./catalog-revision-diff";
import {
  loadMasterOfferingDataset,
  MASTER_OFFERINGS_DATASET_BANNED_KEYS,
} from "./dataset-reader";
import { normalizeMasterOfferings, normalizeOfferingText } from "./normalize";
import type { RawEarlyAccessRow, RawMasterOfferingRow } from "./model";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const INTAKE = path.join(
  REPO_ROOT,
  ".local/research/master-offerings/private-intake.json",
);
const DATASET = path.join(
  REPO_ROOT,
  ".local/research/master-offerings/generated/member-safe-master-offerings.generated.json",
);

const hasIntake = fs.existsSync(INTAKE);
const describeWithIntake = hasIntake ? describe : describe.skip;

interface Intake {
  sourceWorkbook: { sha256: string };
  masterRows: RawMasterOfferingRow[];
  earlyAccessRows: RawEarlyAccessRow[];
}

function readIntake(): Intake {
  return JSON.parse(fs.readFileSync(INTAKE, "utf8")) as Intake;
}

function revision(label: string, intake: Intake) {
  return catalogRevisionFromNormalized({
    label,
    sourceWorkbookSha256: intake.sourceWorkbook.sha256,
    catalog: normalizeMasterOfferings(intake.masterRows, intake.earlyAccessRows),
  });
}

/**
 * The five edits an operator makes to a master workbook.
 *
 * The rename touches every row of the SS-31 canonical group, rows 21 and 22 in
 * "Peptides & Research" and row 163 in "Competitor Expansion Candidate", because
 * those three rows are one offering. Renaming only some of them is a split, not
 * a rename, and that case is proved separately below.
 */
function mutate(intake: Intake): Intake {
  const masterRows = intake.masterRows
    // 4. a product leaves
    .filter((row) => row.productName !== "Adamax Research Material")
    .map((row) => {
      // 1. a product is renamed, keeping its workbook source IDs
      if (row.productName === "SS-31 Research Material") {
        return { ...row, productName: "SS-31 Elamipretide Research Material" };
      }
      if (row.productName === "SS-31") {
        return { ...row, productName: "SS-31 Elamipretide" };
      }
      // 2. a variant label is edited
      if (
        row.productName === "Epithalon Research Material" &&
        row.variantOrFormat === "100 mg"
      ) {
        return { ...row, variantOrFormat: "100 mg vial" };
      }
      return row;
    });
  // 3. a product arrives
  masterRows.push({
    ...masterRows[0],
    sheetRow: 9999,
    category: "Peptides & Research",
    brandOrSubcategory: "Research",
    sourceSku: "PEP-980",
    productName: "Larazotide Research Material",
    variantOrFormat: "10 mg",
    sourceAccessState: "Request access",
  });
  // 5. an availability changes
  const earlyAccessRows = intake.earlyAccessRows.map((row) =>
    row.productName === "Oxytocin" && row.variantOrFormat === "5 mg"
      ? { ...row, status: "Held" as const }
      : row,
  );
  return { ...intake, masterRows, earlyAccessRows };
}

describeWithIntake("the identity facts this design rests on", () => {
  const intake = hasIntake ? readIntake() : null;

  it("derives every offering and variant id from the canonical key alone", () => {
    const catalog = normalizeMasterOfferings(
      intake!.masterRows,
      intake!.earlyAccessRows,
    );
    expect(catalog.products.length).toBeGreaterThan(1000);
    for (const product of catalog.products) {
      expect(product.id).toBe(
        `mo_${crypto.createHash("sha256").update(product.canonicalKey).digest("hex").slice(0, 20)}`,
      );
      for (const variant of product.variants) {
        expect(variant.id).toBe(
          `mov_${crypto
            .createHash("sha256")
            .update(`${product.canonicalKey}|${normalizeOfferingText(variant.label)}`)
            .digest("hex")
            .slice(0, 20)}`,
        );
      }
    }
  });

  it("cannot recover the canonical key from the deployed dataset", () => {
    expect(MASTER_OFFERINGS_DATASET_BANNED_KEYS).toContain("canonicalKey");
    if (!fs.existsSync(DATASET)) return;
    const raw = fs.readFileSync(DATASET, "utf8");
    expect(raw).not.toContain("canonicalKey");
    const loaded = loadMasterOfferingDataset(JSON.parse(raw));
    expect(loaded.products.every((product) => product.canonicalKey === "")).toBe(
      true,
    );
  });
});

describeWithIntake("five mutations of the real master workbook", () => {
  const intake = hasIntake ? readIntake() : null;
  const current = hasIntake ? revision("current", intake!) : null;
  const candidate = hasIntake ? revision("candidate", mutate(intake!)) : null;
  const diff =
    hasIntake && current && candidate
      ? buildCatalogRevisionDiff(current, candidate, {
          generatedAt: "2026-08-13T00:00:00.000Z",
        })
      : null;

  it("reproduces the known catalog shape before any mutation", () => {
    expect(diff!.current.sourceRowCount).toBe(1236);
    expect(diff!.current.offerings).toBe(1121);
    expect(diff!.current.variants).toBe(1181);
    expect(diff!.current.holds).toBe(11);
  });

  it("1. renames SS-31 and carries its offering id", () => {
    const rename = diff!.renamed.find(
      (entry) => entry.previousName === "SS-31",
    );
    expect(rename).toBeDefined();
    expect(rename!.nextName).toBe("SS-31 Elamipretide");
    expect(rename!.confidence).toBe("certain");
    expect(rename!.previousId).not.toBe(rename!.nextId);
    expect(rename!.evidence.map((entry) => entry.kind)).toContain(
      "source_sku_set_identical",
    );
    expect(diff!.retired.map((entry) => entry.displayName)).not.toContain("SS-31");
    expect(diff!.added.map((entry) => entry.displayName)).not.toContain(
      "SS-31 Elamipretide",
    );
  });

  it("1b. carries every SS-31 variant id, which the rename also moved", () => {
    const rename = diff!.renamed.find((entry) => entry.previousName === "SS-31");
    const carried = diff!.idContinuity.filter(
      (entry) => entry.kind === "variant" && entry.offeringId === rename!.nextId,
    );
    expect(carried.map((entry) => entry.name).sort()).toEqual([
      "SS-31 Elamipretide / 10 mg",
      "SS-31 Elamipretide / 10 mg / 50 mg",
      "SS-31 Elamipretide / 50 mg",
    ]);
    expect(carried.every((entry) => entry.idChanged)).toBe(true);
    expect(carried.every((entry) => entry.confidence === "certain")).toBe(true);
  });

  it("2. reads the edited Epithalon label as the same variant", () => {
    const edited = diff!.idContinuity.find(
      (entry) => entry.name === "Epithalon / 100 mg vial",
    );
    expect(edited).toBeDefined();
    expect(edited!.idChanged).toBe(true);
    expect(edited!.confidence).toBe("certain");
    expect(edited!.evidence.map((entry) => entry.kind)).toEqual([
      "sole_residual_variant",
      "compatible_quantity",
    ]);
    expect(
      diff!.variantChanges.find((change) => change.offeringName === "Epithalon"),
    ).toBeUndefined();
  });

  it("3. reports Larazotide as added", () => {
    expect(diff!.added.map((entry) => entry.displayName)).toEqual([
      "Larazotide",
    ]);
    expect(diff!.added[0].sourceSkus).toEqual(["PEP-980"]);
  });

  it("4. reports Adamax as retired, with the ids that stop resolving", () => {
    expect(diff!.retired.map((entry) => entry.displayName)).toEqual(["Adamax"]);
    expect(diff!.retired[0].sourceSkus).toEqual(["PEX-011"]);
    expect(diff!.retired[0].variantIds).toHaveLength(1);
  });

  it("5. reports the Oxytocin availability change at both levels", () => {
    expect(diff!.displayStateTransitions).toEqual([
      {
        kind: "offering",
        offeringId: expect.any(String),
        name: "Oxytocin",
        previous: "available_now",
        next: "temporarily_unavailable",
      },
      {
        kind: "variant",
        offeringId: expect.any(String),
        name: "Oxytocin / 5 mg",
        previous: "available_now",
        next: "temporarily_unavailable",
      },
    ]);
  });

  it("changes nothing else in a 1,121-offering catalog", () => {
    expect(diff!.summary).toMatchObject({
      offeringsAdded: 1,
      offeringsRetired: 1,
      offeringIdsPreserved: 1,
      variantIdsPreserved: 4,
      variantsGained: 0,
      variantsLost: 0,
      displayStateTransitions: 2,
      canonicalKeyReassignments: 0,
    });
    expect(diff!.summary.offeringsUnchanged).toBe(1119);
    // Only certain continuity is ever applied.
    const applied = idContinuityMap(diff!);
    expect(Object.keys(applied)).toHaveLength(5);
    for (const item of diff!.review) {
      expect(item.confidence).not.toBe("certain");
    }
  });
});

/**
 * The case the real workbook taught us.
 *
 * "SS-31 Research Material" on rows 21 and 22 and "SS-31" on row 163 are one
 * offering, because the canonical key normalizes all three to the same name.
 * Renaming only the first two is not a rename. It is a split: the old offering
 * survives on the remaining row and a second offering appears beside it. A
 * matcher that trusted the name, or that let a partial source-ID overlap stand
 * in for identity, would have called this a rename and quietly moved an id.
 */
describeWithIntake("a partial rename inside one canonical group", () => {
  const intake = hasIntake ? readIntake() : null;
  const partial = hasIntake
    ? {
        ...intake!,
        masterRows: intake!.masterRows.map((row) =>
          row.productName === "SS-31 Research Material"
            ? { ...row, productName: "SS-31 Elamipretide Research Material" }
            : row,
        ),
      }
    : null;
  const diff =
    hasIntake && partial
      ? buildCatalogRevisionDiff(
          revision("current", intake!),
          revision("candidate", partial),
          { generatedAt: "2026-08-13T00:00:00.000Z" },
        )
      : null;

  it("is reported as a split, never as a rename", () => {
    expect(diff!.renamed).toEqual([]);
    expect(diff!.added.map((entry) => entry.displayName)).toEqual([
      "SS-31 Elamipretide",
    ]);
    // The original offering survives on its remaining source row and loses the
    // two variants that moved.
    const change = diff!.variantChanges.find(
      (entry) => entry.offeringName === "SS-31",
    );
    expect(change?.lost.map((variant) => variant.label).sort()).toEqual([
      "10 mg",
      "50 mg",
    ]);
    expect(change?.gained).toEqual([]);
  });

  it("still shows a human the connection, as a proposal", () => {
    const proposal = diff!.review.find(
      (item) =>
        item.previousName === "SS-31" && item.nextName === "SS-31 Elamipretide",
    );
    expect(proposal).toBeDefined();
    expect(proposal!.confidence).not.toBe("certain");
    expect(proposal!.evidence.map((entry) => entry.kind)).toContain(
      "source_sku_overlap",
    );
    expect(idContinuityMap(diff!)).not.toHaveProperty(proposal!.previousId);
  });
});
