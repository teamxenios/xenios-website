// @vitest-environment jsdom
// Actual ResearchProvider + SignIn + Care transport, with synthetic Auth and
// endpoint responses only. No managed provider login or staff grant is tested.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "wouter";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Session = { access_token: string; user: { id: string } };
const supa = vi.hoisted(() => {
  const state = { session: null as Session | null,
    nextSession: null as Promise<{ data: { session: Session | null } }> | null };
  const listeners = new Set<(event: string, session: Session | null) => void>();
  const emit = (event: string, session: Session | null) => {
    state.session = session;
    for (const listener of listeners) listener(event, session);
  };
  const unsubscribe = vi.fn();
  let sessionSequence = 0;
  const auth = {
    getSession: vi.fn(async () => {
      if (state.nextSession) {
        const pending = state.nextSession;
        state.nextSession = null;
        return pending;
      }
      return { data: { session: state.session } };
    }),
    signInWithPassword: vi.fn(async () => {
      const subject = "20000000-0000-4000-8000-000000000001";
      const sessionId = "91000000-0000-4000-8000-" + String(++sessionSequence).padStart(12, "0");
      const claims = btoa(JSON.stringify({ sub: subject, session_id: sessionId, amr: [{ method: "password" }] }));
      const session = { access_token: "synthetic." + claims + ".synthetic-password-token", user: { id: subject } };
      emit("SIGNED_IN", session);
      return { data: { session }, error: null };
    }),
    onAuthStateChange: vi.fn((listener: (event: string, session: Session | null) => void) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => {
        unsubscribe(); listeners.delete(listener);
      } } } };
    }),
    signOut: vi.fn(async () => { emit("SIGNED_OUT", null); return { error: null }; }),
  };
  return { state, auth, emit, listeners, unsubscribe };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  isRecoveryAccessToken: (token: string) => token.includes("recovery"),
  clearPersistedRecoverySession: vi.fn(() => true),
  revokeRecoverySession: vi.fn(async () => {}),
}));
vi.mock("@/components/PageShell", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));

import { clearPersistedRecoverySession, revokeRecoverySession } from "@/lib/supabaseBrowser";
import CareRequestIntentPage from "../../care/CareRequestIntentPage";
import { ResearchProvider, useResearch } from "../core";
import SignIn from "./SignIn";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const snapshots: Array<{ gate: string; member: string; token: string; products: number; items: number }> = [];
function Probe() {
  const value = useResearch();
  snapshots.push({ gate: value.gate, member: value.member?.firstName ?? "", token: value.memberToken ?? "",
    products: value.products.length, items: value.items.length });
  return <output data-testid="provider-state" data-status={value.memberSessionStatus}
    data-recovery={value.recovery} data-gate={value.gate} />;
}
function Harness() {
  const [path] = useLocation();
  if (path === "/care/request-intents") return <CareRequestIntentPage />;
  if (path === "/research/account-executive") return <p data-testid="ae-shell-boundary">AE workspace owns authorization</p>;
  if (path !== "/research/sign-in") return <p>Research destination</p>;
  return <ResearchProvider><Probe /><SignIn /></ResearchProvider>;
}
let root: Root | null;
let container: HTMLDivElement;
let memberResponse: ReturnType<typeof deferred<Response>>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount() {
  await act(async () => { root!.render(<Harness />); });
  await flush();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const [selector, value] of [["#ms-email", "staff@example.invalid"], ["#ms-password", "synthetic-test-password"]]) {
      const input = container.querySelector(selector)!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}
function submit() {
  act(() => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
function expectNoCustomerAccess() {
  expect(snapshots.every((value) => value.member === "" && value.token === ""
    && value.products === 0 && value.items === 0 && value.gate !== "open")).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/catalog"))).toBe(false);
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  expect(supa.auth.signOut).not.toHaveBeenCalled();
  expect(clearPersistedRecoverySession).not.toHaveBeenCalled();
  expect(revokeRecoverySession).not.toHaveBeenCalled();
}
function expectCareDeniedWithRetainedAuth() {
  const claims = JSON.parse(globalThis.atob(supa.state.session!.access_token.split(".")[1])) as { sub: string; session_id: string };
  expect(claims.sub).toBe(supa.state.session?.user.id);
  expect(claims.session_id).toMatch(/^91000000-0000-4000-8000-\d{12}$/);
  expect(window.location.pathname).toBe("/care/request-intents");
  expect(container.textContent).toContain("Private queue access could not be confirmed.");
  const queue = fetchMock.mock.calls.find(([url]) => String(url).includes("/request-intents/staff?page=1"));
  expect(queue).toBeDefined();
  expect(new Headers(queue![1]?.headers).get("Authorization")).toBe("Bearer " + supa.state.session?.access_token);
  expect(queue![1]?.credentials).toBe("same-origin");
  expect(queue![1]?.cache).toBe("no-store");
  expect(supa.state.session?.access_token).toMatch(/^synthetic\.[^.]+\.synthetic-password-token$/);
  expect(supa.unsubscribe).toHaveBeenCalledTimes(1); // ResearchProvider unmounted; Care is still subscribed.
  expectNoCustomerAccess();
}

beforeEach(() => {
  vi.clearAllMocks();
  supa.state.session = null;
  supa.state.nextSession = null;
  supa.listeners.clear();
  snapshots.length = 0;
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/research/sign-in?returnTo=%2Fcare%2Frequest-intents");
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  memberResponse = deferred<Response>();
  fetchMock = vi.fn<typeof fetch>(async (input, _init) => {
    const path = String(input);
    if (path === "/api/research/me") return json({ configured: true, authed: false });
    if (path === "/api/research/member/me") return memberResponse.promise;
    if (path.includes("/request-intents/staff?page=1")) return json({ error: "Synthetic staff permission refused" }, 403);
    throw new Error(`Unexpected synthetic request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  container.remove(); root = null;
  vi.unstubAllGlobals();
});

describe("staff continuation through the real ResearchProvider lifecycle", () => {
  it("returns an ordinary account to the AE boundary without creating customer membership", async () => {
    window.history.replaceState(null, "", "/research/sign-in?returnTo=%2Fresearch%2Faccount-executive");
    await mount(); submit(); await flush();
    expect(window.location.pathname).toBe("/research/account-executive");
    expect(container.querySelector('[data-testid="ae-shell-boundary"]')).not.toBeNull();
    expectNoCustomerAccess();
    await act(async () => { memberResponse.resolve(json({ ok: false, code: "account_access_required" }, 403)); });
    await flush(); expectNoCustomerAccess();
    expect(window.location.pathname).toBe("/research/account-executive");
  });
  it("allows Care after background customer verification refuses before navigation", async () => {
    await mount();
    const fresh = deferred<{ data: { session: Session | null } }>();
    supa.state.nextSession = fresh.promise;
    submit(); await flush(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/research/member/me")).toHaveLength(1);
    await act(async () => { memberResponse.resolve(json({ ok: false, code: "account_access_required" }, 403)); });
    await flush();
    expect(container.querySelector('[data-testid="provider-state"]')?.getAttribute("data-status")).toBe("verification_failed");
    expect(window.location.pathname).toBe("/research/sign-in");
    expectNoCustomerAccess();
    await act(async () => { fresh.resolve({ data: { session: supa.state.session } }); });
    await flush();
    expectCareDeniedWithRetainedAuth();
  });

  it.each(["denial", "stale success"])("fences late member %s after the Care handoff unmounts the provider", async outcome => {
    await mount(); submit(); await flush();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/research/member/me")).toHaveLength(1);
    expectCareDeniedWithRetainedAuth();
    const before = snapshots.length;
    await act(async () => { memberResponse.resolve(outcome === "denial"
      ? json({ ok: false, code: "account_closed" }, 403)
      : json({ ok: true, member: { firstName: "Stale private member", status: "active", applicationStatus: "active", cartScope: "a".repeat(64) } })); });
    await flush();
    expect(snapshots).toHaveLength(before);
    expectCareDeniedWithRetainedAuth();
  });

  it("rejects a recovery event arriving while the fresh Auth session read is pending", async () => {
    await mount();
    const fresh = deferred<{ data: { session: Session | null } }>();
    supa.state.nextSession = fresh.promise;
    submit(); await flush(1);
    await act(async () => { supa.emit("PASSWORD_RECOVERY", { access_token: "synthetic-recovery-token", user: { id: "20000000-0000-4000-8000-000000000001" } }); });
    await flush(1);
    expect(container.querySelector('[data-testid="provider-state"]')?.getAttribute("data-recovery")).toBe("pending");
    await act(async () => { fresh.resolve({ data: { session: supa.state.session } }); });
    await flush();
    expect(window.location.pathname).not.toBe("/care/request-intents");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/request-intents/staff"))).toBe(false);
    expectNoCustomerAccess();
  });

  it("cannot navigate when the sign-in component unmounts during the fresh Auth read", async () => {
    await mount();
    const fresh = deferred<{ data: { session: Session | null } }>();
    supa.state.nextSession = fresh.promise;
    submit(); await flush(1);
    act(() => { root!.unmount(); root = null; });
    await act(async () => { fresh.resolve({ data: { session: supa.state.session } }); memberResponse.resolve(json({ ok: false }, 403)); });
    await flush();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/request-intents/staff"))).toBe(false);
    expectNoCustomerAccess();
  });
});
