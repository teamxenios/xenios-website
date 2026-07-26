import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf8");
const patient = read("CareCommunicationsPage.tsx");
const clinician = read("CareClinicianMessagesPage.tsx");
const labs = read("CareLabReviewPage.tsx");
const safety = read("CareSafetyQueuePage.tsx");
const shared = read("../../../shared/care/communications.ts");

describe("Care PR6 final Xenios UI states", () => {
  it("fails closed across patient loading, disabled, auth, error, empty, populated, and success states", () => {
    for (const state of ["loading", "disabled", "auth_required", "error", "ready"]) {
      expect(patient).toContain(state);
    }
    expect(patient).toContain("No private Care activity is recorded.");
    expect(patient).toContain("Record private reply");
    expect(patient).toContain("No external");
    expect(patient).toContain("Your concern was recorded privately.");
    expect(patient).toContain("does not send messages, place laboratory orders");
    expect(patient).toContain("overflow-x-clip");
  });

  it("keeps clinician messages private and external-delivery free", () => {
    expect(clinician).toContain("Assigned clinician access is required.");
    expect(clinician).toContain("No conversations are assigned.");
    expect(clinician).toContain("No external delivery occurred.");
    expect(clinician).toContain("Nothing was sent or changed.");
  });

  it("uses exact laboratory reference states with no ranges or interpretation", () => {
    expect(labs).toContain("Verify references without inventing results.");
    expect(labs).toContain("No laboratory records are assigned.");
    expect(labs).toContain("does not place an order");
    expect(shared).toContain("LABORATORY RESULT REFERENCE REQUIRED");
    expect(shared).not.toMatch(/normal range|reference range/i);
  });

  it("shows emergency guidance and owner-bound internal-only safety actions", () => {
    expect(shared).toContain("contact local emergency services now");
    expect(safety).toContain("Assigned clinical-support access is required.");
    expect(safety).toContain("Record internal escalation");
    expect(safety).toContain("Nothing was changed or escalated.");
  });
});
