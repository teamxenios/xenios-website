import { describe, expect, it } from "vitest";
import { TEBRA_REQUEST_SEMANTICS } from "@shared/care/tebra-experience";
import { careCapabilityStatusForState } from "./capability";
import { resolveTebraPublicConfiguration } from "./tebra-scheduling";

describe("Tebra configuration fallback", () => {
  it("is stable, nonclinical, and contains no appointment coordinates", () => {
    const result = resolveTebraPublicConfiguration({
      env: { TEBRA_SCHEDULING_ENABLED: "false" },
      careCapability: careCapabilityStatusForState("enabled"),
    });

    expect(result.scheduling).toEqual({
      status: "disabled",
      mode: "disabled",
      telehealthEnabled: false,
      requestSemantics: TEBRA_REQUEST_SEMANTICS,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("startsAt");
    expect(serialized).not.toContain("appointmentId");
    expect(serialized).not.toContain("patient");
  });
});
