import { describe, expect, it, vi } from "vitest";
import { EARLY_ACCESS_PAYMENT_OPTION_CODES } from "@shared/research/early-access-payment-options";
import {
  resolveEarlyAccessPaymentOptionsPresentation,
  type ResolveEarlyAccessPaymentOptionsInput,
} from "./manual-order-payment-method-adapter";
import type {
  ManualOrderPaymentMethod,
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "./manual-order-payments";

const EVALUATED_AT = "2026-08-04T05:30:00.000Z";
const ENABLED_AT = "2026-08-04T05:00:00.000Z";
const PRIVATE_SENTINEL = "PRIVATE-RECIPIENT-SENTINEL-MUST-NOT-LEAK";

function opaque(kind: string, marker: string): string {
  const seed = `${kind}_${marker}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0)
    .toString(16);
  return `${kind}:${seed.padStart(64, "0").slice(-64)}`;
}

function snapshot(
  method: ManualOrderPaymentMethod,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    method,
    configurationRef: opaque("payment_config", method),
    instructionsRef: opaque("payment_instructions", method),
    approvalRef: opaque("payment_approval", method),
    approvedByRole: "owner",
    approvedAt: "2026-08-04T04:00:00.000Z",
    verificationRef: opaque("payment_verification", method),
    verifiedByRole: "operations_admin",
    verifiedAt: "2026-08-04T04:30:00.000Z",
    enablementRef: opaque("payment_enablement", method),
    enabledByRole: "owner",
    enabledAt: ENABLED_AT,
    ...overrides,
  };
}

function harness(
  resolver: (input: {
    method: ManualOrderPaymentMethod;
    evaluatedAt: string;
  }) => unknown,
  now: unknown = EVALUATED_AT,
): {
  input: ResolveEarlyAccessPaymentOptionsInput;
  clockNow: ReturnType<typeof vi.fn>;
  resolveEnabledMethod: ReturnType<typeof vi.fn>;
} {
  const clockNow = vi.fn(() => now);
  const resolveEnabledMethod = vi.fn(resolver);
  return {
    input: {
      clock: { now: clockNow } as unknown as ManualPaymentClockPort,
      methodRegistry: {
        resolveEnabledMethod,
      } as ManualPaymentMethodRegistryPort,
    },
    clockNow,
    resolveEnabledMethod,
  };
}

describe("resolveEarlyAccessPaymentOptionsPresentation", () => {
  it("resolves all seven categories in canonical shared-contract order", () => {
    const current = harness(({ method }) => snapshot(method));

    const result = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(result).toEqual({
      state: "resolved",
      codes: EARLY_ACCESS_PAYMENT_OPTION_CODES,
    });
    expect(current.clockNow).toHaveBeenCalledTimes(1);
    expect(current.resolveEnabledMethod).toHaveBeenCalledTimes(7);
    expect(current.resolveEnabledMethod.mock.calls).toEqual(
      EARLY_ACCESS_PAYMENT_OPTION_CODES.map((method) => [
        { method, evaluatedAt: EVALUATED_AT },
      ]),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.state === "resolved" && Object.isFrozen(result.codes)).toBe(
      true,
    );
  });

  it("treats exact null as healthy unavailability and permits an empty result", () => {
    const current = harness(() => null);

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "resolved",
      codes: [],
    });
    expect(current.resolveEnabledMethod).toHaveBeenCalledTimes(7);
  });

  it("returns only valid available methods while retaining canonical order", () => {
    const available = new Set<ManualOrderPaymentMethod>([
      "other",
      "cash_app",
      "zelle",
    ]);
    const current = harness(({ method }) =>
      available.has(method) ? snapshot(method) : null,
    );

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "resolved",
      codes: ["zelle", "cash_app", "other"],
    });
  });

  it.each([
    ["non-string", 1],
    ["missing milliseconds", "2026-08-04T05:30:00Z"],
    ["offset", "2026-08-04T00:30:00.000-05:00"],
    ["too many fractional digits", "2026-08-04T05:30:00.000000Z"],
    ["impossible date", "2026-02-30T05:30:00.000Z"],
    ["lowercase zone", "2026-08-04T05:30:00.000z"],
  ])("fails closed on a %s clock without reading the registry", (_label, now) => {
    const current = harness(({ method }) => snapshot(method), now);

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "unresolved",
    });
    expect(current.clockNow).toHaveBeenCalledTimes(1);
    expect(current.resolveEnabledMethod).not.toHaveBeenCalled();
  });

  it("fails closed when the clock throws and never reads the registry", () => {
    const current = harness(({ method }) => snapshot(method));
    current.clockNow.mockImplementation(() => {
      throw new Error("clock unavailable");
    });

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "unresolved",
    });
    expect(current.clockNow).toHaveBeenCalledTimes(1);
    expect(current.resolveEnabledMethod).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined", undefined],
    ["boolean", false],
    ["string", "zelle"],
    ["array", []],
    ["promise", Promise.resolve(snapshot("zelle"))],
    ["object", {}],
  ])("fails the whole projection on a %s registry response", (_label, raw) => {
    const current = harness(({ method }) =>
      method === "zelle" ? snapshot(method) : raw,
    );

    const result = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(result).toEqual({ state: "unresolved" });
    expect(Object.keys(result)).toEqual(["state"]);
  });

  it("fails with no partial codes when a later registry read throws", () => {
    const current = harness(({ method }) => {
      if (method === "paypal") throw new Error("registry unavailable");
      return snapshot(method);
    });

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "unresolved",
    });
    expect(current.resolveEnabledMethod).toHaveBeenCalledTimes(4);
  });

  it("catches hostile validation objects instead of leaking partial state", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error(PRIVATE_SENTINEL);
        },
      },
    );
    const current = harness(({ method }) =>
      method === "zelle" ? snapshot(method) : hostile,
    );

    const result = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(result).toEqual({ state: "unresolved" });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_SENTINEL);
  });

  it.each([
    ["undefined enablement ref", { enablementRef: undefined }],
    ["extra recipient", { recipient: PRIVATE_SENTINEL }],
    ["bad configuration ref", { configurationRef: PRIVATE_SENTINEL }],
    ["bad role", { enabledByRole: "customer" }],
    ["bad timestamp", { enabledAt: "soon" }],
    [
      "reversed chronology",
      { approvedAt: "2026-08-04T05:10:00.000Z" },
    ],
  ])("fails closed for a snapshot with %s", (_label, overrides) => {
    const current = harness(({ method }) =>
      method === "zelle" ? snapshot(method, overrides) : null,
    );

    const result = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(result).toEqual({ state: "unresolved" });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_SENTINEL);
  });

  it("requires all twelve registry snapshot keys", () => {
    const missingEnablementRef = snapshot("zelle") as Record<string, unknown>;
    delete missingEnablementRef.enablementRef;
    const current = harness(({ method }) =>
      method === "zelle" ? missingEnablementRef : null,
    );

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "unresolved",
    });
  });

  it("rejects a registry snapshot whose identity differs from the queried code", () => {
    const current = harness(({ method }) =>
      method === "zelle" ? snapshot("venmo") : null,
    );

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "unresolved",
    });
  });

  it("rejects future enablement and accepts enablement exactly at evaluation", () => {
    const future = harness(({ method }) =>
      method === "zelle"
        ? snapshot(method, { enabledAt: "2026-08-04T05:30:00.001Z" })
        : null,
    );
    expect(resolveEarlyAccessPaymentOptionsPresentation(future.input)).toEqual({
      state: "unresolved",
    });

    const equal = harness(({ method }) =>
      method === "zelle" ? snapshot(method, { enabledAt: EVALUATED_AT }) : null,
    );
    expect(resolveEarlyAccessPaymentOptionsPresentation(equal.input)).toEqual({
      state: "resolved",
      codes: ["zelle"],
    });
  });

  it("uses the closed vocabulary and never probes card or wallet-provider aliases", () => {
    const current = harness(({ method }) =>
      method === "other" ? snapshot(method) : null,
    );

    expect(resolveEarlyAccessPaymentOptionsPresentation(current.input)).toEqual({
      state: "resolved",
      codes: ["other"],
    });
    const probed = current.resolveEnabledMethod.mock.calls.map(
      ([input]) => input.method,
    );
    expect(probed).toEqual(EARLY_ACCESS_PAYMENT_OPTION_CODES);
    expect(probed).not.toEqual(
      expect.arrayContaining([
        "card",
        "stripe",
        "apple_pay",
        "google_pay",
        "cash",
      ]),
    );
  });

  it("returns only codes and never protected registry fields or sentinels", () => {
    const current = harness(({ method }) =>
      method === "zelle"
        ? snapshot(method, {
            configurationRef: opaque("payment_config", PRIVATE_SENTINEL),
            instructionsRef: opaque("payment_instructions", PRIVATE_SENTINEL),
          })
        : null,
    );

    const result = resolveEarlyAccessPaymentOptionsPresentation(current.input);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({ state: "resolved", codes: ["zelle"] });
    expect(Object.keys(result)).toEqual(["state", "codes"]);
    expect(serialized).not.toContain("configurationRef");
    expect(serialized).not.toContain("instructionsRef");
    expect(serialized).not.toContain("approvedByRole");
    expect(serialized).not.toContain("enabledAt");
    expect(serialized).not.toContain(PRIVATE_SENTINEL);
  });

  it("returns fresh frozen arrays and re-reads revocation state on every call", () => {
    let pass = 0;
    const current = harness(({ method }) => {
      const currentPass = Math.floor(pass / 7);
      pass += 1;
      return currentPass === 0 ? snapshot(method) : null;
    });

    const first = resolveEarlyAccessPaymentOptionsPresentation(current.input);
    const second = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(first).toEqual({
      state: "resolved",
      codes: EARLY_ACCESS_PAYMENT_OPTION_CODES,
    });
    expect(second).toEqual({ state: "resolved", codes: [] });
    expect(first.state === "resolved" && second.state === "resolved").toBe(
      true,
    );
    if (first.state === "resolved" && second.state === "resolved") {
      expect(first.codes).not.toBe(second.codes);
      expect(Object.isFrozen(first.codes)).toBe(true);
      expect(Object.isFrozen(second.codes)).toBe(true);
    }
    expect(current.clockNow).toHaveBeenCalledTimes(2);
    expect(current.resolveEnabledMethod).toHaveBeenCalledTimes(14);
  });

  it("does not cache a failed pass and recovers from a later healthy registry read", () => {
    let firstPass = true;
    const current = harness(({ method }) => {
      if (firstPass) {
        firstPass = false;
        throw new Error(PRIVATE_SENTINEL);
      }
      return snapshot(method);
    });

    const failed = resolveEarlyAccessPaymentOptionsPresentation(current.input);
    const recovered = resolveEarlyAccessPaymentOptionsPresentation(current.input);

    expect(failed).toEqual({ state: "unresolved" });
    expect(JSON.stringify(failed)).not.toContain(PRIVATE_SENTINEL);
    expect(recovered).toEqual({
      state: "resolved",
      codes: EARLY_ACCESS_PAYMENT_OPTION_CODES,
    });
    expect(current.clockNow).toHaveBeenCalledTimes(2);
    expect(current.resolveEnabledMethod).toHaveBeenCalledTimes(8);
  });
});
