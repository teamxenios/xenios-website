import { describe, expect, it } from "vitest";
import { careCapabilityStatus, readCareCapabilityState } from "./capability";

describe("Care capability", () => {
  it("defaults disabled", () => {
    expect(readCareCapabilityState({})).toBe("disabled");
    expect(careCapabilityStatus({}, new Date("2026-07-25T00:00:00Z"))).toMatchObject({
      rail: "care",
      state: "disabled",
      enabled: false,
      publicMessage: "Care is being prepared.",
    });
  });

  it("requires a second explicit approval to enable", () => {
    expect(readCareCapabilityState({ CARE_CAPABILITY_STATE: "enabled" })).toBe("disabled");
    expect(
      readCareCapabilityState({
        CARE_CAPABILITY_STATE: "enabled",
        CARE_ENABLE_APPROVED: "true",
      }),
    ).toBe("enabled");
  });

  it("supports every truthful pending state", () => {
    expect(readCareCapabilityState({ CARE_CAPABILITY_STATE: "pending_pharmacy" })).toBe("pending_pharmacy");
    expect(readCareCapabilityState({ CARE_CAPABILITY_STATE: "pending_clinicians" })).toBe("pending_clinicians");
  });
});
