import { describe, expect, it } from "vitest";
import { businessInquiryInputSchema } from "./business-inquiry";

const valid = () => ({
  contactName: "Synthetic Operator", contactEmail: "TEST@example.invalid", organizationName: "Synthetic Organization",
  organizationType: "clinic", location: "Texas", categories: ["clinical", "supplements"],
  selections: [{ description: "Synthetic exact item", variant: "Synthetic presentation", quantity: 10, unit: "vial" }],
  packagingPreference: "organization_brand", siteCount: 3, replenishment: "recurring", services: ["labeling"],
});
describe("business inquiry bounded contract", () => {
  it("preserves packaging, multi-site services, and each quantity's own unit", () => {
    const result = businessInquiryInputSchema.parse({ ...valid(), selections: [
      ...valid().selections, { description: "Synthetic supplement", variant: "One bottle", quantity: 50, unit: "bottle" },
    ] });
    expect(result.contactEmail).toBe("test@example.invalid");
    expect(result).toMatchObject({ packagingPreference: "organization_brand", siteCount: 3, replenishment: "recurring", services: ["labeling"] });
    expect(result.selections.map(({ quantity, unit }) => ({ quantity, unit }))).toEqual([{ quantity: 10, unit: "vial" }, { quantity: 50, unit: "bottle" }]);
  });
  it.each(["assignedTo", "organizationId", "actorId", "status", "price", "consent", "patient", "payment"])("rejects privileged/unscoped field %s", (key) => {
    expect(businessInquiryInputSchema.safeParse({ ...valid(), [key]: "untrusted" }).success).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, 1_000_001])("rejects invalid quantity %s", (quantity) => {
    expect(businessInquiryInputSchema.safeParse({ ...valid(), selections: [{ ...valid().selections[0], quantity }] }).success).toBe(false);
  });
  it("requires exact variant and unit and bounds selections", () => {
    expect(businessInquiryInputSchema.safeParse({ ...valid(), selections: [{ description: "Item", quantity: 10 }] }).success).toBe(false);
    expect(businessInquiryInputSchema.safeParse({ ...valid(), selections: Array(41).fill(valid().selections[0]) }).success).toBe(false);
  });
  it("accepts an exploratory enquiry without inventing selections or supplier minimums", () => {
    expect(businessInquiryInputSchema.parse({ ...valid(), selections: [], packagingPreference: "not_sure" }).selections).toEqual([]);
  });
  it("rejects repeated categories and services", () => {
    expect(businessInquiryInputSchema.safeParse({ ...valid(), categories: ["research", "research"] }).success).toBe(false);
    expect(businessInquiryInputSchema.safeParse({ ...valid(), services: ["labeling", "labeling"] }).success).toBe(false);
  });
});
