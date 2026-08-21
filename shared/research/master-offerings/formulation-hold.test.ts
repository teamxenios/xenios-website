import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { declaredFormulationHold, isFormulationHeld } from "./formulation-hold";

// The exact declared specification of workbook row GRP-0422, copied from
// docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json rather than
// retyped, so the test cannot drift from the source.
const CJC_DAC_SPEC = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";

describe("declared formulation hold", () => {
  it("holds the row whose component split the source says is pending", () => {
    const hold = declaredFormulationHold(CJC_DAC_SPEC);
    expect(hold).not.toBeNull();
    expect(hold?.declaredIn).toBe(CJC_DAC_SPEC);
  });

  it("does not hold a molecule whose name merely contains a plus sign", () => {
    // The measured false positive. A composition PARSE holds these; a
    // composition DECLARATION does not, which is the whole design.
    expect(isFormulationHeld("NAD+ 1000 mg")).toBe(false);
    expect(isFormulationHeld("NAD+ 500 mg")).toBe(false);
  });

  it("does not hold a combination whose amounts are stated in another format", () => {
    expect(isFormulationHeld("SEMAGLUTIDE+BPC-157 5 mg/650 mcgmg/mcg")).toBe(false);
  });

  it("does not hold a combination that states every component amount", () => {
    for (const spec of [
      "CJC-1295 (No DAC) 10 mg + IPAMORELIN 10 mg",
      "BPC-157 10 mg + TB-500 10 mg + GHK-Cu 50 mg",
      "Thymosin Alpha-1 5 mg + KPV 5 mg + LL-37 5 mg",
    ]) {
      expect(isFormulationHeld(spec)).toBe(false);
    }
  });

  it("treats an absent or blank specification as no declaration, not as a hold", () => {
    // Silence is a data gap with a different owner. Reading it as a considered
    // decision would let a missing row masquerade as a deliberate block.
    expect(isFormulationHeld(null)).toBe(false);
    expect(isFormulationHeld(undefined)).toBe(false);
    expect(isFormulationHeld("   ")).toBe(false);
  });

  it("does not hold on supplier, price or documentation clarification", () => {
    // GRP-0309 Kisspeptin 5 mg is "Price / clarification required" and priced.
    // Its composition is fully stated, so it ships. Holding it would take the
    // founder's 111 direct down to 110 for a reason that is not about the vial.
    expect(isFormulationHeld("KISSPEPTIN 5 mg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The workbook. This is the proof of the founder's 111 + 1 target, taken
// against the committed source summary rather than against anything retyped.
// ---------------------------------------------------------------------------

interface WorkbookRow {
  "Group ID": string;
  Family: string;
  Channel: string;
  "Normalized Specification": string;
  "Suggested Sell Price": number | null;
}

function workbookRows(): WorkbookRow[] {
  const file = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "docs",
    "research-launch",
    "MASTER_CATALOG_2026-08-16_SUMMARY.json",
  );
  return (JSON.parse(readFileSync(file, "utf8")) as { rows: WorkbookRow[] }).rows;
}

const peptideRows = () => workbookRows().filter((r) => r.Family === "Research Peptides & Materials");
const ruoRows = () => peptideRows().filter((r) => r.Channel === "RUO Research");

describe("the workbook peptide book", () => {
  it("carries the founder's 141 / 112 / 29 split", () => {
    expect(peptideRows()).toHaveLength(141);
    expect(ruoRows()).toHaveLength(112);
    expect(peptideRows().filter((r) => r.Channel !== "RUO Research")).toHaveLength(29);
  });

  it("holds exactly one RUO peptide row, leaving the founder's 111 direct", () => {
    const held = ruoRows().filter((r) => isFormulationHeld(r["Normalized Specification"]));

    expect(held.map((r) => r["Group ID"])).toEqual(["GRP-0422"]);
    expect(ruoRows().length - held.length).toBe(111);
  });

  it("prices every RUO peptide row, so none of the 111 can render as zero", () => {
    for (const row of ruoRows()) {
      const price = row["Suggested Sell Price"];
      expect(typeof price === "number" && price > 0).toBe(true);
    }
  });
});
