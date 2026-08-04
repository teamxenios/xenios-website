import { describe, expect, it } from "vitest";
import {
  CARE_BOUNDARY_KINDS,
  CARE_SURFACE_STATES,
  careBoundaryContent,
  careSurfaceContent,
  isCareSurfaceStateKind,
} from "./care-surface-contract";

describe("Care surface presentation contract", () => {
  it("defines each required state exactly once", () => {
    expect(CARE_SURFACE_STATES).toEqual([
      "loading", "empty", "error", "pending", "unavailable", "disabled", "success",
    ]);
    expect(new Set(CARE_SURFACE_STATES).size).toBe(7);
    expect(CARE_BOUNDARY_KINDS).toEqual(["clinical", "emergency", "privacy"]);
  });

  it.each(["__proto__", "enabled", "active", "clinician-ready", "<script>alert(1)</script>"])(
    "fails hostile or unknown state %s closed without reflecting it",
    (hostile) => {
      expect(isCareSurfaceStateKind(hostile)).toBe(false);
      const content = careSurfaceContent(hostile);
      expect(content.title).toBe("Care is not available");
      expect(JSON.stringify(content)).not.toContain(hostile);
    },
  );

  it("keeps canonical copy free of fabricated clinical and commercial facts", () => {
    const copy = [
      ...CARE_SURFACE_STATES.map((state) => careSurfaceContent(state)),
      ...CARE_BOUNDARY_KINDS.map((kind) => careBoundaryContent(kind)),
    ].map((entry) => JSON.stringify(entry)).join("\n");

    expect(copy).not.toMatch(/\$\d|\b(?:Dr\.|Rx|FDA approved|in stock|ships? today|all 50 states)\b/i);
    expect(copy).not.toMatch(/\b(?:clinician name|pharmacy partner|supported in [A-Z]{2})\b/i);
  });
});
