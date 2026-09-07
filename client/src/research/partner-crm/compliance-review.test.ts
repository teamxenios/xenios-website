import { describe, expect, it } from "vitest";
import { CONTENT_REVIEW_LABELS, prepareComplianceDraft, readComplianceReview } from "./compliance-review";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "content-SYNTHETIC_One.1",
  title: "Synthetic draft for content review",
  submittedAt: "2026-09-07",
  status: "submitted",
  ...patch,
});
const envelope = (submissions: unknown = [row()]) => ({ ok: true, submissions });
const draft = (patch: Partial<{ title: string; link: string; description: string }> = {}) => ({
  title: "Synthetic content title",
  link: "https://drafts.fixture.invalid/synthetic",
  description: "Synthetic description of the proposed content.",
  ...patch,
});
const statuses = ["submitted", "approved", "declined", "expired", "withdrawn"] as const;
const requiredFields = ["id", "title", "submittedAt", "status"];

describe("existing content-review history projection", () => {
  it("copies exact history fields without aliasing, mutating, sorting, or deriving permission", () => {
    const sourceRows = Object.freeze([
      Object.freeze(row({ id: "synthetic-later", submittedAt: "2026-09-07", status: "approved" })),
      Object.freeze(row({ id: "synthetic-undated", submittedAt: null, status: "expired" })),
      Object.freeze(row({ id: "synthetic-earlier", submittedAt: "2026-08-01", status: "withdrawn" })),
    ]);
    const source = Object.freeze(envelope(sourceRows));
    const before = JSON.stringify(source);
    const result = readComplianceReview(source);
    expect(result).toEqual(sourceRows);
    expect(result).not.toBe(sourceRows);
    for (let index = 0; index < sourceRows.length; index++) expect(result![index]).not.toBe(sourceRows[index]);
    expect(result?.map(({ id }) => id)).toEqual(["synthetic-later", "synthetic-undated", "synthetic-earlier"]);
    expect(Object.keys(result![0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("pins all five wire states, including expired but excluding raw database aliases", () => {
    expect(Object.keys(CONTENT_REVIEW_LABELS)).toEqual(statuses);
  });

  it.each(statuses)("preserves the exact reported %s state", (status) => {
    expect(readComplianceReview(envelope([row({ status })]))).toEqual([row({ status })]);
  });

  it("distinguishes an explicit empty response from unreadable history", () => {
    expect(readComplianceReview(envelope([]))).toEqual([]);
    expect(readComplianceReview({ ok: true })).toBeNull();
    expect(readComplianceReview(envelope(null))).toBeNull();
  });

  it("preserves explicit null submittedAt but rejects missing and undefined dates", () => {
    expect(readComplianceReview(envelope([row({ submittedAt: null })]))).toEqual([row({ submittedAt: null })]);
    const missing: Record<string, unknown> = row();
    delete missing.submittedAt;
    expect(readComplianceReview(envelope([missing]))).toBeNull();
    expect(readComplianceReview(envelope([row({ submittedAt: undefined })]))).toBeNull();
  });

  it("preserves valid title spelling and the exact ID/title bounds", () => {
    const sourceRows = [
      row({ id: "0", title: "  Synthetic title • retained verbatim  " }),
      row({ id: "A".repeat(192), title: "T".repeat(200) }),
      row({ id: "Content-Mixed_Case.1" }), row({ id: "content-mixed_case.1" }),
    ];
    expect(readComplianceReview(envelope(sourceRows))).toEqual(sourceRows);
  });

  it.each(["2026-01-01", "2026-12-31", "2026-02-28", "2024-02-29", "2000-02-29", "2026-04-30"])("accepts real submitted calendar date %s", (submittedAt) => {
    expect(readComplianceReview(envelope([row({ submittedAt })]))?.[0].submittedAt).toBe(submittedAt);
  });
});

describe("content-review response boundary", () => {
  it.each([
    null, undefined, false, 0, "submissions", [], [row()], {}, { submissions: [] },
    { ok: false, submissions: [] }, { ok: "true", submissions: [] }, { ok: 1, submissions: [] },
    { ok: true, submissions: {} }, { ok: true, submissions: "none" }, { ok: true, rows: [] },
  ])("refuses malformed envelope %j", (value) => {
    expect(readComplianceReview(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "submission", [], {}])("refuses malformed history row %j", (value) => {
    expect(readComplianceReview(envelope([value]))).toBeNull();
  });

  it.each(requiredFields)("requires each row's own %s field", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readComplianceReview(envelope([missing]))).toBeNull();
    expect(readComplianceReview(envelope([inherited]))).toBeNull();
  });

  it("requires the exact own envelope fields", () => {
    expect(readComplianceReview(Object.assign(Object.create({ ok: true }), { submissions: [] }))).toBeNull();
    expect(readComplianceReview(Object.assign(Object.create({ submissions: [] }), { ok: true }))).toBeNull();
    expect(readComplianceReview(Object.create(envelope([])))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["name", "Synthetic Person"],
    ["memberId", "synthetic-member"], ["partnerId", "synthetic-partner"],
    ["contact", { email: "person@fixture.invalid" }], ["privateNotes", "synthetic-private-note"],
    ["approvedWording", "Synthetic approved wording"], ["expiresAt", "2027-01-01"],
    ["canPublish", true], ["link", "https://drafts.fixture.invalid/private"],
  ])("refuses extra %s data at both envelope and row boundaries", (field, value) => {
    expect(readComplianceReview({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readComplianceReview(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it("rejects unsafe or oversized IDs without decoding or coercing them", () => {
    for (const id of ["", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb", "a\n", "a\u0000", "é-id", "A".repeat(193), null, 1, {}, []]) {
      expect(readComplianceReview(envelope([row({ id })]))).toBeNull();
    }
  });

  it("requires a nonblank bounded title without control characters", () => {
    for (const title of ["", "   ", "T".repeat(201), "synthetic\ntext", "synthetic\rtext", "synthetic\ttext", "synthetic\u0000text", "synthetic\u001ftext", "synthetic\u007ftext", null, 1, {}, []]) {
      expect(readComplianceReview(envelope([row({ title })]))).toBeNull();
    }
  });

  it.each([
    "2026-02-29", "2024-02-30", "2026-02-31", "1900-02-29", "2100-02-29",
    "2026-04-31", "2026-09-31", "2026-01-00", "2026-00-01", "2026-13-01",
    "2026-1-01", "2026-01-1", "26-01-01", "02026-01-01", "2026/01/01",
    "2026-09-07T00:00:00Z", " 2026-09-07", "2026-09-07 ", "2026-09-07\n",
    "2026-09-07\u0000", "not-a-date", "", 0, {},
  ])("refuses impossible or noncanonical submitted date %j", (submittedAt) => {
    expect(readComplianceReview(envelope([row({ submittedAt })]))).toBeNull();
  });

  it("rejects raw database aliases and arbitrary states instead of silently remapping them", () => {
    for (const status of ["preapproved", "rejected", "APPROVED", "approved ", "pending", "", "constructor", "toString", "__proto__", null, 1, {}]) {
      expect(readComplianceReview(envelope([row({ status })]))).toBeNull();
    }
  });

  it("rejects duplicate IDs even when titles, dates, or states differ", () => {
    expect(readComplianceReview(envelope([
      row(), row({ title: "Other synthetic title", submittedAt: null, status: "withdrawn" }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the whole history when malformed row %s accompanies a valid row", (invalidIndex) => {
    const rows: unknown[] = [row(), row({ id: "synthetic-second-submission" })];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, submittedAt: undefined };
    expect(readComplianceReview(envelope(rows))).toBeNull();
  });
});

describe("compliance draft preparation mirrors existing parseSubmission", () => {
  it("trims the three fields and returns only the existing POST body without changing the draft", () => {
    const source = Object.freeze({
      ...draft({ title: " \tSynthetic title \n", description: " \nSynthetic description\t ", link: "  https://drafts.fixture.invalid/synthetic  " }),
      unrelatedPrivateField: "synthetic-not-forwarded",
    });
    const before = JSON.stringify(source);
    const result = prepareComplianceDraft(source);
    expect(result).toEqual({ body: {
      title: "Synthetic title",
      description: "Synthetic description",
      link: "https://drafts.fixture.invalid/synthetic",
    } });
    expect(JSON.stringify(source)).toBe(before);
    if ("body" in result) expect(result.body).not.toBe(source);
  });

  it.each(["", " ", "\n\t\r "])("maps blank draft link %j to null", (link) => {
    const source = draft({ link });
    expect(prepareComplianceDraft(source)).toEqual({ body: { ...source, link: null } });
  });

  it("accepts exact field limits after trimming surrounding whitespace", () => {
    const expected = { title: "T".repeat(200), description: "D".repeat(5000), link: "L".repeat(500) };
    expect(prepareComplianceDraft({ title: ` ${expected.title} `, description: `\n${expected.description}\n`, link: `\t${expected.link}\t` })).toEqual({ body: expected });
  });

  it.each([
    { title: "T".repeat(201) }, { description: "D".repeat(5001) }, { link: "L".repeat(501) },
  ])("rejects an over-limit field without truncating it: %j", (patch) => {
    const result = prepareComplianceDraft(draft(patch));
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("body");
  });

  it.each([
    { title: "" }, { title: " \n\t " }, { description: "" }, { description: " \n\t " },
  ])("requires both nonblank title and description: %j", (patch) => {
    const result = prepareComplianceDraft(draft(patch));
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("body");
  });

  it.each([
    "https://DRAFTS.fixture.invalid:443/before/../content?version=SYNTHETIC#draft",
    "/relative/synthetic-draft", "draft text rather than a URL", "mailto:person@fixture.invalid",
    "javascript:void(0)",
  ])("preserves opaque draft-link POST data without adding URL policy: %s", (link) => {
    // These strings are only submitted data, never navigation or fetch targets.
    expect(prepareComplianceDraft(draft({ link: ` ${link} ` }))).toEqual({ body: draft({ link }) });
  });

  it("preserves internal whitespace and multiline description under the route's trim-only contract", () => {
    const source = draft({
      title: "Synthetic  title",
      description: "First synthetic paragraph.\n\nSecond synthetic paragraph.\tDetail retained.",
      link: "synthetic draft link with spaces",
    });
    expect(prepareComplianceDraft(source)).toEqual({ body: source });
  });
});
