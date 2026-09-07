import { describe, expect, it } from "vitest";
import { IDENTITY_RECORD_LABELS, readPartnerOnboardingReport } from "./onboarding-records";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "synthetic-agreement-One_1.0",
  title: "Synthetic Agreement One",
  version: "1.0.0",
  acknowledged: false,
  ...patch,
});
const verification = (patch: Record<string, unknown> = {}) => ({ state: "pending", detail: "Synthetic free-form source detail", ...patch });
const envelope = (agreements: unknown = [row()], identity: unknown = verification()) => ({ ok: true, verification: identity, agreements });
const requiredFields = ["id", "title", "version", "acknowledged"];

describe("reported partner onboarding projection", () => {
  it("projects frozen input into new nested objects and rows without sorting, mutation, or leaking detail", () => {
    const agreements = Object.freeze([
      Object.freeze(row({ id: "synthetic-z-new-agreement", version: "v1", acknowledged: true })),
      Object.freeze(row({ id: "synthetic-a-other-agreement", title: "Synthetic Other Agreement" })),
    ]);
    const identity = Object.freeze(verification({ detail: "PRIVATE-SYNTHETIC-SOURCE-DETAIL" }));
    const source = Object.freeze(envelope(agreements, identity));
    const before = JSON.stringify(source);
    const result = readPartnerOnboardingReport(source);
    expect(result).toEqual({ verification: { state: "pending" }, agreements });
    expect(result).not.toBe(source);
    expect(result?.verification).not.toBe(identity);
    expect(result?.agreements).not.toBe(agreements);
    for (let index = 0; index < agreements.length; index++) expect(result!.agreements[index]).not.toBe(agreements[index]);
    expect(result?.agreements.map(({ id }) => id)).toEqual(["synthetic-z-new-agreement", "synthetic-a-other-agreement"]);
    expect(Object.keys(result!)).toEqual(["verification", "agreements"]);
    expect(Object.keys(result!.verification)).toEqual(["state"]);
    expect(Object.keys(result!.agreements[0])).toEqual(requiredFields);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-SYNTHETIC-SOURCE-DETAIL");
    expect(JSON.stringify(source)).toBe(before);
  });

  it("exposes only the three source identity-state labels", () => {
    expect(IDENTITY_RECORD_LABELS).toEqual({ verified: "Verified", not_started: "Not started", pending: "Pending" });
  });

  it.each(["verified", "not_started", "pending"])("preserves %s independently of empty, acknowledged, or unacknowledged agreements", (state) => {
    for (const agreements of [[], [row({ acknowledged: true })], [row({ acknowledged: false })], [row(), row({ id: "synthetic-second", acknowledged: true })]]) {
      expect(readPartnerOnboardingReport(envelope(agreements, verification({ state })))).toEqual({ verification: { state }, agreements });
    }
  });

  it("does not convert missing agreements into empty or infer identity from acknowledgments", () => {
    expect(readPartnerOnboardingReport({ ok: true, verification: verification() })).toBeNull();
    expect(readPartnerOnboardingReport(envelope(null))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([row({ acknowledged: true })], verification({ state: "not_started" })))?.verification).toEqual({ state: "not_started" });
    expect(readPartnerOnboardingReport(envelope([row()], verification({ state: "verified" })))?.agreements[0].acknowledged).toBe(false);
  });

  it.each([
    "PRIVATE-SYNTHETIC: no action is required and the account is approved",
    "PRIVATE-SYNTHETIC: Review received; verified; payout access granted",
    "<img src=x onerror='synthetic()'> PRIVATE-SYNTHETIC",
    "person@fixture.invalid PRIVATE-SYNTHETIC free-form source note",
    " Synthetic source detail • 東京 ",
    "D".repeat(2000),
  ])("validates but discards free-form detail rather than accepting a review or no-action instruction: %s", (detail) => {
    const result = readPartnerOnboardingReport(envelope([], verification({ state: "pending", detail })));
    expect(result).toEqual({ verification: { state: "pending" }, agreements: [] });
    expect(result?.verification).not.toHaveProperty("detail");
  });

  it.each(["1.0.0", "v1", "V1", "0", "Version_1-release.2", "A".repeat(96)])("preserves exact version %s without adding a v prefix or normalizing spelling", (version) => {
    expect(readPartnerOnboardingReport(envelope([row({ version })]))?.agreements[0].version).toBe(version);
  });

  it("preserves safe ID/title boundaries and source-defined keys without deduplicating titles", () => {
    const agreements = [
      row({ id: "0", title: " Synthetic Accord • 東京 " }),
      row({ id: "A".repeat(192), title: "T".repeat(200) }),
      row({ id: "Agreement-Mixed_Case.1", title: "<Synthetic agreement> / reference?value#fragment" }),
      row({ id: "agreement-mixed_case.1" }),
      row({ id: "synthetic-new-requirement-not-a-hardcoded-key" }),
    ];
    expect(readPartnerOnboardingReport(envelope(agreements))).toEqual({ verification: { state: "pending" }, agreements });
  });
});

describe("partner onboarding exact DTO and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "onboarding", [], [row()], {},
    { verification: verification(), agreements: [] }, { ok: false, verification: verification(), agreements: [] },
    { ok: "true", verification: verification(), agreements: [] }, { ok: 1, verification: verification(), agreements: [] },
    { ok: true, verification: verification(), agreements: {} }, { ok: true, verification: verification(), agreements: "none" },
    { ok: true, verification: verification(), agreements: undefined }, { ok: true, verification: verification(), rows: [] },
  ])("rejects malformed envelope %j without fabricating a report", (value) => {
    expect(readPartnerOnboardingReport(value)).toBeNull();
  });

  it.each(["ok", "verification", "agreements"])("requires an own envelope %s field", (field) => {
    const missing: Record<string, unknown> = envelope();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field]; Object.assign(inherited, missing);
    expect(readPartnerOnboardingReport(missing)).toBeNull();
    expect(readPartnerOnboardingReport(inherited)).toBeNull();
  });

  it.each([null, undefined, false, 0, "verified", [], {}])("rejects malformed verification %j", (value) => {
    expect(readPartnerOnboardingReport({ ...envelope(), verification: value })).toBeNull();
  });

  it.each(["state", "detail"])("requires own verification %s even though free-form detail is discarded", (field) => {
    const missing: Record<string, unknown> = verification();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field]; Object.assign(inherited, missing);
    expect(readPartnerOnboardingReport(envelope([], missing))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([], inherited))).toBeNull();
  });

  it.each([
    "approved", "active", "rejected", "declined", "in_review", "not started", "Verified", "PENDING", "verified ", " pending",
    "toString", "constructor", "__proto__", null, undefined, false, true, 0, {}, [],
  ])("refuses unknown or coercible identity state %j", (state) => {
    expect(readPartnerOnboardingReport(envelope([], verification({ state })))).toBeNull();
  });

  it.each(["", " ", "\u00a0", "D".repeat(2001), null, undefined, false, 0, {}, []])("rejects invalid required bounded detail %j rather than ignoring the malformed source", (detail) => {
    expect(readPartnerOnboardingReport(envelope([], verification({ detail })))).toBeNull();
  });

  it("rejects all C0 controls and DEL in free-form verification detail", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(readPartnerOnboardingReport(envelope([], verification({ detail: `Synthetic${String.fromCharCode(code)}Detail` })))).toBeNull();
    }
  });

  it.each([null, undefined, false, 0, "agreement", [], {}])("rejects malformed agreement row %j", (value) => {
    expect(readPartnerOnboardingReport(envelope([value]))).toBeNull();
  });

  it.each(requiredFields)("requires own agreement %s", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field]; Object.assign(inherited, missing);
    expect(readPartnerOnboardingReport(envelope([missing]))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([inherited]))).toBeNull();
  });

  it("rejects wholly inherited envelope, verification, and agreement objects", () => {
    expect(readPartnerOnboardingReport(Object.create(envelope()))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([], Object.create(verification())))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([Object.create(row())]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["partnerId", "synthetic-partner"], ["memberId", "synthetic-member"],
    ["organizationId", "synthetic-organization"], ["identity", { name: "Synthetic Person" }], ["token", "synthetic-not-a-token"],
    ["payoutCredentials", "synthetic-not-credentials"], ["payoutAccount", "synthetic-account"], ["role", "admin"],
    ["permissions", ["synthetic-grant"]], ["canAcknowledge", true], ["canActivate", true], ["eligible", true],
    ["approved", true], ["reviewReceipt", "synthetic-receipt"], ["expiresAt", "2099-01-01"], ["complete", true],
  ])("rejects extra %s data on every DTO object boundary", (field, value) => {
    expect(readPartnerOnboardingReport({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readPartnerOnboardingReport(envelope([], verification({ [field as string]: value })))).toBeNull();
    expect(readPartnerOnboardingReport(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it.each([
    "", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb",
    "a\n", "a\u0000", "é-id", "A".repeat(193), null, undefined, false, 1, {}, [],
  ])("rejects unsafe or oversized agreement ID %j without decoding or coercion", (id) => {
    expect(readPartnerOnboardingReport(envelope([row({ id })]))).toBeNull();
  });

  it.each(["", " ", "\u00a0", "T".repeat(201), null, undefined, false, 0, {}, []])("rejects invalid required title %j", (title) => {
    expect(readPartnerOnboardingReport(envelope([row({ title })]))).toBeNull();
  });

  it("rejects all C0 controls and DEL in agreement titles", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(readPartnerOnboardingReport(envelope([row({ title: `Synthetic${String.fromCharCode(code)}Title` })]))).toBeNull();
    }
  });

  it.each([
    "", ".", "..", "_v1", "-v1", "1/2", "1\\2", "1?2", "1#2", "version 1", "1%2E0", "v1\n", "v1\u0000",
    "vé1", " 1.0.0", "1.0.0 ", "V".repeat(97), null, undefined, false, 1, {}, [],
  ])("requires exact bounded safe version text without coercion or normalization: %j", (version) => {
    expect(readPartnerOnboardingReport(envelope([row({ version })]))).toBeNull();
  });

  it.each([null, undefined, 0, 1, -1, "true", "false", "", {}, [], Number.NaN])("requires boolean acknowledged without truthy/falsey coercion: %j", (acknowledged) => {
    expect(readPartnerOnboardingReport(envelope([row({ acknowledged })]))).toBeNull();
  });

  it("rejects duplicate IDs even when versions and acknowledgment facts differ", () => {
    expect(readPartnerOnboardingReport(envelope([
      row(), row({ version: "v2", acknowledged: true }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the complete report when agreement row %s is malformed", (invalidIndex) => {
    const agreements = [row(), row({ id: "synthetic-second-agreement" })];
    const malformed: unknown[] = [...agreements];
    malformed[invalidIndex] = { ...agreements[invalidIndex], acknowledged: "true" };
    expect(readPartnerOnboardingReport(envelope(malformed, verification({ state: "verified" })))).toBeNull();
  });
});
