import { describe, expect, it } from "vitest";
import {
  SETH_OPERATING_ADVISOR_SCHEDULE,
  STANDARD_REPRESENTATIVE_SCHEDULE,
} from "@shared/research/commission-schedules";
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
    bindingId: "20000000-0000-4000-8000-000000000001",
    partnerId: "10000000-0000-4000-8000-000000000001",
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
      partners: { async getPartnerStateAt() { return "active"; } },
    });
    const result = await authority.resolveForPartner({
      partnerId: "10000000-0000-4000-8000-000000000001",
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
      partners: { async getPartnerStateAt() { return "active"; } },
    });
    expect(await authority.resolveForPartner({
      partnerId: "10000000-0000-4000-8000-000000000001",
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
    expect(snapshot.scheduleHash)
      .toBe("5225b31ee28bcad381b81349b11ecb659c9dce3898f9d26026bb3b32d714cceb");
    expect(createCommissionScheduleSnapshot(SETH_OPERATING_ADVISOR_SCHEDULE).scheduleHash)
      .toBe("549f97385d7e7c4bf78bde1f407798dfb35866da2024a97149476217aabe697c");

    const altered = structuredClone(snapshot);
    (altered.definition as { label: string }).label = "rewritten history";
    expect(scheduleSnapshotIsAuthentic(altered)).toBe(false);
  });

  it("rejects overlapping server bindings instead of choosing a favorable program", async () => {
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([
        signedBinding(), signedBinding({ bindingId: "20000000-0000-4000-8000-000000000002" }),
      ]),
      partners: { async getPartnerStateAt() { return "active"; } },
    });
    expect(await authority.resolveForPartner({
      partnerId: "10000000-0000-4000-8000-000000000001",
      occurredAt: "2026-09-20T00:00:00.000Z",
    })).toEqual({ ok: false, code: "program_binding_ambiguous" });
  });

  it("fails closed for unknown runtime programs and malformed termination instants", async () => {
    const partnerId = "10000000-0000-4000-8000-000000000001";
    const partners = { async getPartnerStateAt() { return "active" as const; } };
    const unknown = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([
        signedBinding({ programId: "unknown_runtime_program" }),
      ]),
      partners,
    });
    expect(await unknown.resolveForPartner({ partnerId, occurredAt: "2026-09-20T00:00:00.000Z" }))
      .toEqual({ ok: false, code: "schedule_version_not_found" });

    const malformed = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([
        signedBinding({ terminatedAt: "not-an-instant" }),
      ]),
      partners,
    });
    expect(await malformed.resolveForPartner({ partnerId, occurredAt: "2026-09-20T00:00:00.000Z" }))
      .toEqual({ ok: false, code: "program_binding_invalid" });
  });

  it("projects an immutable termination event so a successor binding resolves without overlap", async () => {
    const partnerId = "10000000-0000-4000-8000-000000000001";
    const first = signedBinding();
    const successor = signedBinding({
      bindingId: "20000000-0000-4000-8000-000000000002",
      effectiveAt: "2026-10-15T00:00:00.000Z",
      recordedAt: "2026-10-10T00:00:00.000Z",
    });
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([first, successor], [{
        eventId: "30000000-0000-4000-8000-000000000001",
        bindingId: first.bindingId,
        sequence: 1,
        kind: "terminated",
        effectiveAt: successor.effectiveAt,
        authorityReference: "signed-program-supersession:1",
        recordedAt: "2026-10-10T00:00:00.000Z",
      }]),
      partners: { async getPartnerStateAt() { return "active"; } },
    });
    const resolved = await authority.resolveForPartner({
      partnerId,
      occurredAt: "2026-10-16T00:00:00.000Z",
    });
    expect(resolved.ok && resolved.value.binding.bindingId).toBe(successor.bindingId);
  });

  it("asks the lifecycle authority for state at the settlement instant", async () => {
    const observed: string[] = [];
    const authority = createCommissionScheduleAuthority({
      bindings: createInMemoryCommissionProgramBindingRepository([signedBinding()]),
      partners: {
        async getPartnerStateAt(_partnerId, occurredAt) {
          observed.push(occurredAt);
          return "active";
        },
      },
    });
    const occurredAt = "2026-09-20T00:00:00.000Z";
    expect((await authority.resolveForPartner({
      partnerId: "10000000-0000-4000-8000-000000000001",
      occurredAt,
    })).ok).toBe(true);
    expect(observed).toEqual([occurredAt]);
  });
});
