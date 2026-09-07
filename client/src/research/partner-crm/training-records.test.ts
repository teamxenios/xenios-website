import { describe, expect, it } from "vitest";
import { readPartnerTrainingReport } from "./training-records";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "synthetic-training-Module_One.1",
  title: "Synthetic Module One",
  summary: "Synthetic reported module description",
  required: true,
  completed: false,
  completedAt: null,
  ...patch,
});
const envelope = (modules: unknown = [row()], certified: unknown = false) => ({ ok: true, modules, certified });
const requiredFields = ["id", "title", "summary", "required", "completed", "completedAt"];

describe("reported partner training projection", () => {
  it("copies only reported fields from frozen input without aliases, mutation, sorting, or invented requirements", () => {
    const modules = Object.freeze([
      Object.freeze(row({ id: "synthetic-z-new-module", completed: true, completedAt: "2026-09-07" })),
      Object.freeze(row({ id: "synthetic-a-other-module", title: "Synthetic Other Module" })),
    ]);
    const source = Object.freeze(envelope(modules, true));
    const before = JSON.stringify(source);
    const result = readPartnerTrainingReport(source);
    expect(result).toEqual({ modules, certified: true });
    expect(result).not.toBe(source);
    expect(result?.modules).not.toBe(modules);
    for (let index = 0; index < modules.length; index++) expect(result!.modules[index]).not.toBe(modules[index]);
    expect(result?.modules.map(({ id }) => id)).toEqual(["synthetic-z-new-module", "synthetic-a-other-module"]);
    expect(Object.keys(result!)).toEqual(["modules", "certified"]);
    expect(Object.keys(result!.modules[0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([true, false])("preserves certified=%s on an exact empty report without inventing module rows", (certified) => {
    expect(readPartnerTrainingReport(envelope([], certified))).toEqual({ modules: [], certified });
  });

  it("does not convert missing training data into an empty report", () => {
    expect(readPartnerTrainingReport({ ok: true, certified: false })).toBeNull();
    expect(readPartnerTrainingReport(envelope(null))).toBeNull();
  });

  it.each([
    { completed: false, completedAt: null },
    { completed: true, completedAt: null },
    { completed: true, completedAt: "2026-09-07" },
  ])("preserves permitted completion/date facts %j independently of either certification marker", (patch) => {
    for (const certified of [true, false]) {
      expect(readPartnerTrainingReport(envelope([row(patch)], certified))).toEqual({ modules: [row(patch)], certified });
    }
  });

  it("does not infer certification from all-completed modules or clear certification for incomplete modules", () => {
    const allCompleted = [row({ completed: true, completedAt: "2026-09-07" }), row({ id: "synthetic-second", completed: true })];
    expect(readPartnerTrainingReport(envelope(allCompleted, false))).toEqual({ modules: allCompleted, certified: false });
    const noneCompleted = [row(), row({ id: "synthetic-second" })];
    expect(readPartnerTrainingReport(envelope(noneCompleted, true))).toEqual({ modules: noneCompleted, certified: true });
  });

  it("accepts source-defined module IDs and duplicate titles without hardcoded module-key or title deduplication", () => {
    const modules = [row({ id: "synthetic-future-requirement" }), row({ id: "synthetic-another-requirement" })];
    expect(readPartnerTrainingReport(envelope(modules))).toEqual({ modules, certified: false });
  });

  it("preserves safe ID and raw label spelling at their maximum bounds", () => {
    const modules = [
      row({ id: "0", title: " Synthetic Éducation • 東京 ", summary: " Synthetic  summary with spaces " }),
      row({ id: "A".repeat(192), title: "T".repeat(200), summary: "S".repeat(2000) }),
      row({ id: "Module-Mixed_Case.1", title: "<Synthetic module>", summary: "Synthetic / reference?value#fragment" }),
      row({ id: "module-mixed_case.1" }),
    ];
    expect(readPartnerTrainingReport(envelope(modules))).toEqual({ modules, certified: false });
  });

  it.each(["2026-01-01", "2026-12-31", "2026-04-30", "2024-02-29", "2000-02-29", "1900-02-28"])("preserves real reported completion date %s without inferring validity or expiry", (completedAt) => {
    const modules = [row({ completed: true, completedAt })];
    expect(readPartnerTrainingReport(envelope(modules))).toEqual({ modules, certified: false });
  });
});

describe("partner training exact DTO and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "training", [], [row()], {}, { modules: [], certified: false },
    { ok: false, modules: [], certified: false }, { ok: "true", modules: [], certified: false },
    { ok: 1, modules: [], certified: false }, { ok: true, modules: {} , certified: false },
    { ok: true, modules: "none", certified: false }, { ok: true, modules: undefined, certified: false },
    { ok: true, modules: [] }, { ok: true, rows: [], certified: false },
  ])("rejects malformed envelopes without fabricating training or certification facts: %j", (value) => {
    expect(readPartnerTrainingReport(value)).toBeNull();
  });

  it.each(["ok", "modules", "certified"])("requires an own envelope %s field", (field) => {
    const missing: Record<string, unknown> = envelope();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPartnerTrainingReport(missing)).toBeNull();
    expect(readPartnerTrainingReport(inherited)).toBeNull();
  });

  it("rejects wholly inherited envelope and module rows", () => {
    expect(readPartnerTrainingReport(Object.create(envelope()))).toBeNull();
    expect(readPartnerTrainingReport(envelope([Object.create(row())]))).toBeNull();
  });

  it.each([null, undefined, false, 0, "module", [], {}])("rejects malformed module row %j", (value) => {
    expect(readPartnerTrainingReport(envelope([value]))).toBeNull();
  });

  it.each(requiredFields)("requires an own module %s field including nullable completedAt", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPartnerTrainingReport(envelope([missing]))).toBeNull();
    expect(readPartnerTrainingReport(envelope([inherited]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["partnerId", "synthetic-partner"], ["memberId", "synthetic-member"],
    ["organizationId", "synthetic-organization"], ["identity", { name: "Synthetic Person" }],
    ["token", "synthetic-not-a-token"], ["role", "admin"], ["permissions", ["synthetic-grant"]],
    ["activated", true], ["currentValidity", true], ["canCertify", true], ["canActivate", true],
    ["certifiedAt", "2026-09-07"], ["expiresAt", "2099-01-01"], ["version", "synthetic-v2"],
    ["complete", true], ["optional", false],
  ])("refuses extra %s private, permission, or unreported lifecycle data on envelope and row", (field, value) => {
    expect(readPartnerTrainingReport({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readPartnerTrainingReport(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it.each([
    "", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb",
    "a\n", "a\u0000", "é-id", "A".repeat(193), null, undefined, false, 1, {}, [],
  ])("rejects unsafe or oversized module ID %j without coercion or decoding", (id) => {
    expect(readPartnerTrainingReport(envelope([row({ id })]))).toBeNull();
  });

  it.each(["title", "summary"])("requires nonblank string %s without coercion", (field) => {
    for (const value of ["", " ", "\u00a0", null, undefined, false, 0, {}, []]) {
      expect(readPartnerTrainingReport(envelope([row({ [field]: value })]))).toBeNull();
    }
  });

  it.each([["title", 200], ["summary", 2000]] as const)("enforces the %s length bound %s and rejects all C0/DEL controls", (field, limit) => {
    expect(readPartnerTrainingReport(envelope([row({ [field]: "X".repeat(limit + 1) })]))).toBeNull();
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(readPartnerTrainingReport(envelope([row({ [field]: `Synthetic${String.fromCharCode(code)}Text` })]))).toBeNull();
    }
  });

  it.each([false, null, undefined, 0, 1, -1, "true", "false", "required", {}, []])("requires literal required:true and refuses an invented optional interpretation: %j", (required) => {
    expect(readPartnerTrainingReport(envelope([row({ required })]))).toBeNull();
  });

  it.each([null, undefined, 0, 1, -1, "true", "false", "", {}, [], Number.NaN])("refuses nonboolean completed %j without truthy/falsey coercion", (completed) => {
    expect(readPartnerTrainingReport(envelope([row({ completed })]))).toBeNull();
  });

  it.each([null, undefined, 0, 1, -1, "true", "false", "", {}, [], Number.NaN])("refuses nonboolean certified %j even with empty modules", (certified) => {
    expect(readPartnerTrainingReport({ ...envelope([]), certified })).toBeNull();
  });

  it.each([
    undefined, "", "2026-02-29", "2024-02-30", "1900-02-29", "2100-02-29", "2026-04-31", "2026-09-31",
    "2026-01-00", "2026-00-01", "2026-13-01", "2026-9-07", "2026-09-7", "26-09-07",
    "2026-09-07T00:00:00Z", "2026/09/07", "2026-09-07 to 2026-09-30", " 2026-09-07", "2026-09-07 ",
    "2026-09-07\n", "2026-09-07\u0000", "not-a-date", false, 0, {}, [],
  ])("refuses malformed or impossible completedAt %j without normalizing it", (completedAt) => {
    expect(readPartnerTrainingReport(envelope([row({ completed: true, completedAt })]))).toBeNull();
  });

  it("rejects a completion date paired with completed:false instead of upgrading or correcting it", () => {
    expect(readPartnerTrainingReport(envelope([row({ completed: false, completedAt: "2026-09-07" })]))).toBeNull();
  });

  it("rejects duplicate module IDs rather than merging completion facts", () => {
    expect(readPartnerTrainingReport(envelope([
      row(), row({ title: "Synthetic Alternate Title", completed: true, completedAt: "2026-09-07" }),
    ], true))).toBeNull();
  });

  it.each([0, 1])("rejects the full report including certification when module row %s is malformed", (invalidIndex) => {
    const modules = [row(), row({ id: "synthetic-second-module" })];
    modules[invalidIndex] = { ...modules[invalidIndex], required: false };
    expect(readPartnerTrainingReport(envelope(modules, true))).toBeNull();
  });
});
