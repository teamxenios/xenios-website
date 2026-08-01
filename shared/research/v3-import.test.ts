import { describe, expect, it } from "vitest";

import {
  V3_BLOCKING_REASONS,
  V3_PRICE_UNAVAILABLE_MESSAGE,
  V3_PURCHASABLE_READINESS_STATES,
  V3_READINESS_STATES,
  isPurchasableReadinessState,
  isV3ApprovedCustomerPrice,
  noApprovedPrices,
  projectV3CustomerOffer,
  resolveV3Readiness,
  type V3ApprovedCustomerPrice,
  type V3ReadinessInput,
  type V3ReadinessState,
  type V3SourceRecord,
} from "./v3-import";

/** Everything cleared. Individual tests reintroduce exactly one blocker. */
const CLEARED: V3ReadinessInput = {
  archived: false,
  accessIntent: "planning",
  strengthDisputed: false,
  variantIdentity: "exact",
  costState: "known",
  hasApprovedPrice: true,
  documentation: { coaState: "attached", lotState: "attached" },
  imageState: "approved",
  audience: "public",
};

const RECORD: V3SourceRecord = {
  recordId: "v3:PEP-007:10 MG",
  sourceSheet: "21 Full Offer Index",
  sourceRowNumber: 42,
  category: "Peptides & Research",
  rail: "Growth Hormone & Secretagogues",
  offerId: "PEP-007",
  productName: "Tesamorelin Research Material",
  variantLabel: "10 mg",
  variantLabelOrigin: "offer_index",
  variantIdentity: "exact",
  variantSku: "R360-TESAMORELIN-10MG-VIAL",
  audience: "qualified_research",
  accessIntent: "approval_required",
  accessStatusText: "Approval required",
  cost: {
    state: "known",
    wholesaleAmountCents: 4200,
    statusText: "Known - confirm current quote",
    supplierName: "Mitch / existing core supplier",
  },
  planningPrice: { proposedAmountCents: 29000, basisText: "planning value" },
  documentation: { coaState: "attached", lotState: "attached" },
  imageState: "approved",
  strengthDisputed: false,
  effectiveDate: null,
};

const APPROVED: V3ApprovedCustomerPrice = {
  amountCents: 29000,
  currency: "USD",
  approvedBy: "Samuel Boadu",
  approvedAt: "2026-08-01T00:00:00Z",
  effectiveDate: "2026-08-01",
};

describe("the readiness vocabulary", () => {
  it("is exactly the thirteen states of the operating superprompt", () => {
    expect(Array.from(V3_READINESS_STATES)).toEqual([
      "active_public",
      "member_only",
      "qualified_research",
      "request_access",
      "care_only",
      "clinical_provider_pathway",
      "pending_supplier",
      "pending_price",
      "pending_documentation",
      "pending_image",
      "held",
      "unavailable",
      "archived",
    ]);
  });

  it("has no duplicates and no invented state", () => {
    expect(new Set(V3_READINESS_STATES).size).toBe(V3_READINESS_STATES.length);
    for (const state of V3_PURCHASABLE_READINESS_STATES) {
      expect(V3_READINESS_STATES).toContain(state);
    }
  });

  it("only ever resolves to a state in the vocabulary", () => {
    // Drive the machine across the cross product of its inputs and pin that
    // nothing outside the closed list can come out. Violations are collected
    // and asserted once: twenty thousand assertions is slow enough to time out
    // under a parallel suite, and a collected list also names every offender
    // rather than stopping at the first.
    const states = new Set<V3ReadinessState>();
    const badStates = new Set<string>();
    const badReasons = new Set<string>();
    const allStates = new Set<string>(V3_READINESS_STATES);
    const allReasons = new Set<string>(V3_BLOCKING_REASONS);

    for (const archived of [false, true]) {
      for (const accessIntent of [
        "planning",
        "approval_required",
        "access_request_required",
        "care_only",
        "clinical_provider_pathway",
        "under_review",
        "held",
        "unavailable",
        "unrecognized",
      ] as const) {
        for (const strengthDisputed of [false, true]) {
          for (const variantIdentity of ["exact", "unstated", "contested"] as const) {
            for (const costState of ["known", "pending"] as const) {
              for (const hasApprovedPrice of [false, true]) {
                for (const coaState of ["attached", "missing"] as const) {
                  for (const imageState of ["approved", "pending"] as const) {
                    for (const audience of [
                      "public",
                      "member",
                      "qualified_research",
                      "care",
                      "clinical_provider",
                      "partner",
                    ] as const) {
                      const decision = resolveV3Readiness({
                        archived,
                        accessIntent,
                        strengthDisputed,
                        variantIdentity,
                        costState,
                        hasApprovedPrice,
                        documentation: { coaState, lotState: coaState },
                        imageState,
                        audience,
                      });
                      if (!allStates.has(decision.state)) badStates.add(decision.state);
                      for (const reason of decision.blockingReasons) {
                        if (!allReasons.has(reason)) badReasons.add(reason);
                      }
                      states.add(decision.state);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(Array.from(badStates)).toEqual([]);
    expect(Array.from(badReasons)).toEqual([]);
    // Every state is reachable, so none of the thirteen is dead vocabulary.
    expect(Array.from(states).sort()).toEqual(
      Array.from(V3_READINESS_STATES).sort(),
    );
  });
});

describe("the readiness state machine fails closed", () => {
  it("clears to the audience surface when nothing blocks", () => {
    expect(resolveV3Readiness(CLEARED).state).toBe("active_public");
    expect(resolveV3Readiness({ ...CLEARED, audience: "member" }).state).toBe(
      "member_only",
    );
    expect(
      resolveV3Readiness({ ...CLEARED, audience: "qualified_research" }).state,
    ).toBe("qualified_research");
    expect(resolveV3Readiness({ ...CLEARED, audience: "care" }).state).toBe(
      "care_only",
    );
    expect(
      resolveV3Readiness({ ...CLEARED, audience: "clinical_provider" }).state,
    ).toBe("clinical_provider_pathway");
    // A partner offer is reached by contract, never as a public catalog card.
    expect(resolveV3Readiness({ ...CLEARED, audience: "partner" }).state).toBe(
      "request_access",
    );
  });

  it("holds a contested variant strength ahead of every pathway", () => {
    for (const accessIntent of [
      "planning",
      "approval_required",
      "access_request_required",
      "care_only",
      "clinical_provider_pathway",
    ] as const) {
      const decision = resolveV3Readiness({
        ...CLEARED,
        accessIntent,
        strengthDisputed: true,
      });
      expect(decision.state).toBe("held");
      expect(decision.blockingReasons).toContain("variant_strength_disputed");
    }
  });

  it("never lets a contested strength reach a purchasable state", () => {
    for (const audience of [
      "public",
      "member",
      "qualified_research",
      "care",
      "clinical_provider",
      "partner",
    ] as const) {
      const decision = resolveV3Readiness({
        ...CLEARED,
        audience,
        strengthDisputed: true,
      });
      expect(isPurchasableReadinessState(decision.state)).toBe(false);
    }
  });

  it("keeps an unstated or contested variant label out of a purchasable state", () => {
    for (const variantIdentity of ["unstated", "contested"] as const) {
      const decision = resolveV3Readiness({ ...CLEARED, variantIdentity });
      expect(decision.state).toBe("pending_documentation");
      expect(isPurchasableReadinessState(decision.state)).toBe(false);
    }
  });

  it("holds an access value it does not recognize rather than reading it kindly", () => {
    const decision = resolveV3Readiness({
      ...CLEARED,
      accessIntent: "unrecognized",
    });
    expect(decision.state).toBe("held");
    expect(decision.blockingReasons).toContain("access_state_unrecognized");
  });

  it("walks the evidence chain in order", () => {
    expect(resolveV3Readiness({ ...CLEARED, costState: "pending" }).state).toBe(
      "pending_supplier",
    );
    expect(
      resolveV3Readiness({ ...CLEARED, hasApprovedPrice: false }).state,
    ).toBe("pending_price");
    expect(
      resolveV3Readiness({
        ...CLEARED,
        documentation: { coaState: "missing", lotState: "attached" },
      }).state,
    ).toBe("pending_documentation");
    expect(
      resolveV3Readiness({
        ...CLEARED,
        documentation: { coaState: "attached", lotState: "missing" },
      }).state,
    ).toBe("pending_documentation");
    expect(resolveV3Readiness({ ...CLEARED, imageState: "pending" }).state).toBe(
      "pending_image",
    );
  });

  it("lets nothing override an archived, unavailable, or held row", () => {
    expect(resolveV3Readiness({ ...CLEARED, archived: true }).state).toBe(
      "archived",
    );
    expect(
      resolveV3Readiness({ ...CLEARED, accessIntent: "unavailable" }).state,
    ).toBe("unavailable");
    expect(resolveV3Readiness({ ...CLEARED, accessIntent: "held" }).state).toBe(
      "held",
    );
  });

  it("reports every unmet condition, not only the deciding one", () => {
    const decision = resolveV3Readiness({
      archived: false,
      accessIntent: "access_request_required",
      strengthDisputed: false,
      variantIdentity: "unstated",
      costState: "pending",
      hasApprovedPrice: false,
      documentation: { coaState: "missing", lotState: "missing" },
      imageState: "pending",
      audience: "public",
    });
    expect(decision.state).toBe("request_access");
    expect(Array.from(decision.blockingReasons).sort()).toEqual(
      [
        "access_request_required",
        "coa_missing",
        "customer_price_not_approved",
        "lot_documentation_missing",
        "product_image_missing",
        "variant_identity_unstated",
        "wholesale_cost_pending",
      ].sort(),
    );
  });
});

describe("the customer projection", () => {
  it("shows no price without an approval, whatever the readiness", () => {
    for (const state of V3_READINESS_STATES) {
      const projection = projectV3CustomerOffer(
        RECORD,
        { state, blockingReasons: [] },
        null,
      );
      expect(projection.price).toEqual({
        state: "not_available",
        message: V3_PRICE_UNAVAILABLE_MESSAGE,
      });
    }
  });

  it("shows no price in a state where a price may not be displayed", () => {
    for (const state of V3_READINESS_STATES) {
      const projection = projectV3CustomerOffer(
        RECORD,
        { state, blockingReasons: [] },
        APPROVED,
      );
      expect(projection.price.state).toBe(
        isPurchasableReadinessState(state) ? "priced" : "not_available",
      );
    }
  });

  it("shows the approved amount only in a purchasable state", () => {
    const projection = projectV3CustomerOffer(
      RECORD,
      { state: "qualified_research", blockingReasons: [] },
      APPROVED,
    );
    expect(projection.price).toEqual({
      state: "priced",
      amountCents: 29000,
      currency: "USD",
    });
  });

  it("refuses a malformed approval instead of rendering it", () => {
    for (const broken of [
      { ...APPROVED, amountCents: 0 },
      { ...APPROVED, amountCents: -100 },
      { ...APPROVED, amountCents: 12.5 },
      { ...APPROVED, approvedBy: "  " },
      { ...APPROVED, effectiveDate: "" },
    ]) {
      expect(isV3ApprovedCustomerPrice(broken)).toBe(false);
      const projection = projectV3CustomerOffer(
        RECORD,
        { state: "active_public", blockingReasons: [] },
        broken as V3ApprovedCustomerPrice,
      );
      expect(projection.price).toEqual({
        state: "not_available",
        message: V3_PRICE_UNAVAILABLE_MESSAGE,
      });
    }
  });

  it("can never render a zero price", () => {
    const zeroApproval = { ...APPROVED, amountCents: 0 };
    for (const state of V3_READINESS_STATES) {
      const projection = projectV3CustomerOffer(
        RECORD,
        { state, blockingReasons: [] },
        zeroApproval as V3ApprovedCustomerPrice,
      );
      expect(JSON.stringify(projection)).not.toContain('"amountCents":0');
      expect(projection.price.state).toBe("not_available");
    }
  });

  it("approves nothing through the default lookup", () => {
    expect(noApprovedPrices(RECORD)).toBeNull();
  });
});
