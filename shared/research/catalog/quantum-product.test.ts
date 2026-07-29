import { describe, expect, it } from "vitest";
import { describeOfferMode, resolvePrivateLaneOfferMode } from "./offer-readiness";
import {
  internalVariantSku,
  QUANTUM_PRODUCT,
  QUANTUM_PRODUCT_SKU,
  quantumIdentityResolved,
  quantumMissingInputs,
  toMemberQuantumCard,
  type QuantumIdentity,
} from "./quantum-product";

const IDENTITY_FIELDS: Array<keyof QuantumIdentity> = [
  "strength",
  "concentration",
  "volume",
  "packageQuantity",
  "unitOfMeasure",
  "supplier",
  "sourceTissueBank",
  "lot",
  "expiry",
];

describe("the approved facts", () => {
  it("carries the founder decision exactly", () => {
    expect(QUANTUM_PRODUCT.decisionId).toBe("QNT-001");
    expect(QUANTUM_PRODUCT.canonicalName).toBe("Quantum Foundational Reset");
    expect(QUANTUM_PRODUCT.approvedMemberAmountCents).toBe(180000);
    expect(QUANTUM_PRODUCT.currency).toBe("USD");
    expect(QUANTUM_PRODUCT.audience).toBe("member");
    expect(QUANTUM_PRODUCT.lane).toBe("quantum");
    expect(QUANTUM_PRODUCT.category).toBe("quantum");
    expect(QUANTUM_PRODUCT.effectiveDate).toBeNull();
    expect(QUANTUM_PRODUCT.approvalNote).toContain("Founder-approved 2026-07-29");
  });

  it("holds exactly one variant, on the shared sku convention", () => {
    expect(QUANTUM_PRODUCT.variants).toHaveLength(1);
    const [variant] = QUANTUM_PRODUCT.variants;
    expect(variant.label).toBe("1 vial");
    expect(variant.format).toBe("vial");
    expect(variant.memberEligible).toBe(true);
    expect(variant.sku).toBe("Q001-01");
    expect(QUANTUM_PRODUCT_SKU).toBe("Q001");
    expect(QUANTUM_PRODUCT_SKU).toMatch(/^Q\d{3}$/);
    expect(internalVariantSku("N014", 3)).toBe("N014-03");
  });
});

describe("the identity is open by construction", () => {
  it("leaves all nine structured identity fields null", () => {
    for (const field of IDENTITY_FIELDS) {
      expect(QUANTUM_PRODUCT.identity[field].value, field).toBeNull();
    }
    expect(Object.keys(QUANTUM_PRODUCT.identity).sort()).toEqual(
      [...IDENTITY_FIELDS].sort(),
    );
  });

  it("names what an authoritative document must supply for every field", () => {
    for (const field of IDENTITY_FIELDS) {
      const inputs = QUANTUM_PRODUCT.identity[field].missingInputs;
      expect(inputs.length, field).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(input.length).toBeGreaterThan(10);
      }
    }
  });

  it("routes the source tissue question through counsel rather than through a guess", () => {
    const inputs = QUANTUM_PRODUCT.identity.sourceTissueBank.missingInputs.join(" | ");
    expect(inputs).toContain("tissue bank");
    expect(inputs).toContain("classification memo");
  });

  it("reports the identity as unresolved, with no partial activation", () => {
    expect(quantumIdentityResolved()).toBe(false);
    const missing = quantumMissingInputs();
    expect(missing).toHaveLength(9);
    expect(missing.every((entry) => entry.missingInputs.length > 0)).toBe(true);
  });

  it("states no purity, potency, or lab result anywhere in the record", () => {
    const serialized = JSON.stringify(QUANTUM_PRODUCT).toLowerCase();
    // The words may appear as the name of a document we still need. What must never
    // appear is a numeric result attached to one of them.
    expect(serialized).not.toMatch(/\d+(\.\d+)?\s?%/);
    expect(serialized).not.toMatch(/\bpurity[":\s]+\d/);
    expect(serialized).not.toMatch(/\b\d+(\.\d+)?\s?(mg|mcg|ml|iu)\b/);
  });
});

describe("the offer", () => {
  it("is approval based, with lab documentation pending", () => {
    expect(QUANTUM_PRODUCT.availability).toBe("APPROVAL_REQUIRED_PURCHASE");
    expect(QUANTUM_PRODUCT.readiness).toBe("NEEDS_FINAL_APPROVAL");
    expect(QUANTUM_PRODUCT.coaStatus).toBe("PENDING_LAB_DOCUMENTATION");
  });

  it("derives that mode from the record's own evidence", () => {
    expect(QUANTUM_PRODUCT.availability).toBe(
      resolvePrivateLaneOfferMode({
        lane: "quantum",
        approvedMemberAmountCents: QUANTUM_PRODUCT.approvedMemberAmountCents,
        supplierSkuCode: null,
        internalVariantSku: QUANTUM_PRODUCT.variants[0].sku,
        coaEvidence: QUANTUM_PRODUCT.coaStatus,
        unavailable: false,
      }),
    );
  });

  it("is never directly purchasable", () => {
    expect(QUANTUM_PRODUCT.availability).not.toBe("DIRECT_PRIVATE_PURCHASE");
    expect(describeOfferMode(QUANTUM_PRODUCT.availability)).toBe("Available by approval");
  });

  it("names the documents that are blocking, without claiming any of them exist", () => {
    expect(QUANTUM_PRODUCT.blockingDocuments.length).toBeGreaterThanOrEqual(5);
    expect(QUANTUM_PRODUCT.blockingDocuments.join(" | ")).toContain("classification memo");
    expect(QUANTUM_PRODUCT.sourceReference).toContain("QNT-001");
    expect(QUANTUM_PRODUCT.sourceReference).toContain("QUANTUM_COMMERCE_ACTIVATION_CHECKLIST");
  });
});

describe("the member projection", () => {
  it("carries only the allowed keys", () => {
    const card = toMemberQuantumCard();
    expect(Object.keys(card).sort()).toEqual([
      "amountCents",
      "availability",
      "category",
      "currency",
      "displayName",
      "slug",
      "variantLabel",
    ]);
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("missingInputs");
    expect(serialized).not.toContain("Founder-approved");
    expect(serialized).not.toContain("classification memo");
  });

  it("shows the approved amount, and drops it if the mode ever weakens", () => {
    expect(toMemberQuantumCard().amountCents).toBe(180000);
    const weakened = toMemberQuantumCard({
      ...QUANTUM_PRODUCT,
      availability: "REQUEST_ACCESS_ONLY",
    });
    expect(weakened.amountCents).toBeNull();
  });
});
