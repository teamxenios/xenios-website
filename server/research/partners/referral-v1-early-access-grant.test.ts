import { describe, expect, it, vi } from "vitest";
import { deriveReferralV1EarlyAccessGrant, type ReferralV1EarlyAccessGrantDependencies } from "./referral-v1-early-access-grant";

const authUserId = "10000000-0000-4000-8000-000000000001";
const partnerId = "20000000-0000-4000-8000-000000000002";
const linkId = "30000000-0000-4000-8000-000000000003";
const touchId = "40000000-0000-4000-8000-000000000004";
const transferId = "50000000-0000-4000-8000-000000000005";
const customerRef = "eac_0123456789abcdef0123456789abcdef";
const effectiveAt = "2026-09-21T12:00:00.000Z";
const occurredAt = "2026-09-21T13:00:00.000Z";
const grantInput = { canonicalAuthUserId: authUserId, occurredAt };
const schedule = { programId: "xenios_standard_rep_2026_09", version: 1, scheduleHash: "a".repeat(64) };

function fixture(): ReferralV1EarlyAccessGrantDependencies {
  return {
    bindings: { bindingAt: vi.fn(async () => ({ ok: true as const, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId, linkId, touchId, boundAt: "2026-09-20T12:00:00.000Z",
      revisionId: transferId, effectiveAt, source: "admin_transfer" as const,
    }, created: false, availability: "ready" as const } })) },
    customers: { findOwnedCustomerByAuthUserId: vi.fn(async () => ({ customerRef })) },
    schedules: { resolveForPartner: vi.fn(async () => ({ ok: true as const, value: { snapshot: {
      definition: { programId: schedule.programId, version: schedule.version, firstOrderRateBasisPoints: 2_500 },
      scheduleHash: schedule.scheduleHash, holdBasisPoints: 2_500,
    } } })) },
    writer: { recordIfAbsent: vi.fn(async () => "recorded" as const) },
  };
}

describe("Referral V1 canonical Early Access grant derivation", () => {
  it("derives every grant fact from server-owned binding, customer, and schedule authorities", async () => {
    const deps = fixture();
    const result = await deriveReferralV1EarlyAccessGrant(grantInput, deps);
    expect(result).toEqual({ ok: true, state: "recorded", schedule });
    expect(deps.bindings.bindingAt).toHaveBeenCalledWith({ actorAuthUserId: authUserId, occurredAt });
    expect(deps.customers.findOwnedCustomerByAuthUserId).toHaveBeenCalledWith(authUserId);
    expect(deps.schedules.resolveForPartner).toHaveBeenCalledWith({ partnerId, occurredAt });
    expect(deps.writer.recordIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1, customerRef, partnerId, referralLinkId: linkId, bindingRevisionId: transferId,
      bindingEffectiveAt: effectiveAt, occurredAt, commissionProgramId: schedule.programId,
      commissionScheduleVersion: schedule.version, commissionScheduleHash: schedule.scheduleHash,
      idempotencyKey: expect.stringMatching(/^rvea_[a-f0-9]{64}$/),
    }));
    const recorded = vi.mocked(deps.writer.recordIfAbsent).mock.calls[0][0] as unknown as Record<string, unknown>;
    for (const forbidden of ["holdBasisPoints", "commissionRateBasisPoints", "rateBasisPoints", "email", "diagnosis"])
      expect(recorded).not.toHaveProperty(forbidden);
  });

  it("uses the effective transfer revision and timestamp, not the original captured partner", async () => {
    const deps = fixture();
    await deriveReferralV1EarlyAccessGrant(grantInput, deps);
    expect(deps.schedules.resolveForPartner).toHaveBeenCalledWith({ partnerId, occurredAt });
    expect(deps.writer.recordIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ bindingRevisionId: transferId, partnerId }));
  });

  it("asks for the binding and commission schedule at the economic event instant", async () => {
    const deps = fixture();
    const beforeTransfer = "2026-09-21T11:59:59.000Z";
    const originalPartnerId = "60000000-0000-4000-8000-000000000006";
    const originalLinkId = "70000000-0000-4000-8000-000000000007";
    vi.mocked(deps.bindings.bindingAt).mockResolvedValue({ ok: true, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId: originalPartnerId, linkId: originalLinkId, touchId,
      boundAt: "2026-09-20T12:00:00.000Z", revisionId: touchId,
      effectiveAt: "2026-09-20T12:00:00.000Z", source: "capture",
    }, created: false, availability: "ready" } });
    await deriveReferralV1EarlyAccessGrant({ canonicalAuthUserId: authUserId, occurredAt: beforeTransfer }, deps);
    expect(deps.bindings.bindingAt).toHaveBeenCalledWith({ actorAuthUserId: authUserId, occurredAt: beforeTransfer });
    expect(deps.schedules.resolveForPartner).toHaveBeenCalledWith({ partnerId: originalPartnerId, occurredAt: beforeTransfer });
    expect(deps.writer.recordIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: originalPartnerId, referralLinkId: originalLinkId, bindingRevisionId: touchId, occurredAt: beforeTransfer,
    }));
  });

  it("refuses a missing binding before customer, schedule, or writer work", async () => {
    const deps = fixture();
    vi.mocked(deps.bindings.bindingAt).mockResolvedValue({ ok: true, value: {
      binding: null, created: false, availability: "none",
    } });
    expect(await deriveReferralV1EarlyAccessGrant(grantInput, deps)).toEqual({ ok: false, reason: "binding_missing" });
    expect(deps.customers.findOwnedCustomerByAuthUserId).not.toHaveBeenCalled();
    expect(deps.schedules.resolveForPartner).not.toHaveBeenCalled();
    expect(deps.writer.recordIfAbsent).not.toHaveBeenCalled();
  });

  it("replays an earlier structural owner after later suspension when the as-of schedule remains valid", async () => {
    const deps = fixture();
    vi.mocked(deps.bindings.bindingAt).mockResolvedValue({ ok: true, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId, linkId, touchId, boundAt: effectiveAt,
      revisionId: touchId, effectiveAt, source: "capture",
    }, created: false, availability: "partner_inactive" } });
    vi.mocked(deps.writer.recordIfAbsent).mockResolvedValue("already_recorded");

    expect(await deriveReferralV1EarlyAccessGrant(grantInput, deps)).toEqual({
      ok: true, state: "already_recorded", schedule,
    });
    expect(deps.schedules.resolveForPartner).toHaveBeenCalledWith({ partnerId, occurredAt });
    expect(deps.writer.recordIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("lets as-of schedule authority reject a structurally bound but ineligible partner", async () => {
    const deps = fixture();
    vi.mocked(deps.bindings.bindingAt).mockResolvedValue({ ok: true, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId, linkId, touchId, boundAt: effectiveAt,
      revisionId: touchId, effectiveAt, source: "capture",
    }, created: false, availability: "partner_inactive" } });
    vi.mocked(deps.schedules.resolveForPartner).mockResolvedValue({ ok: false, code: "partner_inactive_at_occurrence" });

    expect(await deriveReferralV1EarlyAccessGrant(grantInput, deps)).toEqual({ ok: false, reason: "schedule_unavailable" });
    expect(deps.writer.recordIfAbsent).not.toHaveBeenCalled();
  });

  it("fails closed if the binding authority reports self-referral", async () => {
    const deps = fixture();
    vi.mocked(deps.bindings.bindingAt).mockResolvedValue({ ok: true, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId, linkId, touchId, boundAt: effectiveAt,
      revisionId: touchId, effectiveAt, source: "capture",
    }, created: false, availability: "self_referral" } });

    expect(await deriveReferralV1EarlyAccessGrant(grantInput, deps)).toEqual({ ok: false, reason: "binding_ineligible" });
    expect(deps.customers.findOwnedCustomerByAuthUserId).not.toHaveBeenCalled();
    expect(deps.schedules.resolveForPartner).not.toHaveBeenCalled();
    expect(deps.writer.recordIfAbsent).not.toHaveBeenCalled();
  });

  it("fails closed for predecessor bindings without a canonical revision and for unavailable schedules", async () => {
    const predecessor = fixture();
    vi.mocked(predecessor.bindings.bindingAt).mockResolvedValue({ ok: true, value: { binding: {
      accountKey: `auth:${authUserId}`, partnerId, linkId, touchId, boundAt: effectiveAt,
    }, created: false, availability: "ready" } });
    expect(await deriveReferralV1EarlyAccessGrant(grantInput, predecessor)).toEqual({ ok: false, reason: "binding_unavailable" });
    expect(predecessor.customers.findOwnedCustomerByAuthUserId).not.toHaveBeenCalled();

    const noSchedule = fixture();
    vi.mocked(noSchedule.schedules.resolveForPartner).mockResolvedValue({ ok: false, code: "program_binding_not_found" });
    expect(await deriveReferralV1EarlyAccessGrant(grantInput, noSchedule)).toEqual({ ok: false, reason: "schedule_unavailable" });
    expect(noSchedule.writer.recordIfAbsent).not.toHaveBeenCalled();
  });

  it("has no call surface for browser-provided ownership, customer, program, rate, hold, or health facts", async () => {
    const deps = fixture();
    expect(await deriveReferralV1EarlyAccessGrant({ ...grantInput, canonicalAuthUserId: "not-an-auth-id" }, deps)).toEqual({ ok: false, reason: "invalid_identity" });
    expect(deps.bindings.bindingAt).not.toHaveBeenCalled();
    expect(deps.customers.findOwnedCustomerByAuthUserId).not.toHaveBeenCalled();
    expect(deps.schedules.resolveForPartner).not.toHaveBeenCalled();
    expect(deps.writer.recordIfAbsent).not.toHaveBeenCalled();
  });

  it("produces a stable retry key and accepts an idempotent existing grant", async () => {
    const deps = fixture();
    vi.mocked(deps.writer.recordIfAbsent).mockResolvedValue("already_recorded");
    const first = await deriveReferralV1EarlyAccessGrant(grantInput, deps);
    const second = await deriveReferralV1EarlyAccessGrant(grantInput, deps);
    expect(first).toMatchObject({ ok: true, state: "already_recorded" });
    expect(second).toEqual(first);
    expect(vi.mocked(deps.writer.recordIfAbsent).mock.calls[0][0].idempotencyKey)
      .toBe(vi.mocked(deps.writer.recordIfAbsent).mock.calls[1][0].idempotencyKey);
  });
});
