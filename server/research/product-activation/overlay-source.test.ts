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
