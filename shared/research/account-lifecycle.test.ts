import { describe, expect, it } from "vitest";
import { lifecycleEnvelope, lifecycleConfirmBody, lifecyclePrepareBody, lifecycleIssueBody, lifecycleInstant, lifecycleMicros, unavailableLifecycle } from "./account-lifecycle";
const id = "10000000-0000-4000-8000-000000000001", hash = "a".repeat(64);
const preview = { digest: hash, expiresAt: "2026-11-19T23:59:00.123456Z", policyRevision: hash, coverageRevision: hash };
const ready = () => ({ ...unavailableLifecycle("policy_unavailable"), operationId: id, version: 1, state: "confirmation_required" as const,
  preview, blockers: [], nextAction: "confirm" as const });
describe("closed account lifecycle protocol without invented clearance", () => {
  it("keeps unavailable axes unknown and exact closed keys", () => {
    const value = unavailableLifecycle("guard_coverage_unavailable"); expect(lifecycleEnvelope.parse(value)).toEqual(value);
    expect(lifecycleEnvelope.safeParse({ ...value, clear: true }).success).toBe(false);
    expect(lifecycleEnvelope.safeParse({ ...value, progress: { ...value.progress, eligibleData: "verified" } }).success).toBe(false);
  });
  it.each(["2026-02-30T12:00:00Z", "2026-11-19T23:59:60Z", "2026-11-19T23:59:00+00:00", "2026-11-19T23:59:00.1234567Z"])("refuses noncanonical or overflowing native time %s", value => {
    expect(lifecycleInstant.safeParse(value).success).toBe(false);
  });
  it("preserves actual native microseconds instead of a replacement TTL or millisecond cutoff", () => {
    expect(lifecycleInstant.parse(preview.expiresAt)).toBe(preview.expiresAt);
    expect(lifecycleMicros(preview.expiresAt) - lifecycleMicros("2026-11-19T23:59:00.123455Z")).toBe(1n);
  });
  it("requires a persisted operation and preview before confirmation and never forgets known operations", () => {
    expect(lifecycleEnvelope.safeParse(ready()).success).toBe(true);
    for (const delta of [{ preview: null }, { operationId: null }, { version: null }, { state: "unavailable" }, { version: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(lifecycleEnvelope.safeParse({ ...ready(), ...delta }).success).toBe(false);
    }
  });
  it.each(["unknown", "pending", "blocked", "not_started"])("refuses completed deletion when a declared obligation is %s", axis => {
    const value = { ...ready(), state: "completed", preview: null, nextAction: "none",
      progress: { application: "verified", providerSessions: "verified", eligibleData: axis, retainedData: "not_applicable", authIdentity: "verified" } };
    expect(lifecycleEnvelope.safeParse(value).success).toBe(false);
  });
  it("separates retained obligations, provider uncertainty and complete erasure", () => {
    const value = { ...ready(), state: "completed_with_retention", preview: null, nextAction: "none",
      progress: { application: "verified", providerSessions: "verified", eligibleData: "verified", retainedData: "retained", authIdentity: "verified" } };
    expect(lifecycleEnvelope.safeParse(value).success).toBe(true);
    expect(lifecycleEnvelope.safeParse({ ...value, state: "completed" }).success).toBe(false);
    expect(lifecycleEnvelope.safeParse({ ...value, state: "auth_outcome_unknown", progress: { ...value.progress, authIdentity: "unknown" },
      blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" }).success).toBe(true);
  });
  it("denies body authority, arbitrary target/actor/assurance and unbounded carrier data", () => {
    expect(lifecycleIssueBody.safeParse({ retryKey: "synthetic_retry_01", targetId: id }).success).toBe(false);
    expect(lifecyclePrepareBody.safeParse({ attemptCarrier: "a".repeat(32), assuranceRef: hash }).success).toBe(false);
    expect(lifecyclePrepareBody.safeParse({ attemptCarrier: "a\r\n".repeat(20) }).success).toBe(false);
    expect(lifecycleConfirmBody.safeParse({ operationId: id, previewDigest: hash, expectedVersion: 1, confirm: true, actorId: id }).success).toBe(false);
  });
});
