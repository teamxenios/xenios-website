import { describe, expect, it } from "vitest";
import {
  createResearchToCareDiscovery,
  hasCarePermission,
  type CarePrincipal,
} from "./contracts";

describe("Care rail and role contracts", () => {
  it("does not grant Care access to affiliate, Mitch, trainer, fulfillment, or Research admin roles", () => {
    const denied = ["affiliate", "mitch", "trainer", "fulfillment", "research_admin"] as const;
    for (const role of denied) {
      expect(hasCarePermission({ roles: [role] }, "care:read_self")).toBe(false);
      expect(hasCarePermission({ roles: [role] }, "care:review_assigned")).toBe(false);
    }
  });

  it("keeps patient and clinician authority narrow", () => {
    const patient: CarePrincipal = { subjectId: "u-1", patientId: "p-1", roles: ["care_patient"] };
    const clinician: CarePrincipal = { subjectId: "u-2", clinicianId: "c-1", roles: ["clinician"] };
    expect(hasCarePermission(patient, "care:read_self")).toBe(true);
    expect(hasCarePermission(patient, "care:review_assigned")).toBe(false);
    expect(hasCarePermission(clinician, "care:review_assigned")).toBe(true);
    expect(hasCarePermission(clinician, "care:administer")).toBe(false);
  });

  it("allows only generic consented discovery without product or order linkage", () => {
    const discovery = createResearchToCareDiscovery("subject-1", "2026-07-25T00:00:00.000Z");
    expect(discovery).toEqual({
      sourceRail: "research",
      destinationRail: "care",
      intent: "learn_about_care",
      subjectId: "subject-1",
      consentedAt: "2026-07-25T00:00:00.000Z",
    });
    expect(discovery).not.toHaveProperty("sku");
    expect(discovery).not.toHaveProperty("orderId");
    expect(discovery).not.toHaveProperty("purchaseId");
  });
});
