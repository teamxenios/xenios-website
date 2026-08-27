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

  it("drops entries with unknown base statuses instead of repairing them", () => {
    const dir = withConfig(
      JSON.stringify({
        entries: [
          { key: "good", baseStatus: "request_only", groupId: null },
          { key: "bad", baseStatus: "totally_live_trust_me", groupId: null },
          { key: "", baseStatus: "live", groupId: null },
        ],
      }),
    );
    const projection = loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json");
    expect(projection.statuses).toEqual({ good: "request_only" });
  });

  it("throws on an unreadable config rather than answering permissively", () => {
    const dir = withConfig("{not json");
    expect(() => loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json")).toThrow();
  });

  it("a groupId with no overlay entry leaves the reviewed base untouched", () => {
    const dir = withConfig(
      JSON.stringify({
        entries: [{ key: "mapped", baseStatus: "request_only", groupId: "GRP-9999" }],
      }),
    );
    const projection = loadCatalogPriorityProjection(dir, emptyOverlay, "projection.json");
    expect(projection.statuses["mapped"]).toBe("request_only");
  });
});
