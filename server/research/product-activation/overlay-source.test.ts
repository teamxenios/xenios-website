import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activationStatusFor, loadActivationOverlay, overlayEntryFor } from "./overlay-source";

// The real config ships in the repo; these tests pin its safety properties so
// a config edit that tries to smuggle availability in fails CI, not review.
const ROOT = process.cwd();

describe("activation overlay config (2026-08-26)", () => {
  const overlay = loadActivationOverlay(ROOT);

  it("loads the recorded entries and the 13-item activation queue", () => {
    expect(overlay.entries.length).toBeGreaterThanOrEqual(5);
    expect(overlay.queue).toHaveLength(13);
  });

  it("every entry with a verbal basis projects the verbal state, never live", () => {
    for (const entry of overlay.entries) {
      if (entry.confirmationBasis !== "verbal") continue;
      expect(activationStatusFor(overlay, entry.groupId, "live")).toBe(
        "verbally_confirmed_pending_documentation",
      );
      expect(activationStatusFor(overlay, entry.groupId, "request_only")).toBe(
        "verbally_confirmed_pending_documentation",
      );
    }
  });

  it("no entry in the shipped config is founder-approved or checklist-complete", () => {
    for (const entry of overlay.entries) {
      expect(entry.founderActivationApproval).toBeNull();
    }
  });

  it("queue items are never orderable states", () => {
    for (const item of overlay.queue) {
      expect(["verbally_confirmed_pending_documentation", "pending_pharmacy_activation", "unavailable"])
        .toContain(item.status);
    }
  });

  it("an unknown groupId leaves the base status untouched", () => {
    expect(activationStatusFor(overlay, "GRP-XXXX", "request_only")).toBe("request_only");
    expect(overlayEntryFor(overlay, "GRP-XXXX")).toBeNull();
  });

  it("an unknown groupId leaves the base because the overlay ASSERTS nothing there", () => {
    // Absence of an overlay entry means the reviewed base stands — that is
    // the correct reading of "no additional claim". Contrast with the strict
    // suite below: a PRESENT-but-unreadable claim refuses the whole load.
    expect(activationStatusFor(overlay, "GRP-NOT-RECORDED", "held")).toBe("held");
  });

  it("the queue carries the exact 13 blitz verification items", () => {
    const labels = overlay.queue.map((q) => q.label).join(" | ");
    for (const marker of [
      "Retatrutide 48 mg",
      "Wolverine",
      "IGF-1 LR3 + MOTS-C",
      "GHK-Cu + Epithalon + MOTS-C",
      "Semax + Selank 5mg/5mg",
      "BPC-157 500 mcg capsules",
      "hormone-evaluation labs",
      "Exosomes 1 oz",
      "Revive Glutathione 10 mL",
    ]) {
      expect(labels).toContain(marker);
    }
  });
});

// P1-7 (2026-08-27): malformed config FAILS CLOSED. A present-but-unreadable
// claim refuses the entire load — nothing degrades to "none", no entry is
// silently dropped, no hold is silently lost.
describe("activation overlay config — strict parsing (fail closed)", () => {
  function writeConfig(json: unknown): { root: string; rel: string } {
    const root = mkdtempSync(join(tmpdir(), "overlay-strict-"));
    const rel = "overlay.json";
    writeFileSync(join(root, rel), JSON.stringify(json), "utf8");
    return { root, rel };
  }

  const VALID_ENTRY = {
    groupId: "GRP-0001",
    label: "Fixture product",
    confirmationBasis: "verbal",
    confirmedBy: "Fixture partner",
    confirmedAt: "2026-08-27T00:00:00.000Z",
    checklist: {},
    founderActivationApproval: null,
    held: false,
  };

  it("accepts a strictly-valid config", () => {
    const { root, rel } = writeConfig({ recordedOn: "2026-08-27", entries: [VALID_ENTRY], activationQueue: [] });
    const parsed = loadActivationOverlay(root, rel);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.confirmationBasis).toBe("verbal");
  });

  it("refuses a typo'd basis instead of degrading it to none", () => {
    for (const basis of ["Verbal", "VERBAL", "documented ", "verbal​", 1, null, undefined]) {
      const { root, rel } = writeConfig({ entries: [{ ...VALID_ENTRY, confirmationBasis: basis }] });
      expect(() => loadActivationOverlay(root, rel), JSON.stringify(basis)).toThrow(/confirmationBasis/);
    }
  });

  it("refuses a non-boolean held flag instead of silently losing the hold", () => {
    for (const held of ["true", 1, "yes", null, undefined]) {
      const { root, rel } = writeConfig({ entries: [{ ...VALID_ENTRY, held }] });
      expect(() => loadActivationOverlay(root, rel), JSON.stringify(held)).toThrow(/held/);
    }
  });

  it("refuses a malformed entry instead of dropping it", () => {
    for (const entry of ["not-an-object", { ...VALID_ENTRY, groupId: "" }, { ...VALID_ENTRY, label: 7 }]) {
      const { root, rel } = writeConfig({ entries: [entry] });
      expect(() => loadActivationOverlay(root, rel)).toThrow(/malformed/);
    }
  });

  it("refuses an unreadable checklist and unknown checklist fields", () => {
    for (const checklist of ["nope", 3, ["a"], { unknownField: "x" }, { exactStrength: 5 }]) {
      const { root, rel } = writeConfig({ entries: [{ ...VALID_ENTRY, checklist }] });
      expect(() => loadActivationOverlay(root, rel)).toThrow(/checklist/);
    }
  });

  it("refuses a malformed founder approval record", () => {
    for (const approval of ["Samuel", { approvedBy: "F" }, { approvedAt: "2026-08-27" }, 7]) {
      const { root, rel } = writeConfig({ entries: [{ ...VALID_ENTRY, founderActivationApproval: approval }] });
      expect(() => loadActivationOverlay(root, rel)).toThrow(/founderActivationApproval/);
    }
  });

  it("refuses malformed queue items and non-array sections", () => {
    expect(() => {
      const { root, rel } = writeConfig({ entries: "x" });
      loadActivationOverlay(root, rel);
    }).toThrow(/entries/);
    expect(() => {
      const { root, rel } = writeConfig({ activationQueue: [{ queueId: 1, label: "x" }] });
      loadActivationOverlay(root, rel);
    }).toThrow(/queueId/);
    expect(() => {
      const { root, rel } = writeConfig({ activationQueue: [{ queueId: "Q-1", label: "x", basis: "maybe" }] });
      loadActivationOverlay(root, rel);
    }).toThrow(/confirmationBasis/);
  });
});

// P1-E (round 3): a config that CLAIMS an approval it cannot substantiate
// refuses the whole load.
describe("activation overlay config — approval evidence attacks", () => {
  function writeConfig(json) {
    const root = mkdtempSync(join(tmpdir(), "overlay-approval-"));
    const rel = "overlay.json";
    writeFileSync(join(root, rel), JSON.stringify(json), "utf8");
    return { root, rel };
  }
  const BASE_ENTRY = {
    groupId: "GRP-0001",
    label: "Fixture product",
    confirmationBasis: "documented",
    confirmedBy: "Fixture partner",
    confirmedAt: "2026-08-27T00:00:00.000Z",
    checklist: {},
    held: false,
  };

  it("refuses empty/whitespace/invalid approval evidence instead of counting it", () => {
    for (const approval of [
      { approvedBy: "", approvedAt: "2026-08-27T12:00:00.000Z" },
      { approvedBy: "   ", approvedAt: "2026-08-27T12:00:00.000Z" },
      { approvedBy: "\t\n", approvedAt: "2026-08-27T12:00:00.000Z" },
      { approvedBy: "Founder", approvedAt: "" },
      { approvedBy: "Founder", approvedAt: "not-a-date" },
      { approvedBy: "Founder", approvedAt: "2026-02-30T00:00:00.000Z" },
      { approvedBy: "Founder", approvedAt: "1999-01-01T00:00:00.000Z" },
    ]) {
      const { root, rel } = writeConfig({ entries: [{ ...BASE_ENTRY, founderActivationApproval: approval }] });
      expect(() => loadActivationOverlay(root, rel), JSON.stringify(approval)).toThrow(/founderActivationApproval/);
    }
  });

  it("accepts a substantive approval record", () => {
    const { root, rel } = writeConfig({
      entries: [{ ...BASE_ENTRY, founderActivationApproval: { approvedBy: "Founder", approvedAt: "2026-08-27T12:00:00.000Z" } }],
    });
    expect(loadActivationOverlay(root, rel).entries).toHaveLength(1);
  });
});
