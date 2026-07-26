import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "CarePrescriptionsPage.tsx"), "utf8");
const panel = readFileSync(resolve(__dirname, "CarePharmacyReadinessPanel.tsx"), "utf8");
const pharmacy = readFileSync(resolve(__dirname, "CarePharmacyOrdersPage.tsx"), "utf8");

describe("Care PR4 final Xenios UI states", () => {
  it("fails closed across loading, disabled, auth, empty, error, and populated states", () => {
    for (const state of ["loading", "disabled", "auth_required", "error", "ready"]) {
      expect(page).toContain(state);
    }
    expect(page).toContain("No prescription is recorded.");
    expect(page).toContain("Try again");
    expect(page).toContain("aria-live=\"polite\"");
    expect(page).not.toContain("<main");
    expect(page).not.toMatch(/demo|sample prescription|fake pharmacy/i);
  });
  it("uses exact Care required-input labels without inventing clinical facts", () => {
    expect(panel).toContain("PHARMACY LICENSE VERIFICATION REQUIRED");
    expect(panel).toContain("PATIENT-SPECIFIC PRESCRIPTION CONTENT REQUIRED");
    expect(panel).toContain("CARE ACTIVATION APPROVAL REQUIRED");
    expect(panel).toContain("Care remains blocked");
  });
  it("keeps the assigned pharmacy queue fail-closed with one state action", () => {
    expect(pharmacy).toContain("Authorized pharmacy access is required.");
    expect(pharmacy).toContain("No orders are assigned.");
    expect(pharmacy).toContain("PRIVATE TRACKING REFERENCE");
    expect(pharmacy).toContain("CLARIFICATION REQUEST REFERENCE");
    expect(pharmacy).toContain("CLINICIAN RESPONSE REQUIRED");
    expect(pharmacy).toContain("Request clarification");
    expect(pharmacy).toContain("Nothing was changed.");
    expect(pharmacy).not.toContain("<main");
    expect(pharmacy).not.toMatch(/demo pharmacy|sample order|fake patient/i);
  });
});
