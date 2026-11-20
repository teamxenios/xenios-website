import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DiscoveryCatalogFact } from "./contract";
import { conditionHolds, evaluateDiscovery, nextQuestions, parseAnswer, resolveAnswers } from "./evaluate";
import {
  FIXTURE_DATASET, SLICE_QUESTIONS, answered, liveSliceManifest, skipped, sliceManifest, syntheticBinding,
} from "./__fixtures__/slice-manifest";

const fact = (offeringId: string, variantId: string, extra: Partial<DiscoveryCatalogFact> = {}): DiscoveryCatalogFact => ({
  offeringId, variantId, visible: true, held: false, pathways: ["personal_wellness"], ...extra,
});
const opts = { catalogDatasetSha256: FIXTURE_DATASET };
const personal = { pathway: answered("personal_wellness") };
const question = (id: string) => SLICE_QUESTIONS.find(entry => entry.id === id)!;

describe("the 2026-11-20 draft as supplied", () => {
  it("is inert: every question is disabled, so no goal is selected and the full catalog stays available", () => {
    const result = evaluateDiscovery(sliceManifest(), { ...personal, goals: answered("sleep") }, [fact("mo_a", "mov_a")], opts);
    expect(result.state).toBe("matches");
    expect(result.selectedGoalIds).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.warnings).toContain("answers_dropped");
    expect(result.fullCatalogAvailable).toBe(true);
  });

  it("T16: with no reviewed mapping, each slice goal is unresolved and nothing is substituted", () => {
    const result = evaluateDiscovery(liveSliceManifest(), { ...personal, goals: answered("sleep", "weight_management", "recovery") }, [fact("mo_a", "mov_a")], opts);
    expect(result.matches).toEqual([]);
    expect(result.unresolvedGoals).toEqual([
      { goalId: "sleep", reason: "no_reviewed_mapping" },
      { goalId: "weight_management", reason: "no_reviewed_mapping" },
      { goalId: "recovery", reason: "no_reviewed_mapping" },
    ]);
    expect(result.fullCatalogAvailable).toBe(true);
  });
});

describe("answers are parsed strictly", () => {
  it.each([
    [undefined], [null], ["sleep"], [["sleep"]], [{}], [{ state: "answered" }], [{ state: "answered", optionIds: [] }],
    [{ state: "answered", optionIds: ["nope"] }], [{ state: "answered", optionIds: ["sleep", "sleep"] }],
    [{ state: "answered", optionIds: ["sleep"], note: "x" }], [{ state: "maybe", optionIds: ["sleep"] }],
  ])("rejects %j as invalid", raw => {
    expect(parseAnswer(question("goals"), raw).state).toBe("invalid");
  });

  it("rejects two choices on a single-select question", () => {
    expect(parseAnswer(question("sleep_context"), answered("learn_options", "compare_products")).state).toBe("invalid");
  });

  it("T08: an exclusive option combined with another is conflicting, never silently trimmed", () => {
    expect(parseAnswer(question("product_types"), answered("all_relevant", "supplements")).state).toBe("conflicting");
    expect(parseAnswer(question("product_types"), answered("unsure", "supplements")).state).toBe("conflicting");
    expect(parseAnswer(question("product_types"), answered("supplements", "topicals"))).toEqual(answered("supplements", "topicals"));
  });

  it("normalizes unsure to not_sure (keeping the id) and prefer_not to skipped", () => {
    expect(parseAnswer(question("sleep_hours"), answered("unsure"))).toEqual({ state: "not_sure", optionIds: ["unsure"] });
    expect(parseAnswer(question("sleep_hours"), answered("prefer_not"))).toEqual({ state: "skipped", optionIds: [] });
    expect(parseAnswer(question("sleep_hours"), skipped())).toEqual({ state: "skipped", optionIds: [] });
  });

  it("over the question's selection limit is invalid", () => {
    expect(parseAnswer(question("priority_goals"), answered("sleep", "recovery", "gut", "focus")).state).toBe("invalid");
  });
});

describe("display conditions treat unknown as not true", () => {
  it("a skipped or missing parent never satisfies a condition", () => {
    const condition = { questionId: "goals", operator: "contains", value: "sleep" } as const;
    expect(conditionHolds(condition, {})).toBe(false);
    expect(conditionHolds(condition, { goals: { state: "skipped", optionIds: [] } })).toBe(false);
    expect(conditionHolds(condition, { goals: { state: "answered", optionIds: ["sleep"] } })).toBe(true);
  });

  it("an explicit not-sure pathway opens the goals question, as the draft names it", () => {
    const resolved = resolveAnswers(liveSliceManifest(), { pathway: answered("unsure") });
    expect(resolved.answers.pathway).toEqual({ state: "not_sure", optionIds: ["unsure"] });
    expect(resolved.applicable).toContain("goals");
  });
});

describe("branches and invalidation", () => {
  it("T03: three goals open their follow-ups; shared questions appear once", () => {
    const resolved = resolveAnswers(liveSliceManifest(), { ...personal, goals: answered("sleep", "recovery", "weight_management") });
    const next = nextQuestions(liveSliceManifest(), resolved);
    expect(new Set(next).size).toBe(next.length);
    for (const id of ["weight_focus", "weight_approach", "sleep_focus", "sleep_context", "recovery_context", "recovery_focus", "priority_goals"]) {
      expect(next).toContain(id);
    }
    expect(next).not.toContain("sleep_hours");
  });

  it("T04: priority goals order the follow-ups; the budget caps goal follow-ups only", () => {
    const manifest = liveSliceManifest({ limits: { ...liveSliceManifest().limits, followUpBudget: 2 } });
    const resolved = resolveAnswers(manifest, { ...personal, goals: answered("sleep", "recovery", "weight_management"), priority_goals: answered("recovery") });
    const next = nextQuestions(manifest, resolved);
    expect(next.filter(id => SLICE_QUESTIONS.find(entry => entry.id === id)!.goalId !== null)).toEqual(["recovery_context", "recovery_focus"]);
    expect(next).toContain("audience");
  });

  it("T05: a priority outside the chosen goals is dropped; nothing is added implicitly", () => {
    const resolved = resolveAnswers(liveSliceManifest(), { ...personal, goals: answered("sleep", "recovery"), priority_goals: answered("energy") });
    expect(resolved.answers.priority_goals).toBeUndefined();
    expect(resolved.dropped).toContainEqual({ questionId: "priority_goals", state: "invalid" });
    const single = resolveAnswers(liveSliceManifest(), { ...personal, goals: answered("sleep"), priority_goals: answered("sleep") });
    expect(single.dropped).toContainEqual({ questionId: "priority_goals", state: "not_applicable" });
  });

  it("T06: removing a goal erases its follow-ups, deeper ones included", () => {
    const raw = {
      ...personal, audience: answered("self"), detail_preference: answered("deeper"),
      goals: answered("recovery"), sleep_focus: answered("routine"), sleep_hours: answered("under_4"),
    };
    const resolved = resolveAnswers(liveSliceManifest(), raw);
    expect(resolved.answers.sleep_focus).toBeUndefined();
    expect(resolved.answers.sleep_hours).toBeUndefined();
    expect(resolved.dropped.map(entry => entry.questionId).sort()).toEqual(["sleep_focus", "sleep_hours"]);
  });

  it("T07: a skipped deeper answer does not narrow results", () => {
    const manifest = liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a")] });
    const base = { ...personal, audience: answered("self"), detail_preference: answered("deeper"), goals: answered("sleep") };
    const withSkip = evaluateDiscovery(manifest, { ...base, sleep_hours: skipped() }, [fact("mo_a", "mov_a")], opts);
    const without = evaluateDiscovery(manifest, base, [fact("mo_a", "mov_a")], opts);
    expect(withSkip.matches).toEqual(without.matches);
    expect(withSkip.matches).toHaveLength(1);
  });

  it("T11: switching to laboratory research clears every personal goal branch", () => {
    const raw = { pathway: answered("laboratory_research"), goals: answered("sleep"), sleep_focus: answered("routine"), product_types: answered("supplements") };
    const resolved = resolveAnswers(liveSliceManifest(), raw);
    expect(Object.keys(resolved.answers)).toEqual(["pathway"]);
    expect(resolved.applicable).toEqual(expect.arrayContaining(["laboratory_materials", "laboratory_documents"]));
    const result = evaluateDiscovery(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a")] }), raw, [fact("mo_a", "mov_a")], opts);
    expect(result.selectedGoalIds).toEqual([]);
    expect(result.matches).toEqual([]);
  });
});

describe("matching", () => {
  const catalog = [fact("mo_a", "mov_a"), fact("mo_b", "mov_b"), fact("mo_c", "mov_c", { format: "powder" })];
  const bindings = [
    syntheticBinding("sleep", "mo_a", "mov_a"),
    syntheticBinding("recovery", "mo_a", "mov_a"),
    syntheticBinding("recovery", "mo_b", "mov_b"),
    syntheticBinding("weight_management", "mo_c", "mov_c"),
  ];

  it("T03: several goals give a deduplicated union, not an intersection", () => {
    const result = evaluateDiscovery(liveSliceManifest({ bindings }), { ...personal, goals: answered("sleep", "recovery") }, catalog, opts);
    expect(result.matches.map(match => match.variantId)).toEqual(["mov_a", "mov_b"]);
    expect(result.matches[0].goalIds).toEqual(["sleep", "recovery"]);
    expect(result.unresolvedGoals).toEqual([]);
  });

  it("T13: a held item never matches a goal, even with an approved binding", () => {
    const held = catalog.map(entry => entry.variantId === "mov_a" ? { ...entry, held: true } : entry);
    const result = evaluateDiscovery(liveSliceManifest({ bindings }), { ...personal, goals: answered("sleep") }, held, opts);
    expect(result.matches).toEqual([]);
    expect(result.unresolvedGoals).toEqual([{ goalId: "sleep", reason: "no_reviewed_mapping" }]);
  });

  it("an invisible item or a disabled binding never matches", () => {
    const disabled = [
      syntheticBinding("sleep", "mo_a", "mov_a", { reviewStatus: "DRAFT", runtimeEnabled: false }),
      syntheticBinding("sleep", "mo_b", "mov_b", { runtimeEnabled: false }),
    ];
    const result = evaluateDiscovery(liveSliceManifest({ bindings: disabled }), { ...personal, goals: answered("sleep") }, catalog, opts);
    expect(result.state).toBe("matches");
    expect(result.matches).toEqual([]);
    const hidden = evaluateDiscovery(liveSliceManifest({ bindings }), { ...personal, goals: answered("sleep") }, catalog.map(entry => ({ ...entry, visible: false })), opts);
    expect(hidden.state).toBe("matches");
    expect(hidden.matches).toEqual([]);
  });

  it("a live binding without approval, or for another dataset, makes the whole manifest unavailable", () => {
    for (const extra of [{ reviewStatus: "DRAFT" }, { catalogDatasetSha256: "f".repeat(64) }, { evidenceIds: [] }]) {
      const result = evaluateDiscovery(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a", extra)] }), { ...personal, goals: answered("sleep") }, catalog, opts);
      expect(result).toMatchObject({ state: "unavailable", matches: [], warnings: ["manifest_invalid"] });
    }
  });

  it("T21: a format preference reorders within a goal but never removes; only the explicit filter excludes", () => {
    const sameGoal = [syntheticBinding("recovery", "mo_a", "mov_a"), syntheticBinding("recovery", "mo_c", "mov_c")];
    const base = { ...personal, goals: answered("recovery") };
    const plain = evaluateDiscovery(liveSliceManifest({ bindings: sameGoal }), base, catalog, opts);
    expect(plain.matches.map(match => match.variantId)).toEqual(["mov_a", "mov_c"]);
    const preferred = evaluateDiscovery(liveSliceManifest({ bindings: sameGoal }), { ...base, format_preference: answered("powder") }, catalog, opts);
    expect(preferred.matches.map(match => match.variantId)).toEqual(["mov_c", "mov_a"]);
    expect(preferred.appliedFilters.formats).toEqual([]);
    const filtered = evaluateDiscovery(liveSliceManifest({ bindings: sameGoal }), base, catalog, { ...opts, onlyFormats: ["powder"] });
    expect(filtered.matches.map(match => match.variantId)).toEqual(["mov_c"]);
    expect(filtered.appliedFilters.formats).toEqual(["powder"]);
  });

  it("goal priority outranks a format preference", () => {
    const raw = { ...personal, goals: answered("recovery", "weight_management"), format_preference: answered("powder") };
    const result = evaluateDiscovery(liveSliceManifest({ bindings }), raw, catalog, opts);
    expect(result.matches.map(match => match.variantId)).toEqual(["mov_a", "mov_b", "mov_c"]);
  });

  it("T17: a catalog snapshot from another dataset gives an honest unavailable view", () => {
    const result = evaluateDiscovery(liveSliceManifest({ bindings }), { ...personal, goals: answered("sleep") }, catalog, { catalogDatasetSha256: "f".repeat(64) });
    expect(result).toMatchObject({ state: "unavailable", matches: [], warnings: ["catalog_version_mismatch"], fullCatalogAvailable: true });
  });

  it("an unpublished or invalid manifest is never evaluated", () => {
    expect(evaluateDiscovery(liveSliceManifest({ status: "draft" }), personal, catalog, opts).warnings).toEqual(["manifest_not_published"]);
    expect(evaluateDiscovery(liveSliceManifest({ schemaVersion: 2 as never }), personal, catalog, opts).warnings).toEqual(["manifest_invalid"]);
  });

  it("is deterministic and does not depend on catalog order", () => {
    const raw = { ...personal, goals: answered("sleep", "recovery") };
    const forward = evaluateDiscovery(liveSliceManifest({ bindings }), raw, catalog, opts);
    const reversed = evaluateDiscovery(liveSliceManifest({ bindings: [...bindings].reverse() }), raw, [...catalog].reverse(), opts);
    expect(reversed).toEqual(forward);
    expect(forward.matches[0].reasonTemplates).toEqual(["Synthetic reason for sleep", "Synthetic reason for recovery"]);
  });
});

describe("privacy boundary", () => {
  it("a result carries no raw answers or answer-derived option ids", () => {
    const raw = { ...personal, audience: answered("self"), detail_preference: answered("deeper"), goals: answered("sleep"), sleep_hours: answered("under_4"), sleep_focus: answered("staying_asleep") };
    const text = JSON.stringify(evaluateDiscovery(liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a")] }), raw, [fact("mo_a", "mov_a")], opts));
    for (const value of ["under_4", "staying_asleep", "deeper", "personal_wellness", "optionIds"]) expect(text).not.toContain(value);
    expect(text).not.toMatch(/approvedForUser|treatmentEligible|prescriptionRecommended|price/i);
  });

  it("the discovery modules touch no URL, storage, network, logging or clock", () => {
    for (const file of ["./evaluate.ts", "./validate-manifest.ts", "./contract.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/\b(window|document|location|history|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|navigator|console|Date|Math\.random|process)\b/);
    }
  });
});
