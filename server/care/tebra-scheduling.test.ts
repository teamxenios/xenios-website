import { describe, expect, it, vi } from "vitest";
import { createTebraSchedulingAdapter } from "./tebra-scheduling";
import { careCapabilityStatusForState } from "./capability";

const request = {
  appointmentId: "appointment_opaque_01",
  startsAt: "2026-08-03T15:00:00.000Z",
  endsAt: "2026-08-03T15:30:00.000Z",
};

const readyEnv = {
  CARE_ENABLED: "true",
  CARE_ENABLE_APPROVED: "true",
  CARE_TEBRA_SCHEDULING_ENABLED: "true",
  CARE_TEBRA_BASE_URL: "https://api.example.invalid/",
  CARE_TEBRA_API_KEY: "test-only-secret",
};

const enabledCapability = vi.fn(async () =>
  careCapabilityStatusForState("enabled"),
);

describe("Tebra scheduling adapter", () => {
  it.each([
    [{}, "care_disabled"],
    [{ CARE_ENABLED: "TRUE", CARE_ENABLE_APPROVED: "true" }, "care_disabled"],
    [{ CARE_ENABLED: "true", CARE_ENABLE_APPROVED: "1" }, "care_disabled"],
    [
      { CARE_ENABLED: "true", CARE_ENABLE_APPROVED: "true" },
      "tebra_unconfigured",
    ],
  ] as const)("fails closed for malformed or incomplete flags", async (env, code) => {
    const transport = { createAppointment: vi.fn() };
    const adapter = createTebraSchedulingAdapter({ env, transport });
    await expect(adapter.schedule(request)).resolves.toEqual({
      ok: false,
      code,
      fallback: "concierge_required",
    });
    expect(transport.createAppointment).not.toHaveBeenCalled();
  });

  it.each([
    "http://api.example.invalid/",
    "https://user:password@api.example.invalid/",
    "https://api.example.invalid/path",
    "https://api.example.invalid/?tenant=private",
    "not-a-url",
  ])("rejects unsafe provider endpoints without a call: %s", async (baseUrl) => {
    const transport = { createAppointment: vi.fn() };
    const adapter = createTebraSchedulingAdapter({
      env: { ...readyEnv, CARE_TEBRA_BASE_URL: baseUrl },
      transport,
    });
    await expect(adapter.schedule(request)).resolves.toMatchObject({
      ok: false,
      code: "tebra_configuration_invalid",
    });
    expect(transport.createAppointment).not.toHaveBeenCalled();
  });

  it("requires an explicitly injected transport and never uses ambient fetch", async () => {
    const ambientFetch = vi.fn();
    vi.stubGlobal("fetch", ambientFetch);
    const adapter = createTebraSchedulingAdapter({ env: readyEnv });
    await expect(adapter.schedule(request)).resolves.toMatchObject({
      ok: false,
      code: "tebra_unavailable",
    });
    expect(ambientFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends only opaque scheduling coordinates and returns an opaque reference", async () => {
    const createAppointment = vi.fn(async () => ({
      externalAppointmentId: "tebra_appointment_01",
    }));
    const adapter = createTebraSchedulingAdapter({
      env: readyEnv,
      transport: { createAppointment },
      loadCareCapability: enabledCapability,
    });

    await expect(adapter.schedule(request)).resolves.toEqual({
      ok: true,
      externalAppointmentId: "tebra_appointment_01",
    });
    expect(createAppointment).toHaveBeenCalledWith(
      new URL("https://api.example.invalid/v1/appointments"),
      "test-only-secret",
      request,
    );
    const serialized = JSON.stringify(createAppointment.mock.calls[0]?.[2]);
    for (const prohibited of [
      "patient",
      "clinician",
      "pharmacy",
      "prescription",
      "diagnosis",
      "medication",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(prohibited);
    }
  });

  it("redacts provider failures and malformed external identifiers", async () => {
    const secret = "private-upstream-patient-data";
    const throwing = createTebraSchedulingAdapter({
      env: readyEnv,
      loadCareCapability: enabledCapability,
      transport: {
        createAppointment: vi.fn(async () => {
          throw new Error(secret);
        }),
      },
    });
    const failed = await throwing.schedule(request);
    expect(failed).toEqual({
      ok: false,
      code: "tebra_unavailable",
      fallback: "concierge_required",
    });
    expect(JSON.stringify(failed)).not.toContain(secret);

    const malformed = createTebraSchedulingAdapter({
      env: readyEnv,
      loadCareCapability: enabledCapability,
      transport: {
        createAppointment: vi.fn(async () => ({
          externalAppointmentId: "patient name / clinical note",
        })),
      },
    });
    await expect(malformed.schedule(request)).resolves.toMatchObject({
      ok: false,
      code: "tebra_unavailable",
    });
  });

  it("revalidates the server-authoritative Care capability on every call", async () => {
    const createAppointment = vi.fn(async () => ({
      externalAppointmentId: "tebra_appointment_01",
    }));
    const states = ["enabled", "disabled", "pending_qa"] as const;
    const loadCareCapability = vi.fn(async () =>
      careCapabilityStatusForState(states.shift() ?? "disabled"),
    );
    const adapter = createTebraSchedulingAdapter({
      env: readyEnv,
      transport: { createAppointment },
      loadCareCapability,
    });

    await expect(adapter.schedule(request)).resolves.toMatchObject({ ok: true });
    await expect(adapter.schedule(request)).resolves.toEqual({
      ok: false,
      code: "care_disabled",
      fallback: "concierge_required",
    });
    await expect(adapter.schedule(request)).resolves.toEqual({
      ok: false,
      code: "care_disabled",
      fallback: "concierge_required",
    });
    expect(loadCareCapability).toHaveBeenCalledTimes(3);
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });

  it.each([
    "2026-02-30T15:00:00.000Z",
    "2025-02-29T15:00:00.000Z",
    "2026-04-31T15:00:00.000Z",
    "2026-13-01T15:00:00.000Z",
    "2026-08-03T24:00:00.000Z",
    "2026-08-03T15:00:00",
    "2026-08-03 15:00:00Z",
    "2026-08-03T15:00:00+24:00",
    "2026-08-03T15:00:00+00:60",
  ])("rejects a noncanonical or impossible instant before transport: %s", async (startsAt) => {
    const createAppointment = vi.fn();
    const adapter = createTebraSchedulingAdapter({
      env: readyEnv,
      transport: { createAppointment },
      loadCareCapability: enabledCapability,
    });
    await expect(adapter.schedule({ ...request, startsAt })).resolves.toEqual({
      ok: false,
      code: "tebra_unavailable",
      fallback: "concierge_required",
    });
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it.each([
    ["2028-02-29T15:00:00Z", "2028-02-29T15:30:00Z"],
    ["2026-08-03T15:00:00-05:00", "2026-08-03T15:30:00-05:00"],
  ])("accepts a strict valid instant pair", async (startsAt, endsAt) => {
    const createAppointment = vi.fn(async () => ({
      externalAppointmentId: "tebra_appointment_01",
    }));
    const adapter = createTebraSchedulingAdapter({
      env: readyEnv,
      transport: { createAppointment },
      loadCareCapability: enabledCapability,
    });
    await expect(
      adapter.schedule({ ...request, startsAt, endsAt }),
    ).resolves.toMatchObject({ ok: true });
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });
});
