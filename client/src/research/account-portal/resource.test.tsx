// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAccountResult } from "@shared/research/customer-account/contract";
import { useAccountResource } from "./resource";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}>;

type Observation = Readonly<{
  token: string | null;
  state: "loading" | "ready" | "denied" | "error";
  data?: string;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

const mounted = new Set<Root>();

function ResourceProbe({
  loader,
  token,
  observations,
}: {
  loader: (token: string | null) => Promise<CustomerAccountResult<string>>;
  token: string | null;
  observations: Observation[];
}) {
  const snapshot = useAccountResource(loader, token);
  observations.push({
    token,
    state: snapshot.state,
    ...(snapshot.state === "ready" ? { data: snapshot.data } : {}),
  });
  return (
    <p data-testid="resource-probe">
      {snapshot.state === "ready" ? `ready:${snapshot.data}` : snapshot.state}
    </p>
  );
}

function createProbe(
  loader: (token: string | null) => Promise<CustomerAccountResult<string>>,
  observations: Observation[],
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.add(root);

  return {
    container,
    async renderToken(token: string | null) {
      await act(async () => {
        root.render(
          <ResourceProbe loader={loader} token={token} observations={observations} />,
        );
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      mounted.delete(root);
    },
  };
}

afterEach(async () => {
  for (const root of mounted) {
    await act(async () => root.unmount());
  }
  mounted.clear();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("useAccountResource request identity", () => {
  it("hides A synchronously on an A-to-B token swap", async () => {
    const requestA = deferred<CustomerAccountResult<string>>();
    const requestB = deferred<CustomerAccountResult<string>>();
    const loader = vi.fn((token: string | null) => {
      if (token === "token-a") return requestA.promise;
      if (token === "token-b") return requestB.promise;
      return Promise.resolve({ kind: "denied", reason: "auth_required" } as const);
    });
    const observations: Observation[] = [];
    const probe = createProbe(loader, observations);

    await probe.renderToken("token-a");
    await act(async () => {
      requestA.resolve({ kind: "ok", data: "member-a" });
      await requestA.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-a");

    observations.length = 0;
    await probe.renderToken("token-b");
    const transitionRenders = observations.filter(({ token }) => token === "token-b");
    expect(transitionRenders.length).toBeGreaterThan(0);
    expect(transitionRenders).not.toContainEqual({
      token: "token-b",
      state: "ready",
      data: "member-a",
    });
    expect(probe.container.textContent).toBe("loading");

    await act(async () => {
      requestB.resolve({ kind: "ok", data: "member-b" });
      await requestB.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-b");
  });

  it("ignores a late A response after B owns the resource", async () => {
    const requestA = deferred<CustomerAccountResult<string>>();
    const requestB = deferred<CustomerAccountResult<string>>();
    const loader = vi.fn((token: string | null) =>
      token === "token-a" ? requestA.promise : requestB.promise,
    );
    const observations: Observation[] = [];
    const probe = createProbe(loader, observations);

    await probe.renderToken("token-a");
    await probe.renderToken("token-b");
    await act(async () => {
      requestB.resolve({ kind: "ok", data: "member-b" });
      await requestB.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-b");
    const rendersBeforeLateA = observations.length;

    await act(async () => {
      requestA.resolve({ kind: "ok", data: "member-a" });
      await requestA.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-b");
    expect(observations).toHaveLength(rendersBeforeLateA);
  });

  it("ignores an aborted A request after a token swap", async () => {
    const requestA = deferred<CustomerAccountResult<string>>();
    const requestB = deferred<CustomerAccountResult<string>>();
    const loader = vi.fn((token: string | null) =>
      token === "token-a" ? requestA.promise : requestB.promise,
    );
    const observations: Observation[] = [];
    const probe = createProbe(loader, observations);

    await probe.renderToken("token-a");
    await probe.renderToken("token-b");
    const rendersBeforeAbort = observations.length;
    await act(async () => {
      requestA.reject(new DOMException("The request was aborted.", "AbortError"));
      await requestA.promise.catch(() => undefined);
    });
    expect(probe.container.textContent).toBe("loading");
    expect(observations).toHaveLength(rendersBeforeAbort);

    await act(async () => {
      requestB.resolve({ kind: "ok", data: "member-b" });
      await requestB.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-b");
  });

  it("hides ready member data synchronously when the token is removed", async () => {
    const requestA = deferred<CustomerAccountResult<string>>();
    const signedOut = deferred<CustomerAccountResult<string>>();
    const loader = vi.fn((token: string | null) =>
      token === null ? signedOut.promise : requestA.promise,
    );
    const observations: Observation[] = [];
    const probe = createProbe(loader, observations);

    await probe.renderToken("token-a");
    await act(async () => {
      requestA.resolve({ kind: "ok", data: "member-a" });
      await requestA.promise;
    });
    expect(probe.container.textContent).toBe("ready:member-a");

    observations.length = 0;
    await probe.renderToken(null);
    const signedOutRenders = observations.filter(({ token }) => token === null);
    expect(signedOutRenders.length).toBeGreaterThan(0);
    expect(signedOutRenders).not.toContainEqual({
      token: null,
      state: "ready",
      data: "member-a",
    });
    expect(probe.container.textContent).toBe("loading");

    await act(async () => {
      signedOut.resolve({ kind: "denied", reason: "auth_required" });
      await signedOut.promise;
    });
    expect(probe.container.textContent).toBe("denied");
  });

  it("invalidates a pending request when its consumer unmounts", async () => {
    const pending = deferred<CustomerAccountResult<string>>();
    const loader = vi.fn(() => pending.promise);
    const observations: Observation[] = [];
    const probe = createProbe(loader, observations);

    await probe.renderToken("token-a");
    await probe.unmount();
    const rendersBeforeCompletion = observations.length;

    await act(async () => {
      pending.resolve({ kind: "ok", data: "member-a" });
      await pending.promise;
    });
    expect(observations).toHaveLength(rendersBeforeCompletion);
    expect(probe.container.textContent).toBe("");
  });
});
