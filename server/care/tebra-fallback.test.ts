import { describe, expect, it, vi } from "vitest";
import { createTebraSchedulingAdapter } from "./tebra-scheduling";

describe("Tebra concierge fallback", () => {
  it("is stable, nonclinical, and does not echo submitted coordinates", async () => {
    const request = {
      appointmentId: "opaque-appointment",
      startsAt: "2026-08-03T15:00:00.000Z",
      endsAt: "2026-08-03T15:30:00.000Z",
    };
    const transport = { createAppointment: vi.fn() };
    const result = await createTebraSchedulingAdapter({
      env: {
        CARE_ENABLED: "true",
        CARE_ENABLE_APPROVED: "true",
        CARE_TEBRA_SCHEDULING_ENABLED: "false",
      },
      transport,
    }).schedule(request);

    expect(result).toEqual({
      ok: false,
      code: "tebra_unconfigured",
      fallback: "concierge_required",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(request.appointmentId);
    expect(serialized).not.toContain(request.startsAt);
    expect(transport.createAppointment).not.toHaveBeenCalled();
  });
});
