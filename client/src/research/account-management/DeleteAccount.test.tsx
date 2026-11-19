// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteAccount, { type LifecycleSession } from "./DeleteAccount";
import { unavailableLifecycle, type AccountLifecycleEnvelope } from "@shared/research/account-lifecycle";
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const actorId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000002", hash = "a".repeat(64);
const a: LifecycleSession = { state: "ready", actorId, accessToken: "captured-A", instance: {} };
const b: LifecycleSession = { state: "ready", actorId: "30000000-0000-4000-8000-000000000003", accessToken: "captured-B", instance: {} };
let root: Root, host: HTMLDivElement, fetcher: ReturnType<typeof vi.fn<typeof fetch>>, preview: AccountLifecycleEnvelope;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); }
async function mount(session: LifecycleSession = a, initialOperationId?: string) { await act(async () => root.render(<DeleteAccount session={session} initialOperationId={initialOperationId} />)); await flush(); }
async function click(text: string) { const node = [...host.querySelectorAll("button")].find(button => button.textContent === text)!;
  expect(node).toBeDefined(); await act(async () => node.click()); await flush(); }
beforeEach(() => {
  preview = { ...unavailableLifecycle("policy_unavailable"), operationId, version: 1, state: "confirmation_required",
    preview: { digest: hash, expiresAt: new Date(Date.now() + 60000).toISOString(), policyRevision: hash, coverageRevision: hash }, blockers: [], nextAction: "confirm" };
  fetcher = vi.fn<typeof fetch>().mockImplementation(async path => String(path).endsWith("/attempt")
    ? json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }) : json(preview));
  vi.stubGlobal("fetch", fetcher); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("self-only lifecycle presentation, never deletion authority", () => {
  it("stays unavailable without captured canonical session and never creates a provider/account effect on mount", async () => {
    await mount({ state: "unavailable" }); expect(host.querySelector("button")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("independently verified recent authentication");
  });
  it("posts only a retry hint then private carrier, preserving captured A and exposing no token, target or client assurance in body/URL/storage", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem"); await mount(); await click("Review account closure");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = fetcher.mock.calls; expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ retryKey: expect.any(String) });
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ attemptCarrier: "x".repeat(40) });
    for (const [path, options] of calls) { expect(String(path)).not.toContain("captured-A"); expect(String(options?.body)).not.toContain("captured-A");
      expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin", redirect: "error", headers: { Authorization: "Bearer captured-A" } }); }
    expect(store).not.toHaveBeenCalled(); expect(host.textContent).toContain(operationId);
  });
  it("uses only the same preview/version at confirmation and keeps uncertainty instead of claiming deletion", async () => {
    await mount(); await click("Review account closure");
    fetcher.mockResolvedValueOnce(json({ protocol: "account-lifecycle/v1", code: "outcome_uncertain" }, 503)); await click("Confirm account closure request");
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ operationId, previewDigest: hash, expectedVersion: 1, confirm: true });
    expect(host.textContent).toContain(operationId); expect(host.textContent).toContain("check its status before any further action");
    expect(host.textContent).not.toContain("All declared deletion obligations are verified");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retries a lost prepare reply with the exact same carrier, not a new issue or attempt", async () => {
    fetcher.mockImplementationOnce(async () => json({ protocol: "account-lifecycle/v1", attemptCarrier: "x".repeat(40), expiresAt: preview.preview!.expiresAt }));
    fetcher.mockRejectedValueOnce(Error("synthetic lost committed preview reply"));
    await mount(); await click("Review account closure"); expect(host.textContent).toContain("Keep this attempt");
    await click("Retry the same preview request");
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/attempt"))).toHaveLength(1);
    expect(fetcher.mock.calls.slice(1).map(([, options]) => options?.body)).toEqual([JSON.stringify({ attemptCarrier: "x".repeat(40) }), JSON.stringify({ attemptCarrier: "x".repeat(40) })]);
  });
  it("never reissues or reconfirms an unknown provider operation, only checks its existing private status", async () => {
    const unknown: AccountLifecycleEnvelope = { ...preview, state: "auth_outcome_unknown", preview: null,
      progress: { ...preview.progress, application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"], nextAction: "authorized_review" };
    fetcher.mockImplementation(async () => json(unknown)); await mount(a, operationId); await click("Check current status");
    expect(host.textContent).toContain("No second deletion will be sent"); expect(host.querySelectorAll("button")).toHaveLength(1);
    await click("Check current status"); expect(fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("conceals A operation and discards its late response after B or unmount, without claiming an issued A operation was cancelled", async () => {
    const held = deferred<Response>(); fetcher.mockReturnValueOnce(held.promise);
    await mount(a, operationId); await click("Check current status"); await mount(b);
    expect(host.textContent).not.toContain(operationId);
    held.resolve(json(preview)); await flush(); expect(host.textContent).not.toContain(operationId);
    expect(host.textContent).not.toContain("cancelled"); expect(fetcher).toHaveBeenCalledTimes(1);
    const heldAgain = deferred<Response>(); fetcher.mockReturnValueOnce(heldAgain.promise);
    await mount(a, operationId); await click("Check current status"); act(() => root.render(<p>Other page</p>));
    heldAgain.resolve(json(preview)); await flush(); expect(host.textContent).toBe("Other page");
  });
  it("renders retained/blocked/completed states truthfully and disables an expired preview", async () => {
    await mount(a, operationId);
    for (const state of ["blocked", "completed_with_retention", "completed"] as const) {
      const result: AccountLifecycleEnvelope = { ...preview, state, preview: null, nextAction: state === "blocked" ? "authorized_review" : "none",
        blockers: state === "blocked" ? ["replay_cleanup_unproven"] : [], progress: { application: "verified", providerSessions: "verified", eligibleData: "verified",
          authIdentity: "verified", retainedData: state === "completed_with_retention" ? "retained" : "not_applicable" } };
      fetcher.mockResolvedValueOnce(json(result)); await click("Check current status");
      if (state === "blocked") expect(host.textContent).toContain("replay cleanup unproven");
      if (state === "completed_with_retention") expect(host.textContent).toContain("Records remain under the approved retention policy");
      if (state === "completed") expect(host.textContent).toContain("All declared deletion obligations are verified");
    }
    fetcher.mockResolvedValueOnce(json({ ...preview, preview: { ...preview.preview!, expiresAt: new Date(Date.now() - 1000).toISOString() } }));
    await click("Check current status"); expect([...host.querySelectorAll("button")].find(node => node.textContent === "Confirm account closure request")!.disabled).toBe(true);
  });
  it("rejects malformed/oversized/false completion responses and retains the current operation", async () => {
    await mount(a, operationId);
    for (const reply of [json({ ...preview, state: "completed", progress: { ...preview.progress, authIdentity: "unknown" } }),
      new Response("x".repeat(17000)), new Response("not-json")]) {
      fetcher.mockResolvedValueOnce(reply); await click("Check current status");
      expect(host.textContent).toContain("existing operation has not been cleared or repeated"); expect(host.textContent).not.toContain("All declared deletion obligations are verified");
    }
  });
});
