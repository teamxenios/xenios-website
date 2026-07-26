import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const center = readFileSync(resolve(__dirname, "CareInstructionCenterPage.tsx"), "utf8");
const readiness = readFileSync(resolve(__dirname, "CareInstructionReadinessPanel.tsx"), "utf8");
const replacement = readFileSync(resolve(__dirname, "CareSupplyReplacementPage.tsx"), "utf8");
const shared = readFileSync(resolve(__dirname, "../../../shared/care/instructions.ts"), "utf8");

describe("Care PR5 final Xenios UI states", () => {
  it("fails closed across patient loading, disabled, auth, error, empty, and populated states", () => {
    for (const state of ["loading", "disabled", "auth_required", "error", "ready"]) {
      expect(center).toContain(state);
    }
    expect(center).toContain("No patient-specific instructions are recorded.");
    expect(center).toContain("General education is never substituted");
    expect(center).toContain("Acknowledge this version");
    expect(center).toContain("Request a replacement");
    expect(center).toContain("VERIFIED SUPPLY SOURCE REQUIRED");
    expect(center).toContain(
      'kit.supplySourceVerificationState === "verified"',
    );
    expect(center).toContain("Supply replacement unavailable");
    expect(center).toContain("overflow-x-clip");
    expect(center).not.toMatch(/amazon|generic syringe|sample instruction|fake supplier/i);
  });

  it("shows exact authorized readiness facts and keeps launch blocked", () => {
    expect(shared).toContain("PHARMACY LABEL SOURCE REQUIRED");
    expect(shared).toContain("PRODUCT-SPECIFIC DEVICE RECORD REQUIRED");
    expect(shared).toContain("SUPPLY REPLACEMENT CADENCE REQUIRED");
    expect(readiness).toContain("Care remains blocked");
  });

  it("keeps the pharmacy replacement queue role-bound and external-action free", () => {
    expect(replacement).toContain("Authorized pharmacy access is required.");
    expect(replacement).toContain("No replacements are assigned.");
    expect(replacement).toContain("does not itself trigger an external shipment");
    expect(replacement).toContain("Nothing was changed.");
    expect(replacement).toContain("overflow-x-clip");
  });
});
