import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCareInstructionRepository,
  mapCarePatientInstructionRow,
  mapCareSupplyKitRow,
} from "./instruction-repository";

const supabase = vi.hoisted(() => ({
  instructionCurrent: false,
  rpc: vi.fn(async (name: string) => {
    if (name !== "care_instruction_sources_current") {
      throw new Error(`unexpected_rpc:${name}`);
    }
    return { data: supabase.instructionCurrent, error: null };
  }),
}));

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc: supabase.rpc,
    from: (table: string) => {
      const rows: Record<string, unknown[]> = {
        care_patient_instructions: [
          {
            id: "instruction-1",
            patient_id: "patient-1",
            prescription_id: "prescription-1",
            care_instruction_source_links: [
              { source_kind: "pharmacy_label" },
              { source_kind: "pharmacy_information" },
              { source_kind: "clinician_direction" },
              { source_kind: "manufacturer_material" },
            ],
          },
        ],
        care_supply_kits: [
          {
            product_specific_device: "Exact device",
            replacement_cadence: "Exact cadence",
            care_supply_sources: { verification_state: "verified" },
          },
        ],
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === "care_prescriptions" ? { status: "signed" } : null,
          error: null,
        }),
        limit: async () => ({ data: rows[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

const baseRow = {
  id: "kit-1",
  patient_id: "patient-1",
  prescription_id: "prescription-1",
  status: "released",
  product_specific_device: "Exact device",
  replacement_cadence: "Exact cadence",
  version: 1,
  supersedes_supply_kit_id: null,
  released_at: "2026-07-25T20:00:00Z",
  created_at: "2026-07-25T19:00:00Z",
  updated_at: "2026-07-25T20:00:00Z",
};

describe("Care PR5 supply relationship projection", () => {
  it("exposes a supplier reference only while the exact relationship is verified", () => {
    const verified = mapCareSupplyKitRow({
      ...baseRow,
      care_supply_sources: {
        relationship_reference: "verified-relationship",
        verification_state: "verified",
        verified_at: "2026-07-25T19:30:00Z",
      },
    });
    expect(verified).toMatchObject({
      verifiedSupplierReference: "verified-relationship",
      supplySourceVerificationState: "verified",
      supplySourceVerifiedAt: "2026-07-25T19:30:00Z",
      replacementEligible: false,
    });
  });

  it.each(["rejected", "expired", "superseded", "missing"] as const)(
    "fails closed for a %s supply relationship",
    (verificationState) => {
      const projected = mapCareSupplyKitRow({
        ...baseRow,
        care_supply_sources: {
          relationship_reference: "stale-relationship",
          verification_state: verificationState,
          verified_at: "2026-07-25T19:30:00Z",
        },
      });
      expect(projected).toMatchObject({
        verifiedSupplierReference: null,
        supplySourceVerificationState: verificationState,
        supplySourceVerifiedAt: null,
      });
    },
  );

  it("projects replacement eligibility only from the canonical chain result", () => {
    expect(
      mapCareSupplyKitRow(
        {
          ...baseRow,
          care_supply_sources: {
            relationship_reference: "verified-relationship",
            verification_state: "verified",
            verified_at: "2026-07-25T19:30:00Z",
          },
        },
        true,
      ),
    ).toMatchObject({
      verifiedSupplierReference: "verified-relationship",
      replacementEligible: true,
    });
  });
});

describe("Care PR5 current instruction projection", () => {
  const instructionRow = {
    id: "instruction-1",
    patient_id: "patient-1",
    prescription_id: "prescription-1",
    status: "released",
    instruction_content: "Preserved historical instruction",
    version: 1,
    supersedes_instruction_id: null,
    released_at: "2026-07-25T20:00:00Z",
    created_at: "2026-07-25T19:00:00Z",
    updated_at: "2026-07-25T20:00:00Z",
    care_instruction_source_links: [
      { source_id: "source-1", source_kind: "pharmacy_label" },
    ],
    care_instruction_acknowledgments: [],
  };

  it("preserves history while marking a superseded linked-source chain non-current", () => {
    expect(mapCarePatientInstructionRow(instructionRow, false)).toMatchObject({
      status: "released",
      sourceChainCurrent: false,
      instructionContent: "Preserved historical instruction",
    });
    expect(mapCarePatientInstructionRow(instructionRow, true)).toMatchObject({
      status: "released",
      sourceChainCurrent: true,
    });
  });
});

describe("Care PR5 canonical source readiness", () => {
  beforeEach(() => {
    supabase.instructionCurrent = false;
    supabase.rpc.mockClear();
  });

  it("excludes all linked-source readiness when the released instruction is stale", async () => {
    const facts = await buildCareInstructionRepository().loadReadiness(
      "prescription-1" as never,
    );
    expect(facts).toMatchObject({
      pharmacyLabelVerified: false,
      pharmacyInformationVerified: false,
      clinicianDirectionVerified: false,
      manufacturerMaterialVerified: false,
      patientInstructionContentVerified: false,
      patientInstructionReviewed: false,
    });
  });

  it("restores readiness only for an instruction explicitly linked to current sources", async () => {
    supabase.instructionCurrent = true;
    const facts = await buildCareInstructionRepository().loadReadiness(
      "prescription-1" as never,
    );
    expect(facts).toMatchObject({
      pharmacyLabelVerified: true,
      pharmacyInformationVerified: true,
      clinicianDirectionVerified: true,
      manufacturerMaterialVerified: true,
      patientInstructionContentVerified: true,
      patientInstructionReviewed: true,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "care_instruction_sources_current",
      expect.objectContaining({ p_instruction_id: "instruction-1" }),
    );
  });
});
