// The payment-eligibility policy and identity reconciliation, checked against
// the real source and runtime artifacts. Workbook prices are historical source
// inputs to a pure policy check, never proof of Product Control approval,
// publication, availability, or permission to charge a customer.
//
// Distinct authorities are read, on purpose:
//   - docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json — the founder's
//     original 426 source rows, including both superseded rows;
//   - server/research/master-offerings/data/member-safe-master-offerings.generated.json
//     — 424 canonical identities, not 424 purchasable products;
//   - the pinned reconciliation and binding artifact — exact provenance,
//     structured holds, retained bindings, and unbound new identities.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPaymentEligibility,
  compositionResolvedFromSpecification,
  mayEnterPaymentJourney,
  type CanonicalPaymentFacts,
} from "./canonical-payment-eligibility";
import { directPurchaseRefusal } from "@shared/research/master-offerings/pathway-authority";
import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import { normalizeMasterCatalog } from "../../master-offerings/normalize-catalog";
import { readPinnedReconciliationAuthority } from "../../master-offerings/reconciliation-authority";
import { reviewedHeldVariantIds } from "../../master-offerings/reviewed-holds";

// The list the composition root will hand in, identical to the pathway
// resolver's DIRECT_PURCHASE_FAMILIES. Stated once here so every assertion
// below is evaluated against the real commercial policy.
const POLICY = { directPurchaseFamilies: ["research_peptides_materials"] } as const;

const REPO = path.resolve(__dirname, "../../../..");

type WorkbookRow = Readonly<{
  "Group ID": string;
  Family: string;
  Channel: string;
  Product: string;
  "Normalized Specification": string | null;
  "Buy Cost / Unit": unknown;
  "Suggested Sell Price": unknown;
}>;

function workbookRows(): readonly WorkbookRow[] {
  const raw = readFileSync(
    path.join(REPO, "docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json"),
    "utf8",
  );
  return JSON.parse(raw).rows as readonly WorkbookRow[];
}

type RuntimeOffering = Readonly<{
  id: string;
  family: MasterOfferingFamily;
  displayState: MasterOfferingDisplayState;
  variants: readonly Readonly<{
    id: string;
    label: string;
    displayState: MasterOfferingDisplayState;
  }>[];
}>;

type RuntimeDataset = Readonly<{
  products: readonly RuntimeOffering[];
  reconciliation: Readonly<{
    provenance: Readonly<Record<string, readonly string[]>>;
  }>;
}>;

function runtimeDataset(): RuntimeDataset {
  const raw = readFileSync(
    path.join(
      REPO,
      "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    ),
    "utf8",
  );
  return JSON.parse(raw) as RuntimeDataset;
}

const NEW_PEPTIDE_IDENTITIES = [
  ["GRP-0421", "mo_c4698a34aaaf7aec47b2", "mov_14b4034bef7ef37d9fc8"],
  ["GRP-0422", "mo_2babbadce5172426bde2", "mov_f61758881da2b7bfa539"],
  ["GRP-0423", "mo_f40119d9a74b2af15be6", "mov_cb3642e564392fa86dda"],
  ["GRP-0424", "mo_c77c4659a519b58ac795", "mov_be54afb7419ed7240752"],
  ["GRP-0425", "mo_3eec45f31e19795343f1", "mov_c26ef47dfbbe46f7e090"],
  ["GRP-0426", "mo_a535d8a2951bc7c6c0a3", "mov_3c8ca424d78153fd931a"],
] as const;

const SUPERSEDED_PEPTIDE_IDENTITIES = [
  ["GRP-0402", "mo_2aaac3a06aa0dd6b2923", "mov_7c55d415a9574e9ebda7", "GRP-0426"],
  ["GRP-0407", "mo_1dd0658eb7bf15f91900", "mov_256cb0423eb6d2a77f65", "GRP-0425"],
] as const;

const PEPTIDE_FAMILY = "Research Peptides & Materials";
const CONFIRMED_RUO_CHANNEL = "RUO Research";

/** Historical source-policy exercise only; this does not resolve live prices. */
function factsFor(row: WorkbookRow): CanonicalPaymentFacts {
  const price = row["Suggested Sell Price"];
  return {
    family:
      row.Family === PEPTIDE_FAMILY ? "research_peptides_materials" : row.Family,
    researchUseOnlyConfirmed: row.Channel === CONFIRMED_RUO_CHANNEL,
    hasApprovedRetailPrice: typeof price === "number" && price > 0,
    compositionResolved: compositionResolvedFromSpecification(
      row["Normalized Specification"],
    ),
    held: false,
    availabilityUnderReview: false,
  };
}

function baseFacts(
  overrides: Partial<CanonicalPaymentFacts> = {},
): CanonicalPaymentFacts {
  return {
    family: "research_peptides_materials",
    researchUseOnlyConfirmed: true,
    hasApprovedRetailPrice: true,
    compositionResolved: true,
    held: false,
    availabilityUnderReview: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("the gate refuses on canonical facts, in the right order", () => {
  it("admits a confirmed, priced, resolved peptide variant", () => {
    expect(mayEnterPaymentJourney(baseFacts(), POLICY)).toBe(true);
  });

  it("refuses a family that is not approved for direct purchase", () => {
    for (const family of [
      "research_capsules",
      "clinical_503a",
      "supplements",
      "topicals_regenerative",
      "research_supplies",
      "shipping_fulfillment",
    ]) {
      expect(canonicalPaymentEligibility(baseFacts({ family }), POLICY)).toMatchObject({
        eligible: false,
        code: "FAMILY_NOT_DIRECT",
      });
    }
  });

  it("refuses an unconfirmed classification even when priced", () => {
    expect(
      canonicalPaymentEligibility(
        baseFacts({ researchUseOnlyConfirmed: false }),
        POLICY,
      ),
    ).toMatchObject({ eligible: false, code: "CLASSIFICATION_NOT_CONFIRMED" });
  });

  it("refuses an unresolved composition even when priced and confirmed RUO", () => {
    expect(
      canonicalPaymentEligibility(baseFacts({ compositionResolved: false }), POLICY),
    ).toMatchObject({ eligible: false, code: "COMPOSITION_UNRESOLVED" });
  });

  it("refuses a missing price rather than treating it as zero", () => {
    expect(
      canonicalPaymentEligibility(baseFacts({ hasApprovedRetailPrice: false }), POLICY),
    ).toMatchObject({ eligible: false, code: "NO_APPROVED_PRICE" });
  });

  it("refuses a held unit and a unit under availability review", () => {
    expect(canonicalPaymentEligibility(baseFacts({ held: true }), POLICY)).toMatchObject(
      { eligible: false, code: "UNIT_HELD" },
    );
    expect(
      canonicalPaymentEligibility(baseFacts({ availabilityUnderReview: true }), POLICY),
    ).toMatchObject({ eligible: false, code: "AVAILABILITY_UNDER_REVIEW" });
  });

  it("consults the disqualifying facts BEFORE price, so a price cannot promote a row", () => {
    // Every one of these is priced. None becomes eligible because of it.
    const priced = { hasApprovedRetailPrice: true } as const;
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, family: "clinical_503a" }),
        POLICY,
      ),
    ).toMatchObject({ code: "FAMILY_NOT_DIRECT" });
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, researchUseOnlyConfirmed: false }),
        POLICY,
      ),
    ).toMatchObject({ code: "CLASSIFICATION_NOT_CONFIRMED" });
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, compositionResolved: false }),
        POLICY,
      ),
    ).toMatchObject({ code: "COMPOSITION_UNRESOLVED" });
  });
});

describe("composition reading", () => {
  it("treats a stated split-pending combination as unresolved", () => {
    expect(
      compositionResolvedFromSpecification(
        "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
      ),
    ).toBe(false);
  });

  it("does not hold an ordinary single-molecule vial", () => {
    expect(compositionResolvedFromSpecification("BPC-157 5 mg")).toBe(true);
    expect(compositionResolvedFromSpecification("RETATRUTIDE 60 mg")).toBe(true);
  });

  it("treats an absent specification as resolved, not as a combination", () => {
    expect(compositionResolvedFromSpecification(null)).toBe(true);
    expect(compositionResolvedFromSpecification("")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The founder's numbers, computed from the real workbook.
// ---------------------------------------------------------------------------

describe("the founder's peptide targets, computed not restated", () => {
  const rows = workbookRows();
  const peptides = rows.filter((row) => row.Family === PEPTIDE_FAMILY);

  it("finds 141 peptide rows, 112 confirmed RUO, 29 classification pending", () => {
    expect(peptides).toHaveLength(141);
    expect(
      peptides.filter((row) => row.Channel === CONFIRMED_RUO_CHANNEL),
    ).toHaveLength(112);
    expect(
      peptides.filter((row) => row.Channel !== CONFIRMED_RUO_CHANNEL),
    ).toHaveLength(29);
  });

  it("finds exactly 111 source-policy candidates without asserting live payment eligibility", () => {
    const admitted = peptides.filter((row) =>
      mayEnterPaymentJourney(factsFor(row), POLICY),
    );
    expect(admitted).toHaveLength(111);
  });

  it("refuses exactly one confirmed-RUO peptide, and it is the CJC combination", () => {
    const refusedRuo = peptides
      .filter((row) => row.Channel === CONFIRMED_RUO_CHANNEL)
      .filter((row) => !mayEnterPaymentJourney(factsFor(row), POLICY));
    expect(refusedRuo).toHaveLength(1);
    expect(refusedRuo[0]["Group ID"]).toBe("GRP-0422");
    expect(refusedRuo[0]["Normalized Specification"]).toContain("split pending");
    expect(
      canonicalPaymentEligibility(factsFor(refusedRuo[0]), POLICY),
    ).toMatchObject({
      code: "COMPOSITION_UNRESOLVED",
    });
  });

  it("admits nothing outside the peptide family, from all 426 rows", () => {
    const admittedNonPeptide = rows
      .filter((row) => row.Family !== PEPTIDE_FAMILY)
      .filter((row) => mayEnterPaymentJourney(factsFor(row), POLICY));
    expect(admittedNonPeptide).toHaveLength(0);
  });

  it("keeps Research Capsules and 503A out even though they are priced", () => {
    for (const family of ["Research Capsules", "503A Clinical Formulations"]) {
      const inFamily = rows.filter((row) => row.Family === family);
      expect(inFamily.length).toBeGreaterThan(0);
      // Some of them ARE priced — that is exactly why the family rule matters.
      expect(
        inFamily.filter(
          (row) => typeof row["Suggested Sell Price"] === "number",
        ).length,
      ).toBeGreaterThan(0);
      expect(
        inFamily.filter((row) => mayEnterPaymentJourney(factsFor(row), POLICY)),
      ).toHaveLength(0);
    }
  });

  it("admits no row that carries no retail price", () => {
    const unpriced = peptides.filter(
      (row) => typeof row["Suggested Sell Price"] !== "number",
    );
    for (const row of unpriced) {
      expect(mayEnterPaymentJourney(factsFor(row), POLICY)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Exact canonical identity reconciliation, separate from purchase authority.
// ---------------------------------------------------------------------------

describe("the runtime dataset reconciles to 139 canonical peptide identities", () => {
  const peptides = workbookRows().filter((row) => row.Family === PEPTIDE_FAMILY);
  const dataset = runtimeDataset();
  const runtime = dataset.products.filter(
    (offering) => offering.family === "research_peptides_materials",
  );
  const identityKey = (offeringId: string, variantId: string) => `${offeringId}|${variantId}`;
  const runtimeIdentities = runtime.flatMap((offering) =>
    offering.variants.map((variant) => identityKey(offering.id, variant.id)),
  );
  const sourceIdentityByGroup = new Map(peptides.map((row, index) => {
    // Hash the untouched source row, before display-only wording cleanup.
    const offering = normalizeMasterCatalog([{ ...row, sheetRow: index + 2 }]).products[0];
    return [row["Group ID"], identityKey(offering.id, offering.variants[0].id)];
  }));
  const reconciliation = readPinnedReconciliationAuthority(REPO).reconciliation;
  const heldIds = reviewedHeldVariantIds(REPO);
  const bindings = JSON.parse(readFileSync(path.join(
    REPO, "server/research/master-offerings/data/master-offering-bindings.generated.json",
  ), "utf8")) as {
    bindings: Array<{ offeringId: string; offeringVariantId: string }>;
    unbound: Array<{
      offeringId: string; offeringVariantId: string; sourceGroupId: string; reasonCode: string;
    }>;
    supersededBindings: Array<{
      sourceGroupId: string; supersededBySourceGroupId: string; disposition: string;
      sourceRows: string[]; successorOfferingId: string; successorOfferingVariantId: string;
      binding: { offeringId: string; offeringVariantId: string };
    }>;
  };

  it("contains all 139 unique canonical peptide identities from 141 preserved source rows", () => {
    expect(dataset.products).toHaveLength(424);
    expect(peptides).toHaveLength(141);
    expect(runtime).toHaveLength(139);
    expect(runtimeIdentities).toHaveLength(139);
    expect(new Set(runtime.map((offering) => offering.id)).size).toBe(139);
    expect(new Set(runtime.flatMap((offering) => offering.variants.map((variant) => variant.id))).size).toBe(139);
    const supersededGroups = new Set<string>(SUPERSEDED_PEPTIDE_IDENTITIES.map(([group]) => group));
    const canonicalGroups = peptides.map((row) => row["Group ID"]).filter((group) => !supersededGroups.has(group));
    expect([...runtimeIdentities].sort()).toEqual(
      canonicalGroups.map((group) => sourceIdentityByGroup.get(group)).sort(),
    );
    const representedSourceRows = canonicalGroups.flatMap((group) => dataset.reconciliation.provenance[group]);
    expect(representedSourceRows).toHaveLength(141);
    expect(new Set(representedSourceRows).size).toBe(141);
    expect([...representedSourceRows].sort()).toEqual(peptides.map((row) => row["Group ID"]).sort());
  });

  it("includes all six new raw identities without borrowing a Product Control binding or price", () => {
    const newGroups = new Set<string>(NEW_PEPTIDE_IDENTITIES.map(([group]) => group));
    expect(bindings.unbound.filter((entry) => newGroups.has(entry.sourceGroupId))
      .map((entry) => [entry.sourceGroupId, entry.offeringId, entry.offeringVariantId, entry.reasonCode]).sort())
      .toEqual(NEW_PEPTIDE_IDENTITIES.map((identity) => [...identity, "binding_pending"]).sort());
    for (const [group, offeringId, variantId] of NEW_PEPTIDE_IDENTITIES) {
      const identity = identityKey(offeringId, variantId);
      expect(sourceIdentityByGroup.get(group)).toBe(identity);
      expect(runtimeIdentities.filter((key) => key === identity)).toHaveLength(1);
      expect(bindings.bindings.some((binding) =>
        binding.offeringId === offeringId || binding.offeringVariantId === variantId,
      )).toBe(false);
    }
  });

  it("archives two superseded identities and preserves their provenance without transferring authority", () => {
    expect(bindings.supersededBindings.map((entry) => entry.sourceGroupId).sort())
      .toEqual(["GRP-0402", "GRP-0407"]);
    for (const [group, offeringId, variantId, successorGroup] of SUPERSEDED_PEPTIDE_IDENTITIES) {
      expect(sourceIdentityByGroup.get(group)).toBe(identityKey(offeringId, variantId));
      expect(runtimeIdentities).not.toContain(identityKey(offeringId, variantId));
      expect(bindings.bindings.some((binding) =>
        binding.offeringId === offeringId || binding.offeringVariantId === variantId,
      )).toBe(false);
      const successor = NEW_PEPTIDE_IDENTITIES.find(([source]) => source === successorGroup)!;
      expect(reconciliation.merges.find((merge) => merge.keeps === successorGroup)?.supersedes).toEqual([group]);
      expect(dataset.reconciliation.provenance[successorGroup]).toEqual([successorGroup, group]);
      expect(bindings.supersededBindings.find((entry) => entry.sourceGroupId === group)).toMatchObject({
        disposition: "archived_not_transferred",
        supersededBySourceGroupId: successorGroup,
        binding: { offeringId, offeringVariantId: variantId },
        successorOfferingId: successor[1], successorOfferingVariantId: successor[2],
        sourceRows: [successorGroup, group],
      });
    }
  });

  it("keeps 111 policy candidates separate from one formulation hold, 27 pending rows and actual publication", () => {
    const refusals = runtime.flatMap((offering) => offering.variants.map((variant) =>
      directPurchaseRefusal({
        family: offering.family, displayState: offering.displayState,
        variantDisplayState: variant.displayState, offeringVariantId: variant.id,
        specification: variant.label, reviewedHoldVariantIds: heldIds,
      }),
    ));
    expect(refusals.filter((reason) => reason === null)).toHaveLength(111);
    expect(refusals.filter((reason) => reason === "formulation_hold")).toHaveLength(1);
    expect(refusals.filter((reason) => reason === "classification_pending")).toHaveLength(27);
    expect(refusals).toHaveLength(139);
    // No price or commerce resolver is mocked into approving these rows.
    // A pathway candidate is not a published purchase, and six remain unbound.
    expect(runtime.filter((offering) => offering.displayState === "request_access")).toHaveLength(112);
    expect(runtime.filter((offering) => offering.displayState === "approval_required")).toHaveLength(27);
    expect(runtime.flatMap((offering) => offering.variants)
      .filter((variant) => variant.displayState === "available_now")).toHaveLength(0);
  });

  it("keeps the present CJC identity held after its display marker is removed", () => {
    const cjc = peptides.find((row) => row["Group ID"] === "GRP-0422");
    expect(cjc).toBeDefined();
    const offering = runtime.find((entry) => entry.id === "mo_2babbadce5172426bde2")!;
    expect(offering).toBeDefined();
    expect(offering.variants).toHaveLength(1);
    const variant = offering.variants[0];
    expect(variant.id).toBe("mov_f61758881da2b7bfa539");
    expect(variant.label).toBe("CJC-1295 WITH DAC + IPAMORELIN 5 mg total");
    expect(cjc!["Normalized Specification"]).toContain("split pending");
    expect(reconciliation.commerceHolds.find((hold) => hold.sourceRow === "GRP-0422")?.catalogIdentity)
      .toEqual({ offeringId: offering.id, offeringVariantId: variant.id });
    expect(heldIds.has(variant.id)).toBe(true);
    for (const specification of [variant.label, "Renamed reviewed formulation"]) {
      expect(directPurchaseRefusal({
        family: offering.family, displayState: offering.displayState,
        variantDisplayState: variant.displayState, offeringVariantId: variant.id,
        specification, reviewedHoldVariantIds: heldIds,
      })).toBe("formulation_hold");
    }
    expect(cjc!.Channel).toBe(CONFIRMED_RUO_CHANNEL);
    expect(typeof cjc!["Suggested Sell Price"]).toBe("number");
    expect(mayEnterPaymentJourney(factsFor(cjc!), POLICY)).toBe(false);
    expect(compositionResolvedFromSpecification(variant.label)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the gate cannot leak internal pricing", () => {
  it("takes no amount and no cost, only a boolean about price", () => {
    const facts = baseFacts();
    const keys = Object.keys(facts);
    expect(keys).toEqual([
      "family",
      "researchUseOnlyConfirmed",
      "hasApprovedRetailPrice",
      "compositionResolved",
      "held",
      "availabilityUnderReview",
    ]);
    // No amount, cost, margin, markup or supplier field can be passed in, so
    // none can be echoed back in a refusal.
    for (const forbidden of [
      "cost",
      "buyCost",
      "wholesale",
      "margin",
      "markup",
      "supplier",
      "priceCents",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("refusal reasons carry no money and no internal pricing vocabulary", () => {
    // Not "no digits" — a family key like `clinical_503a` legitimately carries
    // one, and asserting on digits would pass for the wrong reason. What must
    // never appear is an AMOUNT or an internal pricing word.
    const refusals = [
      canonicalPaymentEligibility(baseFacts({ family: "clinical_503a" }), POLICY),
      canonicalPaymentEligibility(
        baseFacts({ hasApprovedRetailPrice: false }),
        POLICY,
      ),
      canonicalPaymentEligibility(
        baseFacts({ compositionResolved: false }),
        POLICY,
      ),
      canonicalPaymentEligibility(baseFacts({ held: true }), POLICY),
    ];
    for (const refusal of refusals) {
      expect(refusal.eligible).toBe(false);
      if (refusal.eligible) continue;
      // No currency amount in any shape: $12, 12.00, 1,200, 1200 cents.
      expect(refusal.reason).not.toMatch(
        /[$£€]\s*\d|\d+[.,]\d{2}\b|\b\d+\s*(?:cents?|usd)\b/i,
      );
      for (const forbidden of [
        "cost",
        "wholesale",
        "margin",
        "markup",
        "multiplier",
        "benchmark",
        "supplier",
      ]) {
        expect(refusal.reason.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});
