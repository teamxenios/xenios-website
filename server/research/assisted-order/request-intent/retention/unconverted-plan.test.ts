import { describe, expect, it, vi } from "vitest";
import { planUnconvertedRetention } from "./unconverted-plan";

const policy = {
  recordReference: "KAN-149/13456:EA-DURABLE-RETENTION-1.0",
  documentSha256: "3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b",
  durationSemantics: "elapsed_utc_days",
  afterClosureDays: 90,
  afterSubmissionDays: 180,
} as const;
function input(overrides: Record<string, unknown> = {}) {
  return {
    classification: "unconverted", submittedAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-01-10T00:00:00Z", asOf: "2026-03-01T00:00:00Z",
    legalHold: "none", extension: "none", policy, ...overrides,
  };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe("unconverted request retention planning", () => {
  it("chooses closure plus 90 days before the original submission plus 180 days", () => {
    expect(planUnconvertedRetention(input())).toMatchObject({
      status: "planned", deadlineAt: "2026-04-10T00:00:00.000Z",
      closureDeadlineAt: "2026-04-10T00:00:00.000Z",
      submissionDeadlineAt: "2026-06-30T00:00:00.000Z", limitingClock: "closure_limit",
      mode: "advisory", authority: "none", automaticDeletion: false,
    });
  });
  it("uses the 180-day cap for a known open unconverted request", () => {
    expect(planUnconvertedRetention(input({ closedAt: null }))).toMatchObject({
      status: "planned", closedAt: null, closureDeadlineAt: null,
      deadlineAt: "2026-06-30T00:00:00.000Z", limitingClock: "submission_cap",
    });
  });
  it("does not extend the original cap when an unconverted case closes late", () => {
    expect(planUnconvertedRetention(input({ closedAt: "2026-06-20T00:00:00Z", asOf: "2026-06-20T00:00:00Z" }))).toMatchObject({
      status: "planned", closureDeadlineAt: "2026-09-18T00:00:00.000Z",
      deadlineAt: "2026-06-30T00:00:00.000Z", limitingClock: "submission_cap",
    });
  });
  it("identifies equal deadlines without selecting a longer retention class", () => {
    expect(planUnconvertedRetention(input({ closedAt: "2026-04-01T00:00:00Z", asOf: "2026-04-01T00:00:00Z" }))).toMatchObject({
      status: "planned", deadlineAt: "2026-06-30T00:00:00.000Z", limitingClock: "both",
    });
  });
  it.each([
    ["2026-04-09T23:59:59.999Z", "before_deadline"],
    ["2026-04-10T00:00:00Z", "deadline_reached"],
    ["2026-04-10T00:00:00.001Z", "deadline_reached"],
  ])("evaluates the explicit instant %s at the deadline boundary", (asOf, phase) => {
    expect(planUnconvertedRetention(input({ asOf }))).toMatchObject({
      status: "planned", phase, deadlineAt: "2026-04-10T00:00:00.000Z", automaticDeletion: false,
    });
  });
  it.each(["unknown", "converted", "completed"])("does not invent an unconverted clock for %s", classification => {
    const result = planUnconvertedRetention(input({ classification }));
    expect(result.status).toBe("unavailable");
    expect(result).not.toHaveProperty("deadlineAt");
  });
  it("requires an explicit classification, known closure state, hold and policy", () => {
    for (const key of ["classification", "closedAt", "legalHold", "extension", "policy", "asOf"]) {
      const candidate: Record<string, unknown> = input();
      delete candidate[key];
      expect(planUnconvertedRetention(candidate)).toMatchObject({ status: "unavailable", reason: "invalid_input" });
    }
  });
  it("holds legal holds and unsupported extensions without computing deletion eligibility", () => {
    expect(planUnconvertedRetention(input({ legalHold: "active" }))).toMatchObject({ status: "held", reason: "legal_hold" });
    expect(planUnconvertedRetention(input({ extension: "present" }))).toMatchObject({ status: "held", reason: "extension_requires_review" });
  });
  it.each([
    ["legalHold", "hold_status_unavailable"],
    ["extension", "extension_status_unavailable"],
  ])("does not treat unknown %s as absent", (field, reason) => {
    expect(planUnconvertedRetention(input({ [field]: "unknown" }))).toMatchObject({ status: "unavailable", reason });
  });
  it.each([
    "2026-01-01", "2026-01-01T00:00:00", "2026-02-30T00:00:00Z",
    "2025-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
    "2026-01-01T24:00:00Z", "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00", "2026-01-01T00:00:00-00:00",
    "2026-01-01T00:00:00.0001Z", " 2026-01-01T00:00:00Z",
  ])("refuses ambiguous, impossible or unsupported instant %s", submittedAt => {
    expect(planUnconvertedRetention(input({ submittedAt }))).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });
  it.each([
    { submittedAt: "2026-03-02T00:00:00Z" },
    { closedAt: "2025-12-31T23:59:59Z" },
    { closedAt: "2026-03-02T00:00:00Z" },
  ])("refuses a contradictory/future event timeline", overrides => {
    expect(planUnconvertedRetention(input(overrides))).toMatchObject({ status: "unavailable", reason: "invalid_timeline" });
  });
  it("normalizes equivalent offsets to the same event instants and deadline", () => {
    expect(planUnconvertedRetention(input({
      submittedAt: "2025-12-31T18:00:00-06:00", closedAt: "2026-01-09T18:00:00-06:00",
      asOf: "2026-02-28T18:00:00-06:00",
    }))).toEqual(planUnconvertedRetention(input()));
  });
  it("uses explicitly elapsed UTC days across a daylight-saving transition", () => {
    expect(planUnconvertedRetention(input({
      submittedAt: "2026-03-07T12:00:00-06:00", closedAt: null,
      asOf: "2026-03-08T13:00:00-05:00", policy: { ...policy, afterSubmissionDays: 1 },
    }))).toMatchObject({ status: "planned", deadlineAt: "2026-03-08T18:00:00.000Z", phase: "deadline_reached" });
  });
  it("accepts a real leap day without normalizing an invalid one", () => {
    expect(planUnconvertedRetention(input({
      submittedAt: "2028-02-29T00:00:00Z", closedAt: null, asOf: "2028-03-01T00:00:00Z",
    }))).toMatchObject({ status: "planned", deadlineAt: "2028-08-27T00:00:00.000Z" });
  });
  it("uses supplied policy durations rather than substituting hidden defaults", () => {
    expect(planUnconvertedRetention(input({
      closedAt: null, policy: { ...policy, afterSubmissionDays: 60 },
    }))).toMatchObject({ status: "planned", deadlineAt: "2026-03-02T00:00:00.000Z" });
  });
  it.each([0, -1, 1.5, Infinity, NaN])("refuses invalid policy day count %s", afterSubmissionDays => {
    expect(planUnconvertedRetention(input({ policy: { ...policy, afterSubmissionDays } }))).toMatchObject({ status: "unavailable" });
  });
  it("refuses unsupported calendar units and unbound or malformed policy metadata", () => {
    for (const changes of [
      { durationSemantics: "calendar_months" }, { recordReference: "" },
      { documentSha256: "not-a-hash" }, { approved: true },
    ]) {
      expect(planUnconvertedRetention(input({ policy: { ...policy, ...changes } }))).toMatchObject({ status: "unavailable", reason: "invalid_input" });
    }
  });
  it("reports unavailable for arithmetic/date range overflow instead of wrapping or throwing", () => {
    expect(planUnconvertedRetention(input({ policy: { ...policy, afterSubmissionDays: Number.MAX_SAFE_INTEGER } }))).toMatchObject({
      status: "unavailable", reason: "deadline_out_of_range",
    });
    expect(planUnconvertedRetention(input({
      submittedAt: "9999-12-31T00:00:00Z", closedAt: null, asOf: "9999-12-31T00:00:00Z",
    }))).toMatchObject({ status: "unavailable", reason: "deadline_out_of_range" });
  });
  it("preserves replay inputs and cannot reset deadlines from elapsed time or a hidden clock", () => {
    const original = freeze(input()), before = JSON.stringify(original);
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Hidden wall clock read"); });
    try {
      const first = planUnconvertedRetention(original);
      expect(planUnconvertedRetention(original)).toEqual(first);
      expect(JSON.stringify(original)).toBe(before);
      expect(planUnconvertedRetention(input({ asOf: "2026-04-11T00:00:00Z" }))).toMatchObject({
        status: "planned", deadlineAt: "2026-04-10T00:00:00.000Z",
      });
    } finally { now.mockRestore(); }
  });
  it("does not accept quotes, activity or receipt labels as lifecycle authority", () => {
    for (const activity of [
      { quoteIssuedAt: "2026-02-01T00:00:00Z" }, { lastActivityAt: "2026-02-01T00:00:00Z" },
      { status: "pending_review" }, { classification: "pending_review" },
    ]) {
      expect(planUnconvertedRetention(input(activity))).toMatchObject({ status: "unavailable", reason: "invalid_input" });
    }
  });
  it("returns no supplied personal payload on a rejected input", () => {
    const result = planUnconvertedRetention(input({ contact: { email: "private@example.test" } }));
    expect(result).toEqual({
      schemaVersion: 1, mode: "advisory", authority: "none", automaticDeletion: false,
      status: "unavailable", reason: "invalid_input",
    });
  });
});
