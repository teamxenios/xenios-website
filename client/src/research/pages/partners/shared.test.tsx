// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartnerLoader } from "../../adapters/partner";
import type { ApiResult } from "../../lib/api";
import type {
  CapabilityStatus,
  ResearchCapability,
} from "../../lib/capabilities";

const mocks = vi.hoisted(() => ({ fetchCapabilities: vi.fn() }));
vi.mock("../../lib/capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/capabilities")>()),
  fetchCapabilities: mocks.fetchCapabilities,
}));

import { usePartnerCapabilities, usePartnerResource } from "./shared";

type ResourceSnapshot = ReturnType<typeof usePartnerResource<string>>;
type Observation = Omit<ResourceSnapshot, "reload"> & { token: string | null };
type Capabilities = Map<ResearchCapability, CapabilityStatus>;
type CapabilityObservation = { token: string | null; value: string | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

let root: Root;
let container: HTMLDivElement;
let latest: ResourceSnapshot;
let observations: Observation[];
let capabilityObservations: CapabilityObservation[];
let unmounted: boolean;

function ResourceProbe({
  token,
  loader,
}: {
  token: string | null;
  loader: PartnerLoader<string>;
}) {
  latest = usePartnerResource(loader, token);
  const { reload: _reload, ...snapshot } = latest;
  observations.push({ token, ...snapshot });
  return <output>{snapshot.data ?? snapshot.state}</output>;
}

function CapabilityProbe({ token }: { token: string | null }) {
  const statuses = usePartnerCapabilities(token);
  const value = statuses?.get("affiliate_payouts")?.publicMessage ?? null;
  capabilityObservations.push({ token, value });
  return <output>{value ?? "pending"}</output>;
}

async function renderResource(
  token: string | null,
  loader: PartnerLoader<string>,
  strict = false,
) {
  await act(async () => {
    const probe = <ResourceProbe token={token} loader={loader} />;
    root.render(strict ? <StrictMode>{probe}</StrictMode> : probe);
  });
}

async function renderCapabilities(token: string | null) {
  await act(async () => root.render(<CapabilityProbe token={token} />));
}

async function unmount() {
  await act(async () => root.unmount());
  unmounted = true;
}

function capabilities(message: string): Capabilities {
  return new Map([
    [
      "affiliate_payouts",
      {
        capability: "affiliate_payouts",
        state: "enabled",
        publicMessage: message,
        checkedAt: "2026-09-05T00:00:00Z",
      },
    ],
  ]);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  unmounted = false;
  observations = [];
  capabilityObservations = [];
  mocks.fetchCapabilities.mockReset();
  mocks.fetchCapabilities.mockResolvedValue(new Map());
});

afterEach(async () => {
  if (!unmounted) await unmount();
  container.remove();
  vi.unstubAllGlobals();
});

describe("usePartnerResource principal and request identity", () => {
  it.each(["partner-b-token", null])(
    "hides A on every render when its token becomes %s",
    async (nextToken) => {
      const next = deferred<ApiResult<string>>();
      const loader = vi.fn<PartnerLoader<string>>((token) =>
        token === "partner-a-token"
          ? Promise.resolve({ kind: "ok", data: "private-a" })
          : next.promise,
      );
      await renderResource("partner-a-token", loader);
      expect(latest.data).toBe("private-a");
      observations.length = 0;
      await renderResource(nextToken, loader);
      expect(observations.length).toBeGreaterThan(0);
      expect(
        observations.every(
          ({ data, denied, errorMessage }) =>
            data === null && denied === null && errorMessage === undefined,
        ),
      ).toBe(true);
      expect(latest.state).toBe(nextToken ? "loading" : "unauthorized");
      expect(loader.mock.calls.some(([token]) => token === null)).toBe(false);
    },
  );

  it("clears A's denial and error on the first B render", async () => {
    const next = deferred<ApiResult<string>>();
    const loader = vi.fn<PartnerLoader<string>>((token) =>
      token === "partner-a-token"
        ? Promise.resolve({
            kind: "denied",
            code: "unknown_synthetic_denial",
            message: "private-a-denial",
          })
        : next.promise,
    );
    await renderResource("partner-a-token", loader);
    expect(latest.denied?.message).toBe("private-a-denial");
    observations.length = 0;
    await renderResource("partner-b-token", loader);
    expect(
      observations.every(
        ({ data, denied, errorMessage }) =>
          data === null && denied === null && errorMessage === undefined,
      ),
    ).toBe(true);
  });

  it("treats a loader replacement as a new request even when token is unchanged", async () => {
    const replacement = deferred<ApiResult<string>>();
    const loaderA = vi.fn<PartnerLoader<string>>(async () => ({
      kind: "ok",
      data: "old-resource",
    }));
    const loaderB = vi.fn<PartnerLoader<string>>(() => replacement.promise);
    await renderResource("partner-a-token", loaderA);
    observations.length = 0;
    await renderResource("partner-a-token", loaderB);
    expect(observations.every(({ data }) => data === null)).toBe(true);
    await act(async () =>
      replacement.resolve({ kind: "ok", data: "new-resource" }),
    );
    expect(latest.data).toBe("new-resource");
  });

  it.each(["ok", "denied", "reject"] as const)(
    "ignores late A %s after B owns the resource",
    async (outcome) => {
      const requestA = deferred<ApiResult<string>>();
      const loader = vi.fn<PartnerLoader<string>>((token) =>
        token === "partner-a-token"
          ? requestA.promise
          : Promise.resolve({ kind: "ok", data: "private-b" }),
      );
      await renderResource("partner-a-token", loader);
      await renderResource("partner-b-token", loader);
      const count = observations.length;
      await act(async () => {
        if (outcome === "reject")
          requestA.reject(new Error("private-a-failure"));
        else
          requestA.resolve(
            outcome === "ok"
              ? { kind: "ok", data: "private-a" }
              : {
                  kind: "denied",
                  code: "forbidden",
                  message: "private-a-denial",
                },
          );
      });
      expect(latest.data).toBe("private-b");
      expect(observations).toHaveLength(count);
    },
  );

  it("does not revive an old request across A to B to A", async () => {
    const oldA = deferred<ApiResult<string>>();
    let aCalls = 0;
    const loader = vi.fn<PartnerLoader<string>>((token) => {
      if (token === "partner-a-token" && ++aCalls === 1) return oldA.promise;
      return Promise.resolve({
        kind: "ok",
        data: token === "partner-a-token" ? "fresh-a" : "private-b",
      });
    });
    await renderResource("partner-a-token", loader);
    await renderResource("partner-b-token", loader);
    await renderResource("partner-a-token", loader);
    await act(async () => oldA.resolve({ kind: "ok", data: "stale-a" }));
    expect(latest.data).toBe("fresh-a");
  });

  it("latest overlapping reload wins, including denial over an older success", async () => {
    const older = deferred<ApiResult<string>>();
    const newest = deferred<ApiResult<string>>();
    const loader = vi
      .fn<PartnerLoader<string>>()
      .mockResolvedValueOnce({ kind: "ok", data: "initial" })
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newest.promise);
    await renderResource("partner-a-token", loader);
    let firstReload!: Promise<void>;
    let secondReload!: Promise<void>;
    await act(async () => {
      firstReload = latest.reload();
      secondReload = latest.reload();
    });
    expect(latest).toMatchObject({
      state: "loading",
      data: null,
      denied: null,
    });
    await act(async () => {
      newest.resolve({ kind: "denied", code: "forbidden" });
      await secondReload;
    });
    expect(latest.state).toBe("error");
    const count = observations.length;
    await act(async () => {
      older.resolve({ kind: "ok", data: "stale-success" });
      await firstReload;
    });
    expect(latest.data).toBeNull();
    expect(latest.denied?.code).toBe("forbidden");
    expect(observations).toHaveLength(count);
  });

  it("a retained prior-token reload callback cannot start another read", async () => {
    const loader = vi.fn<PartnerLoader<string>>(async (token) => ({
      kind: "ok",
      data: token!,
    }));
    await renderResource("partner-a-token", loader);
    const reloadA = latest.reload;
    await renderResource("partner-b-token", loader);
    const count = loader.mock.calls.length;
    await act(async () => reloadA());
    expect(loader).toHaveBeenCalledTimes(count);
    expect(latest.data).toBe("partner-b-token");
  });

  it.each([
    [{ kind: "unauthorized" }, "unauthorized"],
    [{ kind: "forbidden" }, "unavailable"],
    [{ kind: "unavailable" }, "unavailable"],
    [{ kind: "denied", code: "commerce_disabled" }, "unavailable"],
    [{ kind: "denied", code: "forbidden" }, "error"],
    [{ kind: "error", message: "Synthetic failure" }, "error"],
  ] as const)(
    "clears data while preserving existing %j presentation",
    async (response, state) => {
      const loader = vi
        .fn<PartnerLoader<string>>()
        .mockResolvedValueOnce({ kind: "ok", data: "private-data" })
        .mockResolvedValueOnce(response);
      await renderResource("partner-a-token", loader);
      await act(async () => latest.reload());
      expect(latest.state).toBe(state);
      expect(latest.data).toBeNull();
    },
  );

  it.each(["sync", "async"])(
    "catches a %s loader failure without leaking its message",
    async (mode) => {
      const loader = vi.fn<PartnerLoader<string>>(() => {
        if (mode === "sync") throw new Error("private-internal-error");
        return Promise.reject(new Error("private-internal-error"));
      });
      await renderResource("partner-a-token", loader);
      expect(latest).toMatchObject({
        state: "error",
        data: null,
        denied: null,
      });
      expect(latest.errorMessage).toBe(
        "The partner information could not be loaded. Please try again.",
      );
      await act(async () => {
        await expect(latest.reload()).resolves.toBeUndefined();
      });
    },
  );

  it.each(["resolve", "reject"])(
    "ignores %s after unmount and refuses retained reload",
    async (outcome) => {
      const pending = deferred<ApiResult<string>>();
      const loader = vi.fn<PartnerLoader<string>>(() => pending.promise);
      await renderResource("partner-a-token", loader);
      const reload = latest.reload;
      await unmount();
      const count = observations.length;
      await act(async () => {
        if (outcome === "resolve")
          pending.resolve({ kind: "ok", data: "private-data" });
        else pending.reject(new Error("private-failure"));
        await reload();
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(observations).toHaveLength(count);
    },
  );

  it("starts no private request or reload when signed out", async () => {
    const loader = vi.fn<PartnerLoader<string>>();
    await renderResource(null, loader);
    await act(async () => latest.reload());
    expect(latest).toMatchObject({
      state: "unauthorized",
      data: null,
      denied: null,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("invalidates the first Strict Mode effect generation", async () => {
    const first = deferred<ApiResult<string>>();
    const loader = vi
      .fn<PartnerLoader<string>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ kind: "ok", data: "current-generation" });
    await renderResource("partner-a-token", loader, true);
    expect(loader).toHaveBeenCalledTimes(2);
    await act(async () =>
      first.resolve({ kind: "ok", data: "stale-generation" }),
    );
    expect(latest.data).toBe("current-generation");
  });
});

describe("usePartnerCapabilities render-bound identity", () => {
  it.each(["partner-b-token", null])(
    "hides A capabilities on every render after token becomes %s",
    async (nextToken) => {
      const next = deferred<Capabilities>();
      mocks.fetchCapabilities.mockImplementation((token) =>
        token === "partner-a-token"
          ? Promise.resolve(capabilities("private-a"))
          : next.promise,
      );
      await renderCapabilities("partner-a-token");
      expect(container.textContent).toBe("private-a");
      capabilityObservations.length = 0;
      await renderCapabilities(nextToken);
      expect(capabilityObservations.length).toBeGreaterThan(0);
      expect(capabilityObservations.every(({ value }) => value === null)).toBe(
        true,
      );
      expect(
        mocks.fetchCapabilities.mock.calls.some(([token]) => token === null),
      ).toBe(false);
    },
  );

  it.each(["resolve", "reject"])(
    "ignores late A capability %s after B has loaded",
    async (outcome) => {
      const first = deferred<Capabilities>();
      mocks.fetchCapabilities.mockImplementation((token) =>
        token === "partner-a-token"
          ? first.promise
          : Promise.resolve(capabilities("private-b")),
      );
      await renderCapabilities("partner-a-token");
      await renderCapabilities("partner-b-token");
      const count = capabilityObservations.length;
      await act(async () => {
        if (outcome === "resolve") first.resolve(capabilities("private-a"));
        else first.reject(new Error("private-a-failure"));
      });
      expect(container.textContent).toBe("private-b");
      expect(capabilityObservations).toHaveLength(count);
    },
  );

  it("does not restore capabilities after token removal and pending completion", async () => {
    const pending = deferred<Capabilities>();
    mocks.fetchCapabilities.mockReturnValue(pending.promise);
    await renderCapabilities("partner-a-token");
    await renderCapabilities(null);
    await act(async () => pending.resolve(capabilities("private-a")));
    expect(container.textContent).toBe("pending");
    expect(mocks.fetchCapabilities).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a rejected capability loader", async () => {
    mocks.fetchCapabilities.mockRejectedValue(
      new Error("private-internal-failure"),
    );
    await renderCapabilities("partner-a-token");
    expect(container.textContent).toBe("pending");
  });

  it("ignores a capability completion after unmount", async () => {
    const pending = deferred<Capabilities>();
    mocks.fetchCapabilities.mockReturnValue(pending.promise);
    await renderCapabilities("partner-a-token");
    await unmount();
    const count = capabilityObservations.length;
    await act(async () => pending.resolve(capabilities("private-a")));
    expect(capabilityObservations).toHaveLength(count);
  });
});
