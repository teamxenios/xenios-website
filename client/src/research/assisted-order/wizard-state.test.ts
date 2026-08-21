import { describe, expect, it } from "vitest";
import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import {
  acceptedAgreements,
  addOrUpdateSelection,
  agreementRequirementKey,
  clampQuantity,
  money,
  parseAssistedOrderConfig,
  removeSelection,
  requiredAcknowledgmentEntries,
  selectableInResearchRequest,
  selectionEstimateCents,
  selectionsIncludeResearchUseOnly,
  selectionsToLines,
  submissionBlocked,
} from "./wizard-state";

const item: AssistedOrderCatalogItem = {
  productId: "p1",
  variantId: "v1",
  productName: "Product",
  family: "Family",
  channel: "RUO",
  specification: "10 mg",
  format: "Vial",
  packBasis: "Per vial",
  minimumQuantity: 1,
  maximumQuantity: 100,
  quantityIncrement: 1,
  unitPriceCents: 2500,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add",
  accessNotice: null,
  researchUseOnly: true,
  catalogVersion: "c1",
  priceVersion: "p1",
};

const configBody = {
  enabled: true,
  code: null,
  formId: "assisted_order_form_v1",
  requiredAgreements: [
    { kind: "research_use_policy", version: "2026-05" },
    { kind: "terms_of_service", version: "2026-02" },
  ],
  formAcknowledgments: [
    {
      id: "accuracy",
      scope: "always",
      kind: "assisted_order_form_v1:accuracy",
      version: "aeb2ba5a069dd3f4",
      copy: "I confirm that the information I provided is accurate to the best of my knowledge.",
    },
    {
      id: "research_use_only",
      scope: "research_use_only",
      kind: "assisted_order_form_v1:research_use_only",
      version: "d5150651ebd86b89",
      copy: "For items identified as Research Use Only, I understand that they are offered solely for legitimate nonclinical research purposes and are not for human or veterinary use.",
    },
  ],
};

describe("assisted order wizard state", () => {
  it("adds, updates and removes selections", () => {
    let state = addOrUpdateSelection(new Map(), item, 2);
    expect(selectionEstimateCents(state)).toBe(5000);
    state = addOrUpdateSelection(state, item, 3);
    expect(selectionEstimateCents(state)).toBe(7500);
    state = removeSelection(state, item);
    expect(state.size).toBe(0);
  });

  it("pins catalog and price versions in submission lines", () => {
    const state = addOrUpdateSelection(new Map(), item, 2);
    expect(selectionsToLines(state)[0]).toMatchObject({
      expectedCatalogVersion: "c1",
      expectedPriceVersion: "p1",
      expectedUnitPriceCents: 2500,
    });
  });

  it("sends only advisory fields in lines: the client carries no authoritative price slot", () => {
    const state = addOrUpdateSelection(new Map(), item, 2, "note");
    const line = selectionsToLines(state)[0];
    expect(Object.keys(line).sort()).toEqual([
      "customerNotes",
      "expectedCatalogVersion",
      "expectedPriceVersion",
      "expectedUnitPriceCents",
      "productId",
      "quantity",
      "variantId",
    ]);
  });

  it("renders null price as pending", () => {
    expect(money(null)).toBe("Price on request");
  });

  it("never turns an all-unpriced request into a zero estimate", () => {
    const unpriced = { ...item, unitPriceCents: null, priceVersion: null };
    const state = addOrUpdateSelection(new Map(), unpriced, 3);
    expect(selectionEstimateCents(state)).toBeNull();
    expect(money(selectionEstimateCents(state))).toBe("Price on request");
  });
});

describe("quantity clamping", () => {
  const moq = { minimumQuantity: 10, maximumQuantity: 100, quantityIncrement: 10 };

  it("snaps free-typed numbers to the allowed grid", () => {
    expect(clampQuantity(moq, 10)).toBe(10);
    expect(clampQuantity(moq, 14)).toBe(10);
    expect(clampQuantity(moq, 16)).toBe(20);
    expect(clampQuantity(moq, 0)).toBe(10);
    expect(clampQuantity(moq, -5)).toBe(10);
  });

  it("caps at the maximum without looping", () => {
    expect(clampQuantity(moq, 1_000_000_000)).toBe(100);
    expect(clampQuantity({ ...moq, maximumQuantity: 95 }, 1_000_000_000)).toBe(90);
  });

  it("treats non-finite input as the minimum", () => {
    expect(clampQuantity(moq, Number.NaN)).toBe(10);
    expect(clampQuantity(moq, Number.POSITIVE_INFINITY)).toBe(10);
  });
});

describe("research request eligibility", () => {
  it("keeps Care / provider-pathway products out of the research request", () => {
    expect(selectableInResearchRequest({ workflowMode: "provider_request" })).toBe(false);
  });

  it("keeps requestable modes selectable, including price-pending and held", () => {
    for (const workflowMode of [
      "direct_order_request",
      "request_pricing",
      "request_activation",
      "availability_review",
    ] as const) {
      expect(selectableInResearchRequest({ workflowMode })).toBe(true);
    }
  });

  it("detects Research Use Only lines in the basket", () => {
    const ruoState = addOrUpdateSelection(new Map(), item, 1);
    expect(selectionsIncludeResearchUseOnly(ruoState)).toBe(true);
    const plain = { ...item, researchUseOnly: false };
    expect(
      selectionsIncludeResearchUseOnly(addOrUpdateSelection(new Map(), plain, 1)),
    ).toBe(false);
  });
});

describe("acknowledgment configuration", () => {
  it("parses the full config: legal pairs and form facts", () => {
    const config = parseAssistedOrderConfig(configBody);
    expect(config).not.toBeNull();
    expect(config!.legal).toHaveLength(2);
    expect(config!.form).toHaveLength(2);
    expect(config!.form[0]).toMatchObject({
      kind: "assisted_order_form_v1:accuracy",
      version: "aeb2ba5a069dd3f4",
    });
  });

  it("fails closed when either set is missing or unusable", () => {
    expect(parseAssistedOrderConfig(null)).toBeNull();
    expect(parseAssistedOrderConfig({})).toBeNull();
    expect(
      parseAssistedOrderConfig({ ...configBody, formAcknowledgments: [] }),
    ).toBeNull();
    expect(
      parseAssistedOrderConfig({ ...configBody, requiredAgreements: [] }),
    ).toBeNull();
    expect(
      parseAssistedOrderConfig({
        ...configBody,
        formAcknowledgments: [{ id: "accuracy", scope: "always", kind: "", version: "x", copy: "y" }],
      }),
    ).toBeNull();
    expect(
      parseAssistedOrderConfig({
        ...configBody,
        formAcknowledgments: [
          { id: "accuracy", scope: "sometimes", kind: "k", version: "x", copy: "y" },
        ],
      }),
    ).toBeNull();
  });

  it("requires the RUO confirmation exactly when the basket carries an RUO line", () => {
    const config = parseAssistedOrderConfig(configBody)!;
    const withRuo = requiredAcknowledgmentEntries(config, true);
    const withoutRuo = requiredAcknowledgmentEntries(config, false);
    expect(withRuo.map((entry) => entry.kind)).toContain(
      "assisted_order_form_v1:research_use_only",
    );
    expect(withoutRuo.map((entry) => entry.kind)).not.toContain(
      "assisted_order_form_v1:research_use_only",
    );
    // Legal pairs and always-scoped facts appear in both.
    for (const entries of [withRuo, withoutRuo]) {
      expect(entries.map((entry) => entry.kind)).toEqual(
        expect.arrayContaining([
          "research_use_policy",
          "terms_of_service",
          "assisted_order_form_v1:accuracy",
        ]),
      );
    }
  });

  it("uses the server's own copy verbatim as the form fact label", () => {
    const config = parseAssistedOrderConfig(configBody)!;
    const entries = requiredAcknowledgmentEntries(config, true);
    const accuracy = entries.find(
      (entry) => entry.kind === "assisted_order_form_v1:accuracy",
    );
    expect(accuracy!.label).toBe(configBody.formAcknowledgments[0].copy);
  });

  it("blocks submission until every required entry is acknowledged", () => {
    const config = parseAssistedOrderConfig(configBody)!;
    const entries = requiredAcknowledgmentEntries(config, true);
    expect(submissionBlocked(null, new Set())).toBe(true);
    expect(submissionBlocked(entries, new Set())).toBe(true);
    const allButOne = new Set(
      entries.slice(0, -1).map((entry) => agreementRequirementKey(entry)),
    );
    expect(submissionBlocked(entries, allButOne)).toBe(true);
    const all = new Set(entries.map((entry) => agreementRequirementKey(entry)));
    expect(submissionBlocked(entries, all)).toBe(false);
  });

  it("stamps the exact server-supplied pairs at acceptance", () => {
    const config = parseAssistedOrderConfig(configBody)!;
    const entries = requiredAcknowledgmentEntries(config, true);
    const accepted = acceptedAgreements(entries, "2026-08-19T00:00:00.000Z");
    expect(accepted).toHaveLength(entries.length);
    expect(accepted.map((agreement) => `${agreement.kind}@${agreement.version}`)).toEqual(
      entries.map((entry) => `${entry.kind}@${entry.version}`),
    );
    for (const agreement of accepted) {
      expect(agreement.acceptedAt).toBe("2026-08-19T00:00:00.000Z");
    }
  });
});
