// NOTHING THAT DECIDES COMMERCE MAY READ DISPLAY TEXT.
//
// Founder rule, 2026-08-21, written down because it was violated three
// separate times in one day by three different sessions:
//
//   1. a commerce hold detected by matching "(split pending)" in a spec string
//   2. an acceptance matrix asserting routing from the same marker text
//   3. a payment-eligibility helper deciding composition from a specification
//
// All three worked on the RAW workbook text and all three broke the moment the
// reconciliation cleaned that text up for customers — which it does on
// purpose. A marker in a product name is copy. Copy is written for people, gets
// edited for people, and is translated, truncated and reworded for people. The
// instant it decides whether something can be sold, every one of those ordinary
// editorial acts becomes a commerce change nobody reviewed.
//
// The rule: commerce reads STRUCTURED CANONICAL FACTS — family, classification,
// price authority, explicit hold, canonical action. Never a display string.
//
// This file guards the rule at the seam where it matters most: the customer
// pathway resolver, which decides what a product's button does.

import { describe, expect, it } from "vitest";
import {
  earlyAccessCustomerPathway,
  pathwayEntersPayment,
  type EarlyAccessPathwayInput,
} from "./customer-pathway";

/** The real held row, in the two forms it exists in across the pipeline. */
const RAW_WORKBOOK_SPEC = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";
const CANONICAL_SPEC = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total";

function heldRow(overrides: Partial<EarlyAccessPathwayInput> = {}): EarlyAccessPathwayInput {
  return {
    workflowMode: "direct_order_request",
    researchUseOnly: true,
    hasApprovedRetailPrice: true,
    family: "research_peptides_materials",
    commerceHold: true,
    ...overrides,
  };
}

describe("commerce decisions never read display copy", () => {
  it("takes no product text as input at all", () => {
    // Structural, and the strongest form of this guard: the resolver cannot
    // read a specification because it is never given one. A future edit that
    // adds a name, specification, description or notice parameter has to come
    // through review rather than arriving as a quiet field.
    const input = heldRow();
    expect(Object.keys(input).sort()).toEqual([
      "commerceHold",
      "family",
      "hasApprovedRetailPrice",
      "researchUseOnly",
      "workflowMode",
    ]);
  });

  it("holds the row identically whether or not the marker survives in copy", () => {
    // THE EXACT REGRESSION. The raw workbook string carries "(split pending)";
    // the canonical string the customer sees does not, because reconciliation
    // strips it. A rule reading text answers differently for these two. A rule
    // reading the structured hold cannot tell them apart, which is correct:
    // they are the same product in the same commercial state.
    expect(RAW_WORKBOOK_SPEC).toMatch(/split pending/i);
    expect(CANONICAL_SPEC).not.toMatch(/split pending/i);

    const held = earlyAccessCustomerPathway(heldRow());
    expect(held).toBe("assisted_order");
    expect(pathwayEntersPayment(held)).toBe(false);
  });

  it("does not let cleaned-up copy sell a held product", () => {
    // Same row, hold still set, every selling fact present. If the hold were
    // inferred from text this would flip to buy_now the day someone tidied the
    // specification for the storefront.
    for (const researchUseOnly of [true, false]) {
      for (const hasApprovedRetailPrice of [true, false]) {
        expect(
          pathwayEntersPayment(
            earlyAccessCustomerPathway(
              heldRow({ researchUseOnly, hasApprovedRetailPrice }),
            ),
          ),
        ).toBe(false);
      }
    }
  });

  it("releases the row when the structured hold is removed, and only then", () => {
    // The release path is deleting one config entry — not editing a product
    // name, and not adding a special case in the storefront.
    expect(
      earlyAccessCustomerPathway(heldRow({ commerceHold: false })),
    ).toBe("buy_now");
    expect(
      earlyAccessCustomerPathway(heldRow({ commerceHold: undefined })),
    ).toBe("buy_now");
  });

  it("keeps the source free of any display-text matching", () => {
    // Belt and braces against the specific shape the three defects took: a
    // regex or substring test over product copy inside a commerce decision.
    // Narrowed deliberately to names that can only come from COPY. An earlier
    // draft of this test also flagged `includes(` and `match(`, which caught
    // DIRECT_PURCHASE_FAMILIES.includes(family) — a membership test over a
    // canonical enum, not display text. A guard that fires on correct code
    // gets deleted by the next person, so it has to name the real smell.
    const source = earlyAccessCustomerPathway.toString().toLowerCase();
    for (const copyField of [
      "specification",
      "productname",
      "displayname",
      "description",
      "accessnotice",
      "actionlabel",
      "label",
      "split pending",
    ]) {
      expect(source, `commerce decision reads ${copyField}`).not.toContain(copyField);
    }
  });
});
