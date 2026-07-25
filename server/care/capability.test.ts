import { describe, expect, it } from "vitest";
import { careCapabilityStatusForState } from "./capability";

describe("Care capability", () => {
  it("represents the server-authoritative disabled state", () => {
    expect(
      careCapabilityStatusForState(
        "disabled",
        new Date("2026-07-25T00:00:00Z"),
      ),
    ).toMatchObject({
      rail: "care",
      state: "disabled",
      enabled: false,
      publicMessage: "Care is being prepared.",
    });
  });

  it("maps only the canonical enabled state to enabled", () => {
    expect(careCapabilityStatusForState("enabled").enabled).toBe(true);
    expect(careCapabilityStatusForState("pending_qa").enabled).toBe(false);
  });

  it("supports every truthful pending state", () => {
    expect(careCapabilityStatusForState("pending_pharmacy").state).toBe("pending_pharmacy");
    expect(careCapabilityStatusForState("pending_clinicians").state).toBe("pending_clinicians");
  });
});
