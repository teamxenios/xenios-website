import { describe, expect, it } from "vitest";
import {
  projectMasterOfferingCard,
  projectMasterOfferingDetail,
} from "./customer-projection";
import { offering } from "./test-fixtures";

const PRIVATE_KEYS = [
  "supplierOrOwner",
  "sourceSku",
  "sourceReferences",
  "canonicalKey",
  "updatedWholesaleCost",
  "updatedSellPrice",
  "recommendedLaunchSellPrice",
  "updatedGrossMargin",
] as const;

function everyKey(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) everyKey(entry, output);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      output.push(key);
      everyKey(child, output);
    }
  }
  return output;
}

describe("master offering customer projection", () => {
  it("projects an explicit safe shape with no source, supplier, or planning-money fields", () => {
    const detail = projectMasterOfferingDetail(offering());
    const keys = everyKey(JSON.parse(JSON.stringify(detail)));
    for (const privateKey of PRIVATE_KEYS) {
      expect(keys).not.toContain(privateKey);
    }
    expect(detail.variants[0].action.kind).toBe("request_access");
  });

  it("refuses an admin-only product rather than trusting the caller to hide it", () => {
    expect(() => projectMasterOfferingCard(offering({ visibility: "admin_only" }))).toThrow(
      /Refused to project admin-only offering/,
    );
  });

  it("renders research boundary disclosures on research families", () => {
    const detail = projectMasterOfferingDetail(offering({ family: "research_vials" }));
    expect(detail.disclosures).toHaveLength(2);
    expect(detail.disclosures.join(" ")).toContain("nonclinical catalog navigation");
    expect(detail.disclosures.join(" ")).toContain("Product Control remains the purchase authority");
  });
});
