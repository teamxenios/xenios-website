import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadCatalogPriorityProjection } from "./catalog-projection";

describe("catalog-priority projection (shipped config)", () => {
  const projection = loadCatalogPriorityProjection(process.cwd());

  it("resolves exactly the nine reviewed demand keys", () => {
    expect(Object.keys(projection.statuses).sort()).toEqual([
      "aod-motsc-tesa-ipa",
      "bpc157-tb500-15-15",
      "cjc1295-ipamorelin",
      "dsip",
      "igf1-lr3",
      "melanotan-2",
      "nad-plus",
      "retatrutide",
      "ta1-kpv-ll37",
    ]);
  });

  it("projects the provider 4-way blend through its verbal overlay entry", () => {
    // GRP-0008 is verbal-only in the shipped overlay: never live, never
    // orderable, and MORE cautious than the provider_required base.
    expect(projection.statuses["aod-motsc-tesa-ipa"]).toBe(
      "verbally_confirmed_pending_documentation",
    );
  });

  it("keeps the released categories live and the registry categories request-only", () => {
    expect(projection.statuses["dsip"]).toBe("live");
    expect(projection.statuses["nad-plus"]).toBe("live");
    for (const key of [
      "bpc157-tb500-15-15",
      "melanotan-2",
      "retatrutide",
      "ta1-kpv-ll37",
      "cjc1295-ipamorelin",
      "igf1-lr3",
    ]) {
      expect(projection.statuses[key]).toBe("request_only");
    }
  });

  it("carries the 13-item activation queue with audited statuses", () => {
    expect(projection.queue).toHaveLength(13);
    const byKey = new Map(projection.queue.map((item) => [item.key, item.status]));
    // Verbal queue items project documentation-pending; basis-none items are
    // unavailable. Both are structurally non-orderable.
    expect(byKey.get("Q-2026-08-26-01")).toBe("verbally_confirmed_pending_documentation");
    expect(byKey.get("Q-2026-08-26-11")).toBe("unavailable");
    expect(byKey.get("Q-2026-08-26-12")).toBe("unavailable");
    expect(byKey.get("Q-2026-08-26-13")).toBe("unavailable");
    expect(projection.queue.filter((item) => item.status === "verbally_confirmed_pending_documentation")).toHaveLength(10);
  });

  it("serializes statuses only — no counts, provenance, or checklist content", () => {
    const wire = JSON.stringify(projection);
    for (const forbidden of ["demandMentions", "confirmedBy", "confirmedAt", "checklist", "Kris", "basis"]) {
      expect(wire).not.toContain(forbidden);
    }
  });
});

describe("catalog-priority projection (fail-closed parsing)", () => {
  function withConfig(json: string) {
    const dir = mkdtempSync(join(tmpdir(), "catalog-priority-"));
    writeFileSync(join(dir, "projection.json"), json);
    return dir;
  }
  const emptyOverlay = { recordedOn: "2026-08-27", entries: [], queue: [] } as const;

  function config(entries: readonly unknown[], overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      recordedOn: "2026-08-27",
      entries,
      ...overrides,
    };
  }

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      key: "fixture",
      baseStatus: "request_only",
      groupId: null,
      evidence: "Fixture evidence",
      ...overrides,
    };
  }

  it("rejects unknown base statuses or blank keys instead of dropping them", () => {
    const dir = withConfig(
      JSON.stringify(config([entry({ baseStatus: "totally_live_trust_me" })])),
    );
    expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow(
      /baseStatus/,
    );

    const blankDir = withConfig(JSON.stringify(config([entry({ key: "" })])));
    expect(() => loadCatalogPriorityProjection(blankDir, emptyOverlay, "projection.json")).toThrow(
      /entries\[0\]\.key/,
    );
  });

  it("throws on an unreadable config rather than answering permissively", () => {
    const dir = withConfig("{not json");
    expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow();
  });

  it("a mapped groupId must join exactly one overlay entry", () => {
    const dir = withConfig(
      JSON.stringify(config([entry({ key: "mapped", groupId: "GRP-9999" })])),
    );
    expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow(
      /has no overlay entry/,
    );
  });

  it("rejects ambiguous overlay joins even when an injected overlay bypasses the file parser", () => {
    const overlayEntry = {
      groupId: "GRP-0001",
      label: "Fixture",
      confirmationBasis: "verbal",
      confirmedBy: "Fixture partner",
      confirmedAt: "2026-08-27T00:00:00.000Z",
      checklist: {
        exactFormulation: null,
        exactStrength: null,
        dosageForm: null,
        pharmacyLane: null,
        stateAvailability: null,
        providerRequirements: null,
        pharmacyPricing: null,
        turnaround: null,
        shippingModel: null,
        documentationTesting: null,
        contractingApproval: null,
      },
      founderActivationApproval: null,
      held: false,
    } as const;
    const ambiguous = {
      recordedOn: "2026-08-27",
      entries: [overlayEntry, { ...overlayEntry, label: "Duplicate" }],
      queue: [],
    } as const;
    const dir = withConfig(
      JSON.stringify(config([entry({ groupId: "GRP-0001" })])),
    );
    expect(() => loadCatalogPriorityProjection(dir, ambiguous, "projection.json")).toThrow(
      /ambiguous/,
    );
  });

  it("rejects duplicate projection keys and exact-vocabulary violations", () => {
    for (const invalid of [
      config([entry(), entry({ evidence: "Second evidence" })]),
      config([entry({ unexpected: true })]),
      config([entry({ evidence: 7 })]),
      config([entry()], { unexpected: true }),
      config([entry()], { schemaVersion: 2 }),
      config([entry()], { recordedOn: "2026-02-30" }),
    ]) {
      const dir = withConfig(JSON.stringify(invalid));
      expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow();
    }
  });

  it("requires the entries section instead of defaulting it empty", () => {
    const invalid: Record<string, unknown> = config([]);
    delete invalid.entries;
    const dir = withConfig(JSON.stringify(invalid));
    expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow(
      /required field/,
    );
  });

  it("never lets config approval resolve a mapped live base live", () => {
    const documented = {
      groupId: "GRP-0001",
      label: "Fixture",
      confirmationBasis: "documented",
      confirmedBy: "Fixture partner",
      confirmedAt: "2026-08-27T00:00:00.000Z",
      checklist: {
        exactFormulation: "evidence",
        exactStrength: "evidence",
        dosageForm: "evidence",
        pharmacyLane: "evidence",
        stateAvailability: "evidence",
        providerRequirements: "evidence",
        pharmacyPricing: "evidence",
        turnaround: "evidence",
        shippingModel: "evidence",
        documentationTesting: "evidence",
        contractingApproval: "evidence",
      },
      founderActivationApproval: {
        approvedBy: "Founder",
        approvedAt: "2026-08-27T00:00:00.000Z",
      },
      held: false,
    } as const;
    const overlay = { recordedOn: "2026-08-27", entries: [documented], queue: [] } as const;
    const dir = withConfig(
      JSON.stringify(config([entry({ baseStatus: "live", groupId: "GRP-0001" })])),
    );
    expect(loadCatalogPriorityProjection(dir, overlay, "projection.json").statuses.fixture).toBe(
      "pending_pharmacy_activation",
    );
  });
});
