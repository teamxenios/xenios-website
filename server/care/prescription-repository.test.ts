import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import { evaluateCarePrescriptionReadiness } from "./prescriptions";
import { buildCarePrescriptionRepository } from "./prescription-repository";

const CLINICIAN = "22222222-2222-4222-8222-222222222222";
const PHARMACY =
  "88888888-8888-4888-8888-888888888888" as CareRecordId;
const PRESCRIPTION =
  "55555555-5555-4555-8555-555555555555" as CareRecordId;

const supabase = vi.hoisted(() => {
  const state = {
    facts: {
      medical_group_verified: false,
      clinician_coverage_verified: false,
      patient_specific_content_verified: false,
      pharmacy_partner_verified: false,
      pharmacy_identity_verified: false,
      pharmacy_license_verified: false,
      pharmacy_state_coverage_verified: false,
      pharmacy_agreement_verified: false,
      pharmacy_integration_verified: false,
      pharmacy_support_verified: false,
    },
  };
  return {
    state,
    rpc: vi.fn(async (name: string) => {
      if (name !== "care_prescription_readiness") {
        throw new Error(`unexpected_rpc:${name}`);
      }
      return { data: state.facts, error: null };
    }),
  };
});

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc: supabase.rpc,
  }),
}));

describe("Care PR 4 exact-entity readiness", () => {
  beforeEach(() => {
    for (const key of Object.keys(supabase.state.facts)) {
      supabase.state.facts[
        key as keyof typeof supabase.state.facts
      ] = false;
    }
    supabase.rpc.mockClear();
  });

  it("does not combine disjoint clinician, pharmacy, license, or coverage records", async () => {
    const facts = await buildCarePrescriptionRepository().loadReadiness({
      stateCode: "IL",
      clinicianUserId: CLINICIAN,
      pharmacyId: PHARMACY,
      prescriptionId: PRESCRIPTION,
    });

    expect(Object.values(facts).every((value) => value === false)).toBe(true);
    expect(evaluateCarePrescriptionReadiness(facts).operationalReady).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "care_prescription_readiness",
      expect.objectContaining({
        p_clinician_user_id: CLINICIAN,
        p_pharmacy_id: PHARMACY,
        p_prescription_id: PRESCRIPTION,
        p_state_code: "IL",
      }),
    );
  });

  it("clears exact labels only when one matched workflow context is complete", async () => {
    for (const key of Object.keys(supabase.state.facts)) {
      supabase.state.facts[
        key as keyof typeof supabase.state.facts
      ] = true;
    }

    const facts = await buildCarePrescriptionRepository().loadReadiness({
      stateCode: "IL",
      clinicianUserId: CLINICIAN,
      pharmacyId: PHARMACY,
      prescriptionId: PRESCRIPTION,
    });

    const readiness = evaluateCarePrescriptionReadiness(facts);
    expect(readiness.operationalReady).toBe(true);
    expect(readiness.requiredInputs).toEqual([
      "CARE ACTIVATION APPROVAL REQUIRED",
    ]);
  });

  it("re-blocks when the exact joined validator reports expiry or revocation", async () => {
    for (const key of Object.keys(supabase.state.facts)) {
      supabase.state.facts[
        key as keyof typeof supabase.state.facts
      ] = true;
    }
    supabase.state.facts.clinician_coverage_verified = false;
    supabase.state.facts.pharmacy_license_verified = false;

    const readiness = evaluateCarePrescriptionReadiness(
      await buildCarePrescriptionRepository().loadReadiness({
        stateCode: "IL",
        clinicianUserId: CLINICIAN,
        pharmacyId: PHARMACY,
        prescriptionId: PRESCRIPTION,
      }),
    );

    expect(readiness.operationalReady).toBe(false);
    expect(readiness.requiredInputs).toContain("CLINICIAN COVERAGE REQUIRED");
    expect(readiness.requiredInputs).toContain(
      "PHARMACY LICENSE VERIFICATION REQUIRED",
    );
  });
});
