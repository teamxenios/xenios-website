import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateCareAppointmentReadiness } from "./appointment-readiness";
import { buildCareAppointmentRepository } from "./appointment-repository";

const supabase = vi.hoisted(() => {
  const state = { operationalClinicianReady: false };
  const tableRows: Record<string, Record<string, unknown>[]> = {
    care_medical_groups: [{ id: "group-a" }],
    care_clinician_profiles: [{ clinician_user_id: "clinician-a" }],
    care_clinician_licenses: [{ id: "license-b" }],
    care_scheduling_providers: [
      { provider_key: "provider", reminder_offsets_minutes: [60] },
    ],
    care_supported_states: [{ state_code: "IL" }],
    care_clinician_state_coverage: [{ id: "coverage-c" }],
  };
  const query = (data: Record<string, unknown>[]) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gt", "limit"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      resolve: (result: {
        data: Record<string, unknown>[];
        error: null;
      }) => unknown,
    ) => Promise.resolve({ data, error: null }).then(resolve);
    return builder;
  };
  return {
    state,
    from: vi.fn((table: string) => query(tableRows[table] ?? [])),
    rpc: vi.fn(async (name: string) => {
      if (name !== "care_operational_clinician_ready") {
        throw new Error(`unexpected_rpc:${name}`);
      }
      return { data: state.operationalClinicianReady, error: null };
    }),
  };
});

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({
    from: supabase.from,
    rpc: supabase.rpc,
  }),
}));

describe("Care PR 3 repository readiness", () => {
  beforeEach(() => {
    supabase.state.operationalClinicianReady = false;
    supabase.from.mockClear();
    supabase.rpc.mockClear();
  });

  it("does not combine disjoint diagnostic clinician records", async () => {
    const facts = await buildCareAppointmentRepository().loadReadiness("IL");

    expect(facts).toMatchObject({
      medicalGroupVerified: true,
      clinicianRecordVerified: true,
      clinicianLicenseVerified: true,
      clinicianCoverageVerified: true,
      operationalClinicianReady: false,
    });
    expect(evaluateCareAppointmentReadiness(facts).operationalReady).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "care_operational_clinician_ready",
      expect.objectContaining({ p_state_code: "IL" }),
    );
  });

  it("accepts the server-authoritative matched-clinician result", async () => {
    supabase.state.operationalClinicianReady = true;

    const facts = await buildCareAppointmentRepository().loadReadiness("IL");

    expect(facts.operationalClinicianReady).toBe(true);
    expect(evaluateCareAppointmentReadiness(facts).operationalReady).toBe(true);
  });
});
