import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  BRIDGE_DEFAULT_CALENDAR_DAYS,
  bridgePhase,
  BridgeSettingsInvalid,
  canCreateObligationWith,
  canReviewExistingSubmission,
  defaultBridgeSettings,
  effectiveEndAt,
  emergencyDisableBridge,
  requestBridgeExtension,
  type BridgeSettings,
} from "./bridge";
import {
  approvePaymentMethod,
  createAesGcmInstructionCipher,
  createPaymentMethod,
  disablePaymentMethod,
  type PaymentMethodRecord,
} from "./payment-methods";

const TZ = "America/Chicago";
const NOW = new Date("2026-07-22T12:00:00.000Z");

function method(overrides: Partial<Parameters<typeof createPaymentMethod>[0]> = {}): PaymentMethodRecord {
  const cipher = createAesGcmInstructionCipher("test-only-key-material-long-enough");
  const { record } = createPaymentMethod(
    {
      methodId: "fm_method_1",
      providerCode: "manual_transfer",
      memberFacingName: "Bank transfer",
      adminFacingName: "Manual bank transfer (bridge)",
      duration: "temporary",
      activeStartAt: "2026-07-01T00:00:00.000Z",
      activeEndAt: "2026-09-01T00:00:00.000Z",
      activationEligible: true,
      renewalEligible: true,
      settlementTime: "same day",
      receivingLegalEntity: "Xenios Technology LLC",
      ownershipClassification: "business",
      receivingInstructions: "synthetic destination 00",
      ...overrides,
    },
    cipher,
    "admin_samuel",
    NOW,
  );
  return approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW }).record;
}

function activeSettings(overrides: Partial<BridgeSettings> = {}): BridgeSettings {
  return { ...defaultBridgeSettings("2026-07-20T05:00:00.000Z", TZ), ...overrides };
}

describe("addCalendarDays / the 14 day default window", () => {
  it("adds exactly 14 * 24h when no daylight-saving change intervenes", () => {
    const settings = defaultBridgeSettings("2026-07-01T17:00:00.000Z", TZ);
    expect(settings.endAt).toBe("2026-07-15T17:00:00.000Z");
    expect(new Date(settings.endAt).getTime() - new Date(settings.startAt).getTime()).toBe(
      BRIDGE_DEFAULT_CALENDAR_DAYS * 86_400_000,
    );
  });

  it("honors the timezone across spring-forward: same wall clock, one absolute hour less", () => {
    // 2026-03-01T18:00Z is noon in Chicago (CST, UTC-6). US DST begins
    // 2026-03-08, so 14 calendar days later noon Chicago is CDT (UTC-5),
    // which is 17:00Z: the window is 14 wall-clock days but 13d 23h absolute.
    const end = addCalendarDays("2026-03-01T18:00:00.000Z", 14, TZ);
    expect(end).toBe("2026-03-15T17:00:00.000Z");
    const absoluteMs = new Date(end).getTime() - new Date("2026-03-01T18:00:00.000Z").getTime();
    expect(absoluteMs).toBe(14 * 86_400_000 - 3_600_000);
  });

  it("honors the timezone across fall-back: same wall clock, one absolute hour more", () => {
    // US DST ends 2026-11-01. Noon Chicago on Oct 25 is CDT (17:00Z); noon 14
    // days later is CST (18:00Z).
    const end = addCalendarDays("2026-10-25T17:00:00.000Z", 14, TZ);
    expect(end).toBe("2026-11-08T18:00:00.000Z");
  });

  it("refuses a nonsense instant", () => {
    expect(() => addCalendarDays("not-a-date", 14, TZ)).toThrow(BridgeSettingsInvalid);
  });
});

describe("bridgePhase", () => {
  it("walks before -> active -> sunset over the window", () => {
    const settings = activeSettings();
    expect(bridgePhase(new Date("2026-07-19T00:00:00.000Z"), settings)).toBe("before");
    expect(bridgePhase(NOW, settings)).toBe("active");
    expect(bridgePhase(new Date("2026-08-10T00:00:00.000Z"), settings)).toBe("sunset");
    expect(bridgePhase(new Date(settings.endAt), settings)).toBe("sunset"); // the boundary itself is closed
  });

  it("emergency disable and a disabled bridge both read as sunset immediately", () => {
    expect(bridgePhase(NOW, activeSettings({ administratorEmergencyDisable: true }))).toBe("sunset");
    expect(bridgePhase(NOW, activeSettings({ bridgeEnabled: false }))).toBe("sunset");
  });

  it("a recorded extension moves the sunset boundary; a half-filled one does not", () => {
    const base = activeSettings();
    const afterEnd = new Date(new Date(base.endAt).getTime() + 86_400_000);
    expect(bridgePhase(afterEnd, base)).toBe("sunset");

    const extended = activeSettings({
      administratorExtensionReason: "Replacement provider onboarding slipped",
      administratorExtensionExpiresAt: addCalendarDays(base.endAt, 3, TZ),
    });
    expect(bridgePhase(afterEnd, extended)).toBe("active");
    expect(effectiveEndAt(extended)).toBe(extended.administratorExtensionExpiresAt);

    // Expiry with no reason extends nothing: no silent extension.
    const halfFilled = activeSettings({
      administratorExtensionReason: null,
      administratorExtensionExpiresAt: addCalendarDays(base.endAt, 3, TZ),
    });
    expect(bridgePhase(afterEnd, halfFilled)).toBe("sunset");
  });
});

describe("canCreateObligationWith", () => {
  it("allows an approved, in-window method during the active phase", () => {
    expect(canCreateObligationWith(method(), activeSettings(), NOW)).toEqual({ allowed: true });
    expect(canCreateObligationWith(method(), activeSettings(), NOW, "renewal")).toEqual({ allowed: true });
  });

  it("refuses every non-active phase for NEW obligations", () => {
    const settings = activeSettings();
    expect(canCreateObligationWith(method(), settings, new Date("2026-07-19T00:00:00.000Z"))).toEqual({
      allowed: false,
      reason: "bridge_not_open_yet",
    });
    expect(canCreateObligationWith(method(), settings, new Date("2026-08-10T00:00:00.000Z"))).toEqual({
      allowed: false,
      reason: "bridge_sunset",
    });
    expect(
      canCreateObligationWith(method(), activeSettings({ administratorEmergencyDisable: true }), NOW),
    ).toEqual({ allowed: false, reason: "bridge_sunset" });
  });

  it("refuses a disabled method and an expired method", () => {
    const disabled = disablePaymentMethod(method(), {
      actorId: "admin_samuel",
      reason: "Paused",
      now: NOW,
    }).record;
    expect(canCreateObligationWith(disabled, activeSettings(), NOW)).toEqual({
      allowed: false,
      reason: "method_not_usable",
    });

    const expired = method({ activeEndAt: "2026-07-10T00:00:00.000Z", activeStartAt: "2026-07-01T00:00:00.000Z" });
    expect(canCreateObligationWith(expired, activeSettings(), NOW)).toEqual({
      allowed: false,
      reason: "method_not_usable",
    });
  });

  it("honors the per-purpose acceptance toggles and eligibility flags", () => {
    const settings = activeSettings({ acceptingNewActivationPayments: false });
    expect(canCreateObligationWith(method(), settings, NOW, "activation")).toEqual({
      allowed: false,
      reason: "not_accepting_new_activation_payments",
    });
    // Renewals ride a separate toggle and still flow.
    expect(canCreateObligationWith(method(), settings, NOW, "renewal")).toEqual({ allowed: true });

    const renewalsOff = activeSettings({ acceptingExistingObligationPayments: false });
    expect(canCreateObligationWith(method(), renewalsOff, NOW, "renewal")).toEqual({
      allowed: false,
      reason: "not_accepting_existing_obligation_payments",
    });

    const notActivation = method({ activationEligible: false });
    expect(canCreateObligationWith(notActivation, activeSettings(), NOW, "activation")).toEqual({
      allowed: false,
      reason: "method_not_activation_eligible",
    });
  });

  it("existing submissions stay reviewable in sunset and under emergency disable", () => {
    const sunset = activeSettings({ administratorEmergencyDisable: true, bridgeEnabled: false });
    expect(canReviewExistingSubmission(sunset, new Date("2027-01-01T00:00:00.000Z"))).toEqual({
      allowed: true,
    });
  });
});

describe("requestBridgeExtension (no silent extension)", () => {
  const request = {
    eventId: "evt_ext_1",
    actorId: "admin_samuel",
    reason: "Replacement provider go-live moved to Day 18",
    expiresAt: "2026-08-07T05:00:00.000Z",
    now: NOW,
  };

  it("requires an admin, a reason, and an expiry that actually extends", () => {
    const settings = activeSettings();
    expect(() => requestBridgeExtension(settings, { ...request, actorId: " " })).toThrow(
      /named administrator/,
    );
    expect(() => requestBridgeExtension(settings, { ...request, reason: "" })).toThrow(
      /no silent extension/,
    );
    expect(() =>
      requestBridgeExtension(settings, { ...request, expiresAt: "2026-07-01T00:00:00.000Z" }),
    ).toThrow(BridgeSettingsInvalid);
    expect(() => requestBridgeExtension(settings, { ...request, expiresAt: settings.endAt })).toThrow(
      /later than the current effective end/,
    );
  });

  it("updates the settings and emits the audit event as one unit", () => {
    const settings = activeSettings();
    const { settings: next, event } = requestBridgeExtension(settings, request);
    expect(next.administratorExtensionReason).toBe(request.reason);
    expect(next.administratorExtensionExpiresAt).toBe(request.expiresAt);
    expect(event).toEqual({
      eventId: "evt_ext_1",
      kind: "bridge_extension",
      actorId: "admin_samuel",
      reason: request.reason,
      at: NOW.toISOString(),
      detail: { previousEndAt: settings.endAt, newEndAt: request.expiresAt },
    });
    // The extension is what moves the phase boundary.
    const afterOldEnd = new Date(new Date(settings.endAt).getTime() + 3_600_000);
    expect(bridgePhase(afterOldEnd, settings)).toBe("sunset");
    expect(bridgePhase(afterOldEnd, next)).toBe("active");
  });

  it("a second extension must beat the first one's expiry, and the trail records both", () => {
    const settings = activeSettings();
    const first = requestBridgeExtension(settings, request);
    expect(() =>
      requestBridgeExtension(first.settings, { ...request, eventId: "evt_ext_2" }),
    ).toThrow(/later than the current effective end/);
    const second = requestBridgeExtension(first.settings, {
      ...request,
      eventId: "evt_ext_2",
      expiresAt: "2026-08-09T05:00:00.000Z",
    });
    expect(second.event.detail).toEqual({
      previousEndAt: request.expiresAt,
      newEndAt: "2026-08-09T05:00:00.000Z",
    });
  });
});

describe("emergencyDisableBridge", () => {
  it("flips to sunset immediately and records who and why", () => {
    const settings = activeSettings();
    const { settings: next, event } = emergencyDisableBridge(settings, {
      eventId: "evt_kill_1",
      actorId: "admin_samuel",
      reason: "Suspected fraudulent submissions",
      now: NOW,
    });
    expect(next.administratorEmergencyDisable).toBe(true);
    expect(bridgePhase(NOW, next)).toBe("sunset");
    expect(event.kind).toBe("bridge_emergency_disable");
    // The stop applies to NEW obligations only; review continues.
    expect(canReviewExistingSubmission(next, NOW)).toEqual({ allowed: true });
  });

  it("requires an actor and a reason", () => {
    expect(() =>
      emergencyDisableBridge(activeSettings(), { eventId: "e", actorId: "", reason: "r", now: NOW }),
    ).toThrow(/named administrator/);
    expect(() =>
      emergencyDisableBridge(activeSettings(), { eventId: "e", actorId: "a", reason: " ", now: NOW }),
    ).toThrow(/reason/);
  });
});
