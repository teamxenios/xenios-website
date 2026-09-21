import { describe, expect, it } from "vitest";
import { STANDARD_REPRESENTATIVE_SCHEDULE } from "@shared/research/commission-schedules";
import {
  createCommissionScheduleAuthority,
  createInMemoryCommissionProgramBindingRepository,
  type CommissionProgramBinding,
} from "./authority";
import {
  createCommissionScheduleSnapshot,
  scheduleSnapshotIsAuthentic,
} from "./hash";

function signedBinding(overrides: Partial<CommissionProgramBinding> = {}): CommissionProgramBinding {
  return {
    bindingId: "binding-1",
    partnerId: "partner-1",
    programId: STANDARD_REPRESENTATIVE_SCHEDULE.programId,
    scheduleVersion: 1,
    scheduleHash: createCommissionScheduleSnapshot(STANDARD_REPRESENTATIVE_SCHEDULE).scheduleHash,
    effectiveAt: "2026-09-15T00:00:00.000Z",
    terminatedAt: null,
    authorityReference: "signed-program-binding:1",
    recordedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("server-owned commission schedule authority", () => {
  it("resolves from only canonical partner identity and occurrence time", async () => {
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([signedBinding()]),
      partners: { async getPartnerState() { return "active"; } },
    });
    const result = await authority.resolveForPartner({
      partnerId: "partner-1",
      occurredAt: "2026-09-20T00:00:00.000Z",
    });
    expect(result.ok && result.value.schedule.ratePolicy).toEqual({
      kind: "flat",
      rateBasisPoints: 2_000,
    });
  });

  it("fails closed for a mismatched pinned hash", async () => {
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([
        signedBinding({ scheduleHash: "0".repeat(64) }),
      ]),
      partners: { async getPartnerState() { return "active"; } },
    });
    expect(await authority.resolveForPartner({
      partnerId: "partner-1",
      occurredAt: "2026-09-20T00:00:00.000Z",
    })).toEqual({ ok: false, code: "schedule_hash_mismatch" });
  });

  it("deep-freezes and authenticates the full versioned definition snapshot", () => {
    const snapshot = createCommissionScheduleSnapshot(STANDARD_REPRESENTATIVE_SCHEDULE);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.definition)).toBe(true);
    expect(Object.isFrozen(snapshot.definition.ratePolicy)).toBe(true);
    expect(Object.isFrozen(snapshot.definition.sourceEvidence)).toBe(true);
    expect(scheduleSnapshotIsAuthentic(snapshot)).toBe(true);

    const altered = structuredClone(snapshot);
    (altered.definition as { label: string }).label = "rewritten history";
    expect(scheduleSnapshotIsAuthentic(altered)).toBe(false);
  });

  it("rejects overlapping server bindings instead of choosing a favorable program", async () => {
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([
        signedBinding(), signedBinding({ bindingId: "binding-2" }),
      ]),
      partners: { async getPartnerState() { return "active"; } },
    });
    expect(await authority.resolveForPartner({
      partnerId: "partner-1",
      occurredAt: "2026-09-20T00:00:00.000Z",
    })).toEqual({ ok: false, code: "program_binding_ambiguous" });
  });
});
