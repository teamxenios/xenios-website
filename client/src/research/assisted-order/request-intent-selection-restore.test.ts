import { describe, expect, it } from "vitest";
import type { RequestIntentCatalogItem } from "../../../../shared/research/assisted-order/request-intent";
import { validateRetainedRequestSelections } from "./request-intent-selection-restore";

function item(productId = "synthetic-product", variantId = "synthetic-variant"): RequestIntentCatalogItem {
  return { productId, variantId, productName: "Current synthetic item", family: "research_peptides_materials",
    channel: "synthetic", specification: "Current variant", format: null, packBasis: null,
    minimumQuantity: 2, maximumQuantity: 10, quantityIncrement: 2, unitPriceCents: null, currency: "USD",
    workflowMode: "request_pricing", actionLabel: "Add to request", accessNotice: null, researchUseOnly: true,
    catalogVersion: "current-synthetic", priceVersion: null, selectableForReview: true, intentExclusion: null,
    clinicalReviewRequired: false, sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
    sourceRefusal: null };
}
const line = (quantity = 4) => ({ productId: "synthetic-product", variantId: "synthetic-variant", quantity });

describe("retained request selection validation (no persistence or owner binding)", () => {
  it("uses the exact current server item and keeps requested quantity", () => {
    const current = item();
    const result = validateRetainedRequestSelections([line()], [current]);
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") throw new Error("invalid");
    expect(result.selections[0].item).toBe(current);
    expect(result.selections[0].quantity).toBe(4);
    expect(Object.isFrozen(result.selections)).toBe(true);
    expect(Object.isFrozen(result.selections[0])).toBe(true);
  });
  it("allows an empty selection without pretending it is submittable", () => {
    expect(validateRetainedRequestSelections([], [])).toEqual({ kind: "valid", selections: [] });
  });
  it.each([null, undefined, "[]", {}, [null], [[]], [Object.create({ ...line() })]])("rejects malformed input %j", (raw) => {
    expect(validateRetainedRequestSelections(raw, [item()])).toEqual({ kind: "invalid" });
  });
  it.each(["contact", "notes", "owner", "idempotencyKey", "productName", "unitPriceCents", "selectableForReview"])("rejects cached extra field %s", (key) => {
    expect(validateRetainedRequestSelections([{ ...line(), [key]: "untrusted" }], [item()])).toEqual({ kind: "invalid" });
  });
  it.each([0, 1, 3, 11, 100, 101, -2, 4.5, NaN, Infinity, "4", null])("rejects disallowed quantity %j without clamping", (quantity) => {
    expect(validateRetainedRequestSelections([{ ...line(), quantity }], [item()])).toEqual({ kind: "invalid" });
  });
  it("applies current changed min, increment and max rather than old rules", () => {
    for (const change of [{ minimumQuantity: 6 }, { quantityIncrement: 3 }, { maximumQuantity: 2 }]) {
      expect(validateRetainedRequestSelections([line()], [{ ...item(), ...change }])).toEqual({ kind: "invalid" });
    }
  });
  it("keeps the existing Early Access ceiling even with no catalog maximum", () => {
    expect(validateRetainedRequestSelections([line(102)], [{ ...item(), maximumQuantity: null }])).toEqual({ kind: "invalid" });
  });
  it("never substitutes a same-name different product or variant", () => {
    for (const current of [item("other-product"), item("synthetic-product", "other-variant")]) {
      expect(validateRetainedRequestSelections([line()], [current])).toEqual({ kind: "invalid" });
    }
  });
  it("refuses currently ineligible items without inventing eligibility rules", () => {
    expect(validateRetainedRequestSelections([line()], [{ ...item(), selectableForReview: false }])).toEqual({ kind: "invalid" });
  });
  it("accepts clinical review requests when canonical catalog permits them", () => {
    const current = { ...item(), workflowMode: "provider_request" as const, clinicalReviewRequired: true };
    expect(validateRetainedRequestSelections([line()], [current]).kind).toBe("valid");
  });
  it("rejects duplicate retained identities instead of merging quantities", () => {
    expect(validateRetainedRequestSelections([line(), line(6)], [item()])).toEqual({ kind: "invalid" });
  });
  it("rejects ambiguous current catalog identities", () => {
    expect(validateRetainedRequestSelections([line()], [item(), item()])).toEqual({ kind: "invalid" });
  });
  it.each(["", " synthetic-product", "synthetic-product ", "a".repeat(161), "synthetic\u0000product", null, 1])("does not normalize or accept invalid identity %j", (productId) => {
    expect(validateRetainedRequestSelections([{ ...line(), productId }], [item()])).toEqual({ kind: "invalid" });
  });
  it("rejects over-limit drafts before considering entries", () => {
    expect(validateRetainedRequestSelections(Array.from({ length: 201 }, () => line()), [item()])).toEqual({ kind: "invalid" });
  });
  it("rejects the entire draft rather than silently dropping a missing line", () => {
    expect(validateRetainedRequestSelections([line(), { ...line(), variantId: "missing" }], [item()])).toEqual({ kind: "invalid" });
  });
  it("does not mutate inputs or retain any additional caller data", () => {
    const current = Object.freeze(item()), retained = Object.freeze(line());
    const result = validateRetainedRequestSelections(Object.freeze([retained]), Object.freeze([current]));
    expect(result).toEqual({ kind: "valid", selections: [{ item: current, quantity: 4 }] });
    expect(retained).toEqual(line());
  });
});
