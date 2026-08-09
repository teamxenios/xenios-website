import { describe, expect, it } from "vitest";
import { createRegistryPaymentPresentation } from "./payment-presentation";
import type {
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";

const NOW = "2026-08-09T11:00:00.000Z";
const clock: ManualPaymentClockPort = { now: () => NOW };

/**
 * A complete, well formed governance record for one method, in the exact shape
 * `parseManualPaymentMethodSnapshot` requires: opaque refs are
 * `namespace:<sha256>` and the roles come from the manual-payment role list.
 */
function ref(namespace: string, seed: string): string {
  return `${namespace}:${seed.repeat(64).slice(0, 64)}`;
}

function snapshot(method: string, overrides: Record<string, unknown> = {}) {
  return {
    method,
    configurationRef: ref("cfg", "a"),
    instructionsRef: ref("ins", "b"),
    approvalRef: ref("apr", "c"),
    approvedByRole: "owner",
    approvedAt: "2026-07-01T00:00:00.000Z",
    verificationRef: ref("ver", "d"),
    verifiedByRole: "owner",
    verifiedAt: "2026-07-02T00:00:00.000Z",
    enablementRef: ref("ena", "e"),
    enabledByRole: "admin",
    enabledAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function registry(document: Record<string, unknown>): ManualPaymentMethodRegistryPort {
  return {
    resolveEnabledMethod(input: { method: string }): unknown {
      return document[input.method] ?? null;
    },
  };
}

describe("the chosen method comes from the live presentation", () => {
  it("resolves an enabled method and fingerprints its governance", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock,
    });

    const result = await presentation.resolveChosenMethod("zelle");
    expect(result.state).toBe("resolved");
    if (result.state !== "resolved") return;
    expect(result.snapshot.code).toBe("zelle");
    expect(result.snapshot.methodName).toBe("Zelle");
    
    expect(result.snapshot.presentedAt).toBe(NOW);
    expect(result.snapshot.registryVersion).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not publish the governance references themselves", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock,
    });
    const result = await presentation.resolveChosenMethod("zelle");
    if (result.state !== "resolved") throw new Error("expected resolved");

    const serialized = JSON.stringify(result.snapshot);
    expect(serialized).not.toContain(ref("apr", "c"));
    expect(serialized).not.toContain("owner");
    expect(Object.keys(result.snapshot).sort()).toEqual([
      "code",
      "methodName",
      "presentedAt",
      "registryVersion",
    ]);
  });

  it("changes the fingerprint when the approval record changes", async () => {
    const first = await createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock,
    }).resolveChosenMethod("zelle");
    const second = await createRegistryPaymentPresentation({
      methodRegistry: registry({
        zelle: snapshot("zelle", { enablementRef: ref("ena", "f") }),
      }),
      clock,
    }).resolveChosenMethod("zelle");

    if (first.state !== "resolved" || second.state !== "resolved") throw new Error("expected resolved");
    expect(first.snapshot.registryVersion).not.toBe(second.snapshot.registryVersion);
  });

  it("refuses a method the registry does not enable", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock,
    });
    await expect(presentation.resolveChosenMethod("venmo")).resolves.toEqual({
      state: "not_enabled",
    });
  });

  it("refuses a value that is not a known method code at all", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock,
    });
    for (const value of [undefined, null, "", "bitcoin", 7, { method: "zelle" }]) {
      await expect(presentation.resolveChosenMethod(value)).resolves.toEqual({
        state: "not_enabled",
      });
    }
  });

  it("has no default, so an empty registry enables nothing including Zelle", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({}),
      clock,
    });
    await expect(presentation.resolveChosenMethod("zelle")).resolves.toEqual({
      state: "not_enabled",
    });
  });

  it("fails the whole presentation closed when any record is malformed", async () => {
    // One broken record must not leave the others quietly selectable: the
    // registry is a governance document and a partially unreadable one is not
    // a document anybody should be transacting against.
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({
        zelle: snapshot("zelle"),
        venmo: { method: "venmo", approvalRef: "missing-the-rest" },
      }),
      clock,
    });
    await expect(presentation.resolveChosenMethod("zelle")).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("fails closed when the registry throws", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: {
        resolveEnabledMethod() {
          throw new Error("registry unavailable");
        },
      },
      clock,
    });
    await expect(presentation.resolveChosenMethod("zelle")).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("fails closed when the clock is not a canonical instant", async () => {
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: registry({ zelle: snapshot("zelle") }),
      clock: { now: () => "not-a-timestamp" },
    });
    await expect(presentation.resolveChosenMethod("zelle")).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("refuses when the record disappears between the two reads", async () => {
    let reads = 0;
    const presentation = createRegistryPaymentPresentation({
      methodRegistry: {
        resolveEnabledMethod(input: { method: string }): unknown {
          if (input.method !== "zelle") return null;
          reads += 1;
          // The whole-registry pass reads every code once; the identity read
          // comes afterwards and finds the record withdrawn.
          return reads > 1 ? null : snapshot("zelle");
        },
      },
      clock,
    });
    await expect(presentation.resolveChosenMethod("zelle")).resolves.toEqual({
      state: "unavailable",
    });
  });
});
