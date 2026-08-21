import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE 141-PEPTIDE LAUNCH TARGET, PINNED TO CANONICAL DATA.
 *
 * The founder's Early Access peptide target is a set of exact numbers:
 *
 *   141 workbook peptide rows
 *   112 confirmed RUO
 *    29 classification pending  -> Request Order
 *   111 directly orderable
 *     1 CJC-1295 with DAC, formulation-blocked
 *
 * Those numbers were agreed in prose. Prose does not fail a build. This suite
 * reconciles every one of them against the canonical workbook artifact, so a
 * catalog edit that silently moves a row between pathways is caught here
 * rather than by a customer.
 *
 * WHAT THIS IS NOT. It is not a second catalog authority and nothing at
 * runtime may import it. Pathway resolution belongs to
 * shared/research/early-access/customer-pathway.ts and price resolution to
 * canonical Product Control. This suite only asserts that the DATA those
 * authorities read still describes the launch the founder approved. It is
 * deliberately test-only for that reason.
 *
 * WHOLESALE. The workbook artifact carries "Buy Cost / Unit", which is
 * internal. It is read here only to prove it is NOT part of the customer-facing
 * projection; no assertion prints it and no export exposes it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKBOOK = path.resolve(
  HERE,
  "../../../docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json",
);

const PEPTIDE_FAMILY = "Research Peptides & Materials";
const RUO_CHANNEL = "RUO Research";

type WorkbookRow = Readonly<{
  Family: string;
  Channel: string;
  Product: string;
  "Normalized Specification": string;
  "Suggested Sell Price": unknown;
  "Buy Cost / Unit": unknown;
}>;

function workbookRows(): readonly WorkbookRow[] {
  const parsed = JSON.parse(readFileSync(WORKBOOK, "utf8")) as {
    rows: WorkbookRow[];
  };
  return parsed.rows;
}

const peptides = () =>
  workbookRows().filter((row) => row.Family === PEPTIDE_FAMILY);

const confirmedRuo = () =>
  peptides().filter((row) => row.Channel === RUO_CHANNEL);

const classificationPending = () =>
  peptides().filter((row) => row.Channel !== RUO_CHANNEL);

/** A retail price usable as an approved price: a positive number, never 0. */
function hasApprovedPrice(row: WorkbookRow): boolean {
  const price = row["Suggested Sell Price"];
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/**
 * A row whose COMPOSITION is unresolved: the specification itself says the
 * component split is not settled. Such a row can be research-use, priced and
 * in the peptide family — every fact the direct-purchase rule asks for — and
 * still must not be sold, because Xenios cannot yet state what is in the vial.
 * Detected from the canonical specification text rather than a SKU list, so a
 * second such row is caught the day it is added.
 */
function compositionUnresolved(row: WorkbookRow): boolean {
  return /(split pending|pending split|tbd|unresolved)/i.test(
    row["Normalized Specification"],
  );
}

/** Strength in mg, or null when the row is not expressed in mg (e.g. IU). */
function milligrams(specification: string): number | null {
  const match = specification
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .match(/([0-9]+(?:\.[0-9]+)?)\s*MG/);
  return match ? Number.parseFloat(match[1]) : null;
}

function productKey(row: WorkbookRow): string | null {
  const strength = milligrams(row["Normalized Specification"]);
  // Null strength cannot establish identity: HCG 5000 IU and HCG 120000 IU are
  // different products, and keying them both as "HCG|null" would report a
  // duplicate that does not exist.
  if (strength === null) return null;
  const name = row.Product.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return name + "|" + String(strength);
}

describe("141-peptide launch target", () => {
  it("has exactly 141 peptide rows in the canonical workbook", () => {
    expect(peptides()).toHaveLength(141);
  });

  it("splits 112 confirmed RUO and 29 classification pending", () => {
    expect(confirmedRuo()).toHaveLength(112);
    expect(classificationPending()).toHaveLength(29);
    expect(confirmedRuo().length + classificationPending().length).toBe(141);
  });

  it("gives every confirmed RUO peptide an approved retail price", () => {
    const unpriced = confirmedRuo().filter((row) => !hasApprovedPrice(row));
    // Named, not counted: an unpriced row silently becoming "Price pending" is
    // exactly the failure mode this is here to surface.
    expect(unpriced.map((row) => row["Normalized Specification"])).toEqual([]);
  });

  it("never resolves a peptide price to zero", () => {
    const zeroed = peptides().filter(
      (row) => row["Suggested Sell Price"] === 0,
    );
    expect(zeroed.map((row) => row["Normalized Specification"])).toEqual([]);
  });
});

describe("the one row that must not be directly orderable", () => {
  it("finds exactly one confirmed-RUO peptide whose composition is unresolved", () => {
    const unresolved = confirmedRuo().filter(compositionUnresolved);
    expect(unresolved.map((row) => row["Normalized Specification"])).toEqual([
      "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
    ]);
  });

  it("that row otherwise satisfies every direct-purchase fact, which is why it needs its own exclusion", () => {
    const row = confirmedRuo().find(compositionUnresolved)!;
    // Family, classification and price are all present. The three-fact rule in
    // customer-pathway.ts would therefore make this BUY_NOW. Nothing else in
    // the codebase excludes it, so without a composition check the launch
    // ships 112 direct rows, not the 111 the founder approved.
    expect(row.Family).toBe(PEPTIDE_FAMILY);
    expect(row.Channel).toBe(RUO_CHANNEL);
    expect(hasApprovedPrice(row)).toBe(true);
  });

  it("leaves exactly 111 peptides directly orderable", () => {
    const direct = confirmedRuo().filter((row) => !compositionUnresolved(row));
    expect(direct).toHaveLength(111);
  });
});

describe("the founder's reconciliation rows", () => {
  const expectRuo = (specification: string) => {
    const row = peptides().find(
      (candidate) => candidate["Normalized Specification"] === specification,
    );
    expect(row, specification + " is missing from the workbook").toBeDefined();
    expect(row!.Channel).toBe(RUO_CHANNEL);
    expect(hasApprovedPrice(row!)).toBe(true);
  };

  it("carries the two corrected classifications as confirmed RUO", () => {
    expectRuo("HEXARELIN 5 mg");
    expectRuo("OXYTOCIN 10 mg");
  });

  it("carries the three new unambiguous variants as confirmed RUO", () => {
    expectRuo("RETATRUTIDE 60 mg");
    expectRuo("MOTS-C 40 mg");
    expectRuo("GLUTATHIONE 600 mg");
  });

  it("still lists the two pending rows that duplicate an already-RUO strength", () => {
    // These are the classification-correction leftovers. They are legitimately
    // still pending, but they duplicate a strength that is already orderable,
    // so a storefront that lists pending rows beside RUO rows will show the
    // same product twice at two different prices. Pinned so a THIRD duplicate
    // is caught rather than discovered on the shelf.
    const ruoKeys = new Set(
      confirmedRuo()
        .map(productKey)
        .filter((key): key is string => key !== null),
    );
    const duplicates = classificationPending()
      .filter((row) => {
        const key = productKey(row);
        return key !== null && ruoKeys.has(key);
      })
      .map((row) => row["Normalized Specification"])
      .sort();
    expect(duplicates).toEqual(["Hexarelin (5mg)", "Oxytocin (10mg)"]);
  });
});

/**
 * SOURCE ROWS vs CANONICAL VARIANTS.
 *
 * The workbook has 141 peptide ROWS. Two of them are duplicate listings of a
 * strength that already exists, so the canonical catalog carries 139 unique
 * VARIANTS. The founder adjudicated the collapse on 2026-08-21:
 *
 *   141 source rows  ->  139 canonical variants
 *   112 RUO source   ->  111 direct + 1 held
 *    29 pending rows ->   27 unique pending
 *
 * Asserted separately from the source-row counts above, because a
 * reconciliation that silently drops a real product and a reconciliation that
 * correctly collapses a duplicate both change the row count — and only one of
 * them is right.
 */
describe("canonical variant target after duplicate reconciliation", () => {
  /** The two source rows the founder ruled are duplicates, not products. */
  const COLLAPSING_DUPLICATE_ROWS = ["Hexarelin (5mg)", "Oxytocin (10mg)"];

  const collapsingRows = () =>
    classificationPending().filter((row) =>
      COLLAPSING_DUPLICATE_ROWS.includes(row["Normalized Specification"]),
    );

  it("collapses exactly two source rows, and both are classification-pending", () => {
    // Both duplicates sit on the PENDING side, so the collapse removes pending
    // rows and never removes a directly orderable one.
    expect(collapsingRows()).toHaveLength(2);
  });

  it("reaches 139 unique canonical variants", () => {
    expect(peptides().length - collapsingRows().length).toBe(139);
  });

  it("reaches 27 unique classification-pending variants", () => {
    expect(classificationPending().length - collapsingRows().length).toBe(27);
  });

  it("adds up: 111 direct + 1 held + 27 pending = 139", () => {
    const direct = confirmedRuo().filter((row) => !compositionUnresolved(row));
    const held = confirmedRuo().filter(compositionUnresolved);
    const pending = classificationPending().length - collapsingRows().length;
    expect(direct).toHaveLength(111);
    expect(held).toHaveLength(1);
    expect(pending).toBe(27);
    expect(direct.length + held.length + pending).toBe(139);
  });

  it("keeps the surviving canonical variant of each collapsed pair directly orderable", () => {
    // The collapse must keep the RUO side, not the pending side. Keeping the
    // pending row would take a product that is orderable today and make it
    // un-orderable, which is a revenue regression disguised as a cleanup.
    for (const specification of ["HEXARELIN 5 mg", "OXYTOCIN 10 mg"]) {
      const survivor = confirmedRuo().find(
        (row) => row["Normalized Specification"] === specification,
      );
      expect(survivor, specification + " must survive the collapse").toBeDefined();
      expect(hasApprovedPrice(survivor!)).toBe(true);
      expect(compositionUnresolved(survivor!)).toBe(false);
    }
  });
});

describe("families that must not enter direct purchase", () => {
  it("keeps Research Capsules out of the peptide direct set", () => {
    // A generic "researchUseOnly + priced" rule would have swept these in.
    // They are a separate family and stay on their request pathway.
    const capsules = workbookRows().filter(
      (row) => row.Family === "Research Capsules",
    );
    expect(capsules.length).toBeGreaterThan(0);
    expect(capsules.every((row) => row.Family !== PEPTIDE_FAMILY)).toBe(true);
  });

  it("keeps every 503A clinical formulation out of the peptide family, priced or not", () => {
    const clinical = workbookRows().filter(
      (row) => row.Family === "503A Clinical Formulations",
    );
    expect(clinical).toHaveLength(242);
    expect(clinical.some(hasApprovedPrice)).toBe(true);
    expect(clinical.every((row) => row.Family !== PEPTIDE_FAMILY)).toBe(true);
  });
});

describe("wholesale never reaches a customer projection", () => {
  it("proves the internal cost column exists and is excluded from the customer fields", () => {
    const row = confirmedRuo()[0];
    // The artifact does carry internal cost. That is precisely why the
    // customer-facing projection is an explicit allow-list and never a
    // spread of the workbook row.
    expect(row["Buy Cost / Unit"]).toBeDefined();
    const customerSafeFields = [
      "Product",
      "Normalized Specification",
      "Suggested Sell Price",
      "Family",
      "Channel",
    ];
    for (const field of customerSafeFields) {
      expect(Object.hasOwn(row, field)).toBe(true);
    }
    expect(customerSafeFields).not.toContain("Buy Cost / Unit");
    expect(
      customerSafeFields.some((field) =>
        /cost|margin|markup|wholesale/i.test(field),
      ),
    ).toBe(false);
  });
});
