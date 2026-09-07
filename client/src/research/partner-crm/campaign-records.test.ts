import { describe, expect, it } from "vitest";
import { CAMPAIGN_LINK_LABELS, prepareCampaignRequest, readCampaignLinkRecords } from "./campaign-records";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "Synthetic Campaign One",
  name: "Synthetic Campaign One",
  window: "Link issued 2026-09-07",
  status: "link issued",
  ...patch,
});
const envelope = (campaigns: unknown = [row()]) => ({ ok: true, campaigns });
const requiredFields = ["id", "name", "window", "status"];

describe("reported campaign-link records", () => {
  it("projects only the reported fields without aliasing, mutation, sorting, or lifecycle promotion", () => {
    const sourceRows = Object.freeze([
      Object.freeze(row({ id: "Zulu Synthetic", name: "Zulu Synthetic", status: "link revoked", window: null })),
      Object.freeze(row({ id: "Alpha Synthetic", name: "Alpha Synthetic", window: "Link issued 2024-02-29" })),
    ]);
    const source = Object.freeze(envelope(sourceRows));
    const before = JSON.stringify(source);
    const result = readCampaignLinkRecords(source);
    expect(result).toEqual(sourceRows);
    expect(result).not.toBe(sourceRows);
    for (let index = 0; index < sourceRows.length; index++) expect(result![index]).not.toBe(sourceRows[index]);
    expect(result?.map(({ name }) => name)).toEqual(["Zulu Synthetic", "Alpha Synthetic"]);
    expect(Object.keys(result![0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("distinguishes an explicit empty response from a missing campaign list", () => {
    expect(readCampaignLinkRecords(envelope([]))).toEqual([]);
    expect(readCampaignLinkRecords({ ok: true })).toBeNull();
    expect(readCampaignLinkRecords(envelope(null))).toBeNull();
  });

  it("exposes only the two link-fact labels, not approval, eligibility, or scheduling labels", () => {
    expect(CAMPAIGN_LINK_LABELS).toEqual({ "link issued": "Link issued", "link revoked": "Link revoked" });
  });

  it.each(["link issued", "link revoked"])("preserves the exact reported %s state with a nullable issued window", (status) => {
    for (const window of [null, "Link issued 2026-09-07"]) {
      expect(readCampaignLinkRecords(envelope([row({ status, window })]))).toEqual([row({ status, window })]);
    }
  });

  it.each([
    "0", "Synthetic Campaign One", " Étude synthétique • 東京 ", "synthetic/a?b#c%20d",
    "synthetic\\code", ".", "..", "-code_1", "<synthetic-code>", "C".repeat(200),
  ])("preserves an opaque text campaign code exactly rather than imposing URL/identifier syntax: %s", (name) => {
    expect(readCampaignLinkRecords(envelope([row({ id: name, name })]))).toEqual([row({ id: name, name })]);
  });

  it("does not merge distinct case, whitespace, or Unicode spellings of opaque codes", () => {
    const rows = ["Synthetic", "synthetic", " Synthetic ", "Café", "Cafe\u0301"].map((name) => row({ id: name, name }));
    expect(readCampaignLinkRecords(envelope(rows))).toEqual(rows);
  });

  it.each([
    "Link issued 2026-01-01", "Link issued 2026-12-31", "Link issued 2026-04-30",
    "Link issued 2024-02-29", "Link issued 2000-02-29", "Link issued 1900-02-28",
  ])("accepts a real exact issued date without deriving a schedule: %s", (window) => {
    expect(readCampaignLinkRecords(envelope([row({ window })]))?.[0].window).toBe(window);
  });
});

describe("campaign-link DTO schema and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "campaigns", [], [row()], {}, { campaigns: [] },
    { ok: false, campaigns: [] }, { ok: "true", campaigns: [] }, { ok: 1, campaigns: [] },
    { ok: true, campaigns: {} }, { ok: true, campaigns: "none" }, { ok: true, campaigns: undefined }, { ok: true, rows: [] },
  ])("rejects malformed envelopes rather than fabricating empty records: %j", (value) => {
    expect(readCampaignLinkRecords(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "campaign", [], {}])("rejects malformed campaign row %j", (value) => {
    expect(readCampaignLinkRecords(envelope([value]))).toBeNull();
  });

  it("requires own envelope fields", () => {
    expect(readCampaignLinkRecords(Object.assign(Object.create({ ok: true }), { campaigns: [] }))).toBeNull();
    expect(readCampaignLinkRecords(Object.assign(Object.create({ campaigns: [] }), { ok: true }))).toBeNull();
    expect(readCampaignLinkRecords(Object.create(envelope([])))).toBeNull();
  });

  it.each(requiredFields)("requires an own %s field, including nullable window", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readCampaignLinkRecords(envelope([missing]))).toBeNull();
    expect(readCampaignLinkRecords(envelope([inherited]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["partnerId", "synthetic-partner"], ["memberId", "synthetic-member"],
    ["identity", { name: "Synthetic Person" }], ["token", "synthetic-not-a-token"], ["signedUrl", "https://fixture.invalid/synthetic"],
    ["canRequest", true], ["canManage", true], ["approved", true], ["scheduledAt", null],
    ["conversions", 1], ["revenueCents", 100], ["currentEligibility", true], ["complete", true],
  ])("rejects extra %s data on the envelope or a row", (field, value) => {
    expect(readCampaignLinkRecords({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readCampaignLinkRecords(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it.each(["", " ", "\u00a0", "C".repeat(201), null, undefined, false, 0, {}, []])("rejects invalid code/name text %j without coercion", (name) => {
    expect(readCampaignLinkRecords(envelope([row({ id: name, name })]))).toBeNull();
  });

  it("rejects every C0 control and DEL embedded in otherwise valid code text", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      const name = `Synthetic${String.fromCharCode(code)}Campaign`;
      expect(readCampaignLinkRecords(envelope([row({ id: name, name })]))).toBeNull();
    }
  });

  it.each(["different-code", "synthetic campaign one", " Synthetic Campaign One", "Synthetic%20Campaign%20One", null, undefined, 1, {}, []])("requires exact id/name binding, not normalized equivalence: %j", (id) => {
    expect(readCampaignLinkRecords(envelope([row({ id })]))).toBeNull();
  });

  it.each([
    "approved", "scheduled", "active", "pending", "submitted", "completed", "revoked", "issued",
    "Link issued", "LINK ISSUED", "link issued ", " link revoked", "toString", "constructor", "__proto__", null, undefined, false, 0, {}, [],
  ])("rejects unknown or noncanonical state %j", (status) => {
    expect(readCampaignLinkRecords(envelope([row({ status })]))).toBeNull();
  });

  it.each([
    undefined, "", "2026-09-07", "link issued 2026-09-07", "Link revoked 2026-09-07", "Scheduled 2026-09-07",
    "Link issued 2026-02-29", "Link issued 2024-02-30", "Link issued 1900-02-29", "Link issued 2100-02-29",
    "Link issued 2026-04-31", "Link issued 2026-09-31", "Link issued 2026-01-00", "Link issued 2026-00-01", "Link issued 2026-13-01",
    "Link issued 2026-9-07", "Link issued 2026-09-7", "Link issued 26-09-07", "Link issued 2026-09-07T00:00:00Z",
    "Link issued 2026-09-07 to 2026-09-30", " Link issued 2026-09-07", "Link issued 2026-09-07 ",
    "Link issued 2026-09-07\n", "Link issued 2026-09-07\u0000", false, 0, {}, [],
  ])("rejects noncanonical or impossible issued window %j", (window) => {
    expect(readCampaignLinkRecords(envelope([row({ window })]))).toBeNull();
  });

  it("rejects duplicate codes instead of merging issuance/revocation facts", () => {
    expect(readCampaignLinkRecords(envelope([
      row(), row({ status: "link revoked", window: "Link issued 2026-08-01" }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the entire response when row %s is malformed", (invalidIndex) => {
    const rows = [row(), row({ id: "Synthetic Second", name: "Synthetic Second" })];
    rows[invalidIndex] = { ...rows[invalidIndex], status: "approved" };
    expect(readCampaignLinkRecords(envelope(rows))).toBeNull();
  });
});

describe("existing trim-only campaign request draft", () => {
  const draft = () => ({ name: "Synthetic Request", timeframe: "When materials are ready", description: "Synthetic proposal text" });

  it("trims all three required fields into a new exact body without mutating frozen input", () => {
    const source = Object.freeze({ name: "  Synthetic Request  ", timeframe: "\tWhen materials are ready\n", description: " \nSynthetic proposal text\t " });
    const before = JSON.stringify(source);
    const result = prepareCampaignRequest(source);
    expect(result).toEqual({ body: draft() });
    expect("body" in result && result.body).not.toBe(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(["name", "timeframe", "description"] as const)("requires nonblank trimmed %s without manufacturing a value", (field) => {
    for (const blank of ["", " ", "\t\r\n", "\u00a0"]) {
      expect(prepareCampaignRequest({ ...draft(), [field]: blank })).toEqual({ error: "Please fill in the campaign name, timeframe, and description." });
    }
  });

  it("projects only the three existing request fields, not injected permissions or workflow state", () => {
    const source = { ...draft(), partnerId: "synthetic-partner", approved: true, status: "scheduled", canRequest: true };
    expect(prepareCampaignRequest(source)).toEqual({ body: draft() });
  });

  it("adds no response-code or intake length limits to the existing required draft", () => {
    const source = { name: "N".repeat(201), timeframe: "T".repeat(1001), description: "D".repeat(5001) };
    expect(prepareCampaignRequest(source)).toEqual({ body: source });
  });

  it("preserves opaque timeframe, URL-like text, and internal whitespace rather than parsing or normalizing them", () => {
    const source = {
      name: "Synthetic  campaign\nrequest",
      timeframe: "After synthetic review, not a date / 2026-02-30",
      description: "Synthetic draft\nhttps://fixture.invalid/Path?Token=Ab_C-1#Fragment\n  Spacing preserved",
    };
    expect(prepareCampaignRequest(source)).toEqual({ body: source });
  });
});
