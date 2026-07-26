import { describe, expect, it } from "vitest";
import { mapCareSupplyKitRow } from "./instruction-repository";

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
});
