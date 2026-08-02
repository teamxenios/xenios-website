import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import { buildCarePrescriptionRepository } from "./prescription-repository";

const PHARMACY_ID = "88888888-8888-4888-8888-888888888888";
const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const PRESCRIPTION_ID = "55555555-5555-4555-8555-555555555555";

const supabase = vi.hoisted(() => {
  const calls: Array<{ table: string; selection?: string }> = [];
  const orderRow = {
    id: "77777777-7777-4777-8777-777777777777",
    patient_id: "11111111-1111-4111-8111-111111111111",
    prescription_id: "55555555-5555-4555-8555-555555555555",
    assigned_pharmacy_id: "88888888-8888-4888-8888-888888888888",
    patient_state_code: "IL",
    status: "assigned",
    clarification_open: false,
    tracking_reference: null,
    version: 1,
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
    care_prescriptions: {
      care_prescription_content_sources: {
        formulation: "PRIVATE-FORMULATION",
        concentration: "PRIVATE-CONCENTRATION",
        route: "PRIVATE-ROUTE",
        quantity: "PRIVATE-QUANTITY",
        directions: "PRIVATE-DIRECTIONS",
        refills: 99,
      },
    },
  };

  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((selection: string) => {
      calls.push({ table, selection });
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(async () => ({
      data: table === "care_pharmacy_orders" ? [orderRow] : [],
      error: null,
    }));
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === "care_pharmacy_operators"
          ? [{ pharmacy_id: "88888888-8888-4888-8888-888888888888" }]
          : [],
        error: null,
      }).then(resolve);
    return chain;
  };

  return { calls, from: vi.fn(query) };
});

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({ from: supabase.from }),
}));

describe("Care clinical projection privacy", () => {
  beforeEach(() => {
    supabase.calls.length = 0;
    supabase.from.mockClear();
  });

  it("keeps patient-specific prescription content out of pharmacy worklist reads", async () => {
    const orders = await buildCarePrescriptionRepository()
      .listAssignedPharmacyOrders("operator-1");

    expect(orders).toHaveLength(1);
    expect(orders[0]).not.toHaveProperty("prescriptionContent");
    const serialized = JSON.stringify(orders);
    for (const marker of [
      "PRIVATE-FORMULATION",
      "PRIVATE-CONCENTRATION",
      "PRIVATE-ROUTE",
      "PRIVATE-QUANTITY",
      "PRIVATE-DIRECTIONS",
    ]) {
      expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain(
        Buffer.from(marker, "utf8").toString("base64"),
      );
    }

    const selection = supabase.calls.find(
      (call) => call.table === "care_pharmacy_orders",
    )?.selection;
    expect(selection).toBeTruthy();
    expect(selection).not.toContain("care_prescriptions");
    expect(selection).not.toContain("formulation");
    expect(selection).not.toContain("directions");
  });

  it("does not widen the operational order projection when an RPC row is hostile", async () => {
    const admin = buildCarePrescriptionRepository();
    const order = await admin.listAssignedPharmacyOrders(
      "operator-1",
    );
    expect(order[0]?.patientId).toBe(PATIENT_ID as CareRecordId);
    expect(Object.keys(order[0] ?? {}).sort()).toEqual([
      "assignedPharmacyId",
      "clarificationOpen",
      "createdAt",
      "id",
      "patientId",
      "patientStateCode",
      "prescriptionId",
      "status",
      "trackingReferencePresent",
      "updatedAt",
      "version",
    ]);
  });
});
