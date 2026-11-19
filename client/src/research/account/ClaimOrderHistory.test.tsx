// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, ResearchProvider, useResearch, type ResearchContextValue } from "../core";
import { RequireMember } from "../pages/MemberArea";
import ClaimOrderHistory, { HistoryClaimOperationBoundary } from "./ClaimOrderHistory";
import { HISTORY_CLAIM_PATH, HISTORY_CLAIM_OPERATION_TTL_MS, historyClaimSession } from "./history-claim-api";

const authFixture = vi.hoisted(() => {
  type Session = { access_token: string; user: { id: string } };
  const state = { session: null as Session | null };
  const listeners = new Set<(event: string, session: Session | null) => void>();
  return { state, listeners, auth: {
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    onAuthStateChange: vi.fn((listener: (event: string, session: Session | null) => void) => {
      listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signOut: vi.fn(async () => { state.session = null; for (const listener of listeners) listener("SIGNED_OUT", null); return { error: null }; }),
  }, emit(event: string, session: Session | null) { state.session = session; for (const listener of listeners) listener(event, session); } };
});
vi.mock("@/lib/supabaseBrowser", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabaseBrowser")>(), getSupabaseBrowser: async () => ({ auth: authFixture.auth }),
}));

// Partner navigation is outside this personal claim contract; the real shell,
// Research context, claim adapter, DOM forms and fetch boundary remain mounted.
vi.mock("../adapters/partner", () => ({ getPartnerSelf: vi.fn(async () => ({ kind: "denied", code: "partner_not_found" })) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const token = "A".repeat(43), reference = "eac_" + "a".repeat(32);
const jwt = (actor = id(1), session = id(2), revision = 1) => "e30." + btoa(JSON.stringify({ sub: actor, session_id: session, iat: revision,
  amr: [{ method: "password" }] })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "") + ".eA";
const context = (actor = id(1)) => ({ ok: true, auth: { userId: actor, email: "fixture@example.invalid", emailVerified: true },
  personal: { memberId: id(4), firstName: "Synthetic", lastName: "Customer", status: "active" }, organizations: [],
  security: { passwordChangeRequired: false, mfaAvailable: false, passkeyAvailable: false } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const link = () => HISTORY_CLAIM_PATH + "?claim=" + id(3) + "&token=" + token;
const success = (replayed = false) => json({ ok: true, customerRef: reference, linked: !replayed, replayed });
function deferred() { let resolve!: (value: Response) => void, reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let host: HTMLDivElement, root: Root, fetcher: ReturnType<typeof vi.fn<typeof fetch>>, state: ResearchContextValue;
beforeEach(() => {
  window.history.replaceState(null, "", HISTORY_CLAIM_PATH);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  state = { member: { status: "active", firstName: "Synthetic", applicationStatus: "approved_customer", cartScope: "fixture-own-scope" },
    memberToken: jwt(), memberChecking: false, memberSessionStatus: "authenticated", recovery: "none", signOutMember: vi.fn(async () => {}) } as unknown as ResearchContextValue;
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json(context())); vi.stubGlobal("fetch", fetcher);
  authFixture.state.session = { access_token: jwt(), user: { id: id(1) } }; authFixture.listeners.clear();
  window.sessionStorage.clear(); window.localStorage.clear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
async function render(next = state, strict = false) {
  state = next; const location = memoryLocation({ path: HISTORY_CLAIM_PATH, static: true });
  const page = <ResearchContext.Provider value={next}><Router hook={location.hook}><HistoryClaimOperationBoundary><ClaimOrderHistory /></HistoryClaimOperationBoundary></Router></ResearchContext.Provider>;
  await act(async () => root.render(strict ? <StrictMode>{page}</StrictMode> : page));
}
const button = (label: string) => [...host.querySelectorAll("button")].find(element => element.textContent === label);
const referenceChoice = "I already have a customer reference from Xenios";
const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
async function openReferenceForm() {
  const control = button(referenceChoice); expect(control).toBeDefined();
  await act(async () => control!.click());
}
async function input(selector: string, value: string) {
  const element = host.querySelector(selector) as HTMLInputElement; expect(element).not.toBeNull();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit(label: string) {
  const form = host.querySelector(`form[aria-label="${label}"]`); expect(form).not.toBeNull();
  await act(async () => form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
function noSuccessOrCredential() {
  expect(host.textContent).not.toContain("Order history is now linked"); expect(host.textContent).not.toContain(token);
  expect(host.innerHTML).not.toContain(token);
}

describe("connected personal history claim", () => {
  it("uses the actual flat server context and personal-only explicit challenge request", async () => {
    await render(); expect(fetcher).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
    expect(host.querySelectorAll("main")).toHaveLength(1); expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("select")).toBeNull(); expect(host.textContent).toContain("No paid membership activation is needed");
    await openReferenceForm(); await input("#history-customer-ref", reference);
    fetcher.mockResolvedValueOnce(json({ ok: true, claimId: id(3), deliveryAccepted: true })); await submit("Request history challenge");
    expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({ customerRef: reference, target: { subjectType: "personal" } });
    expect(host.textContent).toContain("accepted for delivery"); noSuccessOrCredential();
    await input("#history-token", token); fetcher.mockResolvedValueOnce(success()); await submit("Confirm history claim");
    expect(JSON.parse(String(posts()[1][1]?.body))).toEqual({ claimId: id(3), challengeToken: token, expectedSubjectType: "personal" });
    expect(host.textContent).toContain("Order history is now linked to your account");
    expect(host.querySelector('a[href="/research/account/orders"]')).not.toBeNull(); expect(posts()).toHaveLength(2);
  });
  it("scrubs a real emailed query before its own API dispatch, verifies context first, and never auto-confirms", async () => {
    window.history.replaceState({ oldNavigation: token }, "", link()); const held = deferred();
    fetcher.mockImplementationOnce(() => { expect(window.location.search).toBe(""); return held.promise; });
    const storage = vi.spyOn(Storage.prototype, "setItem"); await render();
    expect(window.location.pathname).toBe(HISTORY_CLAIM_PATH); expect(window.location.search).toBe(""); expect(window.history.state).toBeNull();
    expect(button("Confirm and link")).toBeUndefined(); expect(posts()).toHaveLength(0); noSuccessOrCredential();
    await act(async () => held.resolve(json(context())));
    expect(button("Confirm and link")).toBeDefined(); expect(posts()).toHaveLength(0);
    expect(button(referenceChoice)).toBeUndefined(); expect(host.querySelector("#history-customer-ref")).toBeNull();
    expect(host.querySelector('form[aria-label="Request history challenge"]')).toBeNull();
    expect([...host.querySelectorAll("a")].map(a => a.getAttribute("href")).join(" ")).not.toMatch(/claim=|token=/);
    expect(storage).not.toHaveBeenCalled(); fetcher.mockResolvedValueOnce(success(true)); await submit("Confirm history claim");
    expect(host.textContent).toContain("already linked to your account"); expect(posts()).toHaveLength(1);
  });
  it("retains the one ephemeral link through initial canonical checking without creating a second Auth store", async () => {
    window.history.replaceState(null, "", link()); const ready = state;
    await render({ ...state, member: null, memberToken: null, memberChecking: true, memberSessionStatus: "checking" });
    expect(fetcher).not.toHaveBeenCalled(); expect(window.location.search).toBe("");
    await render(ready); expect(button("Confirm and link")).toBeDefined(); expect(posts()).toHaveLength(0);
  });
  it.each(["signed-out", "recovery", "verification-failed"])("drops captured proof through %s and asks to reopen after sign-in", async kind => {
    window.history.replaceState(null, "", link()); const ready = state;
    await render({ ...state, member: null, memberToken: null, memberSessionStatus: kind === "verification-failed" ? "verification_failed" : "signed_out",
      recovery: kind === "recovery" ? "pending" : "none" });
    expect(fetcher).not.toHaveBeenCalled(); expect(window.location.search).toBe(""); noSuccessOrCredential();
    const signIn = [...host.querySelectorAll("a")].find(a => a.textContent === "Sign in");
    expect(signIn?.getAttribute("href")).toMatch(/^\/research\/sign-in(?:\?|$)/); expect(signIn?.getAttribute("href")).not.toMatch(/claim=|token=/);
    await render(ready); expect(button("Confirm and link")).toBeUndefined(); expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined(); expect(posts()).toHaveLength(0);
  });
  it.each(["duplicate", "unknown", "fragment"])("scrubs and refuses a %s credential without POST", async kind => {
    const url = link() + (kind === "duplicate" ? "&token=" + token : kind === "unknown" ? "&role=admin" : "#private");
    window.history.replaceState(null, "", url); await render();
    expect(window.location.search).toBe(""); expect(window.location.hash).toBe("");
    expect(button("Confirm and link")).toBeUndefined(); expect(host.textContent).toContain("not valid"); expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
  it("leaves foreign-path queries alone and never reads or posts from the wrong leaf", async () => {
    const query = "?claim=" + id(3) + "&token=" + token;
    window.history.replaceState(null, "", "/research/account" + query); await render();
    expect(window.location.search).toBe(query); expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("not available here"); noSuccessOrCredential();
  });
  it("does not read or post if the leaf URL scrub fails", async () => {
    window.history.replaceState(null, "", link());
    vi.spyOn(window.history, "replaceState").mockImplementationOnce(() => { throw new Error("PRIVATE_SENTINEL"); });
    await render(); expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("not available here");
    expect(host.textContent).not.toContain("PRIVATE_SENTINEL"); noSuccessOrCredential();
  });
  it("does not call delivery accepted a completed claim, including deliveryAccepted=false", async () => {
    await render(); await openReferenceForm(); await input("#history-customer-ref", reference);
    fetcher.mockResolvedValueOnce(json({ ok: true, claimId: id(3), deliveryAccepted: false })); await submit("Request history challenge");
    expect(host.textContent).toContain("Email delivery was not confirmed"); expect(host.textContent).not.toContain("accepted for delivery"); noSuccessOrCredential();
    expect(button("Send ownership challenge")).toBeUndefined(); expect(posts()).toHaveLength(1);
  });
  it("keeps a lost confirmation exact through same-session token refresh and explicit retry", async () => {
    window.history.replaceState(null, "", link()); await render();
    fetcher.mockRejectedValueOnce(new Error("PRIVATE_SENTINEL")); await submit("Confirm history claim");
    const original = String(posts()[0][1]?.body); expect(button("Retry the same confirmation")).toBeDefined(); noSuccessOrCredential();
    await render({ ...state, memberToken: jwt(id(1), id(2), 2) });
    expect(button("Retry the same confirmation")).toBeDefined(); expect(posts()).toHaveLength(1);
    fetcher.mockResolvedValueOnce(success(true)); await submit("Confirm history claim");
    expect(String(posts()[1][1]?.body)).toBe(original); expect(posts()[1][1]?.headers).toMatchObject({ Authorization: "Bearer " + state.memberToken });
    expect(host.textContent).toContain("already linked to your account"); expect(host.textContent).not.toContain("PRIVATE_SENTINEL");
  });
  it("does not repeat an uncertain challenge request", async () => {
    await render(); await openReferenceForm(); await input("#history-customer-ref", reference);
    fetcher.mockRejectedValueOnce(new Error("lost")); await submit("Request history challenge");
    expect(host.textContent).toContain("No second request has been sent"); expect(posts()).toHaveLength(1);
    expect(button("Send ownership challenge")).toBeUndefined(); expect(button("Confirm and link")).toBeUndefined();
  });
  it("cannot enable a captured link from a context completing after sign-out", async () => {
    window.history.replaceState(null, "", link()); const held = deferred(), ready = state; fetcher.mockReturnValueOnce(held.promise);
    await render(); expect(button("Confirm and link")).toBeUndefined();
    await render({ ...state, member: null, memberToken: null, memberSessionStatus: "signed_out" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => held.resolve(json(context()))); expect(button("Confirm and link")).toBeUndefined();
    await render(ready); expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined(); expect(button("Confirm and link")).toBeUndefined(); expect(posts()).toHaveLength(0);
  });
  it("ignores held actor A context after current actor B was checked", async () => {
    window.history.replaceState(null, "", link()); const held = deferred(); fetcher.mockReturnValueOnce(held.promise); await render();
    fetcher.mockResolvedValueOnce(json(context(id(9)))); await render({ ...state, memberToken: jwt(id(9), id(10)) });
    expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined();
    await act(async () => held.resolve(json(context())));
    expect(button("Confirm and link")).toBeUndefined(); expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined(); noSuccessOrCredential(); expect(posts()).toHaveLength(0);
  });
  it("treats an old-token confirmation reply as uncertain and retries the original under the refreshed session", async () => {
    window.history.replaceState(null, "", link()); await render(); const held = deferred(); fetcher.mockReturnValueOnce(held.promise);
    await submit("Confirm history claim"); const original = String(posts()[0][1]?.body);
    await render({ ...state, memberToken: jwt(id(1), id(2), 2) }); expect(button("Confirm and link")).toBeUndefined();
    await act(async () => held.resolve(success())); noSuccessOrCredential();
    expect(button("Retry the same confirmation")).toBeDefined();
    fetcher.mockResolvedValueOnce(success(true)); await submit("Confirm history claim");
    expect(String(posts()[1][1]?.body)).toBe(original); expect(host.textContent).toContain("already linked to your account");
  });
  it.each(["actor", "session", "signout", "recovery"])("drops proof and ignores held successful confirmation after %s", async kind => {
    window.history.replaceState(null, "", link()); await render(); const held = deferred();
    fetcher.mockReturnValueOnce(held.promise); await submit("Confirm history claim");
    if (kind === "actor") { fetcher.mockResolvedValueOnce(json(context(id(9)))); await render({ ...state, memberToken: jwt(id(9), id(10)) }); }
    else if (kind === "session") await render({ ...state, memberToken: jwt(id(1), id(10)) });
    else await render({ ...state, member: null, memberToken: null, memberSessionStatus: "signed_out", recovery: kind === "recovery" ? "pending" : "none" });
    await act(async () => held.resolve(success())); noSuccessOrCredential(); expect(posts()).toHaveLength(1);
    expect(button("Confirm and link")).toBeUndefined(); expect(button("Retry the same confirmation")).toBeUndefined();
  });
  it.each([[401, "AUTH_REQUIRED"], [403, "CUSTOMER_EMAIL_MISMATCH"], [428, "PASSWORD_CHANGE_REQUIRED"], [400, "CLAIM_CHALLENGE_INVALID"]] as const)(
    "keeps HTTP%s confirmation denial terminal", async (status, code) => {
      window.history.replaceState(null, "", link()); await render();
      fetcher.mockResolvedValueOnce(json({ ok: false, code, message: "PRIVATE_SENTINEL" }, status)); await submit("Confirm history claim");
      noSuccessOrCredential(); expect(host.textContent).not.toContain("PRIVATE_SENTINEL"); expect(button("Retry the same confirmation")).toBeUndefined();
      expect(button("Confirm and link")).toBeUndefined(); expect(posts()).toHaveLength(1);
    });
  it.each(["foreign-actor", "unverified", "missing-personal", "unavailable"])("enables no action from %s context", async kind => {
    window.history.replaceState(null, "", link()); const value: Record<string, unknown> = context();
    if (kind === "foreign-actor") (value.auth as { userId: string }).userId = id(9);
    if (kind === "unverified") (value.auth as { emailVerified: boolean }).emailVerified = false;
    if (kind === "missing-personal") value.personal = null;
    fetcher.mockResolvedValueOnce(kind === "unavailable" ? json({ ok: false, code: "SERVICE_UNAVAILABLE", message: "PRIVATE_SENTINEL" }, 503) : json(value));
    await render(); expect(host.querySelector("form")).toBeNull(); expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
  it("fences synchronous double confirmation and late unmounted results", async () => {
    window.history.replaceState(null, "", link()); await render(); const held = deferred(); fetcher.mockReturnValueOnce(held.promise);
    const form = host.querySelector("form")!;
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(posts()).toHaveLength(1); await act(async () => root.unmount()); root = createRoot(host);
    await act(async () => held.resolve(success())); expect(host.textContent).not.toContain("linked");
  });
  it("keeps capture stable across StrictMode effect replay without posting", async () => {
    window.history.replaceState(null, "", link()); await render(state, true);
    expect(window.location.search).toBe(""); expect(button("Confirm and link")).toBeDefined(); expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
  it("expires captured proof through repeated unavailable context reads and cannot rearm it with a later retry", async () => {
    vi.useFakeTimers(); window.history.replaceState(null, "", link());
    fetcher.mockImplementation(async () => json({ ok: false, code: "SERVICE_UNAVAILABLE", message: "safe" }, 503)); await render();
    const oldRetry = button("Check account again")!; expect(oldRetry).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(HISTORY_CLAIM_OPERATION_TTL_MS - 1_000); oldRetry.click(); });
    expect(button("Check account again")).toBeDefined(); expect(posts()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(host.textContent).toContain("claim session has ended"); expect(button("Check account again")).toBeUndefined();
    fetcher.mockImplementation(async () => json(context())); await act(async () => oldRetry.click()); await render();
    expect(host.textContent).toContain("claim session has ended"); expect(button("Confirm and link")).toBeUndefined(); expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
  it("does not start a fresh lifetime when context finally succeeds just before captured proof expires", async () => {
    vi.useFakeTimers(); window.history.replaceState(null, "", link());
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "SERVICE_UNAVAILABLE", message: "safe" }, 503)); await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(HISTORY_CLAIM_OPERATION_TTL_MS - 1_000); });
    fetcher.mockResolvedValueOnce(json(context())); await act(async () => button("Check account again")!.click());
    expect(button("Confirm and link")).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(host.textContent).toContain("claim session has ended"); expect(button("Confirm and link")).toBeUndefined(); expect(posts()).toHaveLength(0);
  });
  it("does not let an old capture timer affect a successor actor's operation", async () => {
    vi.useFakeTimers(); const timers = vi.spyOn(globalThis, "setTimeout");
    window.history.replaceState(null, "", link()); await render();
    const oldExpiries = timers.mock.calls.filter(([, delay]) => Number(delay) > 30_000).map(([callback]) => callback as () => void);
    expect(oldExpiries.length).toBeGreaterThan(0); fetcher.mockResolvedValueOnce(json(context(id(9))));
    await render({ ...state, memberToken: jwt(id(9), id(10)) }); await openReferenceForm(); await input("#history-customer-ref", reference);
    const held = deferred(); fetcher.mockReturnValueOnce(held.promise); await submit("Request history challenge");
    await act(async () => { for (const expire of oldExpiries) expire(); });
    expect(host.textContent).toContain("Requesting your ownership challenge"); expect(host.textContent).not.toContain("claim session has ended");
    await act(async () => held.resolve(json({ ok: true, claimId: id(8), deliveryAccepted: false })));
    expect(host.textContent).toContain("Email delivery was not confirmed"); expect(posts()).toHaveLength(1); timers.mockRestore();
  });
});

describe("history help without an internal customer reference", () => {
  it("defaults to current account history and approved FAQ support without a private-reference form or automatic request", async () => {
    await render();
    expect(host.textContent).toContain("Missing earlier orders?");
    expect(host.textContent).toContain("You do not need a customer reference");
    expect(host.textContent).toContain("support coverage and response times are not guaranteed");
    for (const [label, path] of [["View account history", "/research/account/orders"], ["Read FAQs and support options", "/research/faq"], ["Get support", "/research/support"]]) {
      const action = [...host.querySelectorAll("a")].find(element => element.textContent === label);
      expect(action?.getAttribute("href")).toBe(path);
    }
    expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined();
    expect(host.querySelector("#history-customer-ref")).toBeNull(); expect(host.querySelector("form")).toBeNull();
    expect(host.innerHTML).not.toContain("eac_"); expect(fetcher).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
  });
  it("opens the manual form only after opt-in and returns to help with cleared input and no POST", async () => {
    await render(); await openReferenceForm();
    const field = host.querySelector<HTMLInputElement>("#history-customer-ref")!;
    expect(field.pattern).toBe("eac_[a-f0-9]{32}"); expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-describedby")).toBe("history-customer-ref-help");
    expect(host.textContent).toContain("This is not your request reference or order number");
    await input("#history-customer-ref", reference); expect(posts()).toHaveLength(0);
    await act(async () => button("Back to history help")!.click());
    expect(host.querySelector("#history-customer-ref")).toBeNull(); expect(document.activeElement).toBe(button(referenceChoice));
    await openReferenceForm(); expect(host.querySelector<HTMLInputElement>("#history-customer-ref")!.value).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
  it("refuses a public XRI reference without guessing a customer identity or requesting a challenge", async () => {
    await render(); await openReferenceForm(); await input("#history-customer-ref", "XRI-" + "A".repeat(32));
    await submit("Request history challenge");
    expect(host.textContent).toContain("customer reference is not valid");
    expect(posts()).toHaveLength(0); expect(fetcher).toHaveBeenCalledTimes(1); noSuccessOrCredential();
    await act(async () => button("Back to history help")!.click());
    expect(host.textContent).toContain("Missing earlier orders?"); expect(host.querySelector("#history-customer-ref")).toBeNull();
  });
  it("does not expose Back or another manual request while the original challenge request is pending or unconfirmed", async () => {
    await render(); await openReferenceForm(); await input("#history-customer-ref", reference);
    const held = deferred(); fetcher.mockReturnValueOnce(held.promise); await submit("Request history challenge");
    expect(posts()).toHaveLength(1); expect(button("Back to history help")).toBeUndefined(); expect(button(referenceChoice)).toBeUndefined();
    await act(async () => held.reject(new Error("unconfirmed")));
    expect(host.textContent).toContain("No second request has been sent");
    expect(button("Back to history help")).toBeUndefined(); expect(button(referenceChoice)).toBeUndefined(); expect(posts()).toHaveLength(1);
  });
  it("keeps help and opt-in gated by a fresh current account context when the source was unavailable", async () => {
    fetcher.mockResolvedValueOnce(json({ ok: false, code: "SERVICE_UNAVAILABLE", message: "safe" }, 503));
    await render(); expect(button(referenceChoice)).toBeUndefined(); expect(host.querySelector("#history-customer-ref")).toBeNull();
    fetcher.mockResolvedValueOnce(json(context())); await act(async () => button("Check account again")!.click());
    expect(button(referenceChoice)).toBeDefined(); expect(button("Send ownership challenge")).toBeUndefined(); expect(posts()).toHaveLength(0);
  });
  it("resets the optional manual entry when the verified actor changes instead of carrying a private reference forward", async () => {
    await render(); await openReferenceForm(); await input("#history-customer-ref", reference);
    fetcher.mockResolvedValueOnce(json(context(id(9)))); await render({ ...state, memberToken: jwt(id(9), id(10)) });
    expect(host.querySelector("#history-customer-ref")).toBeNull(); expect(button(referenceChoice)).toBeDefined();
    await openReferenceForm(); expect(host.querySelector<HTMLInputElement>("#history-customer-ref")!.value).toBe("");
    expect(posts()).toHaveLength(0); noSuccessOrCredential();
  });
});

describe("actual ResearchProvider and RequireMember refresh lifecycle", () => {
  let memberGate: ReturnType<typeof deferred> | null;
  let confirmGate: ReturnType<typeof deferred> | null;
  let confirmResult: "lost" | "replayed-wire" | "invalid";
  const memberResponse = (status = "active") => json({ ok: true, member: { firstName: "Synthetic", status,
    applicationStatus: "approved_customer", cartScope: "a".repeat(64) } });
  function Probe() {
    const value = useResearch();
    return <output data-testid="actual-provider" data-phase={value.memberSessionStatus}
      data-member={value.member ? "present" : "absent"} data-token={value.memberToken ? "present" : "absent"} />;
  }
  async function mountProvider() {
    window.history.replaceState(null, "", link()); memberGate = null; confirmGate = null; confirmResult = "lost";
    fetcher.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path === "/api/research/me") return json({ configured: true, authed: false });
      if (path === "/api/research/member/me") {
        if (memberGate) { const held = memberGate; memberGate = null; return held.promise; }
        return memberResponse();
      }
      if (path === "/api/research/catalog") return json({ products: [], commerce: { research: false, consumer: false }, email: "" });
      if (path === "/api/research/account/context") {
        const bearer = new Headers(init?.headers).get("Authorization")?.slice(7);
        return json(context(historyClaimSession(bearer)?.actorAuthUserId));
      }
      if (path === "/api/research/account/claims/confirm") {
        if (confirmGate) { const held = confirmGate; confirmGate = null; return held.promise; }
        if (confirmResult === "lost") throw new Error("synthetic lost reply");
        return confirmResult === "invalid" ? json({ ok: false, code: "CLAIM_CHALLENGE_INVALID", message: "safe" }, 400) : success(true);
      }
      throw new Error("unexpected fixture path");
    });
    const location = memoryLocation({ path: HISTORY_CLAIM_PATH, static: true });
    await act(async () => root.render(<Router hook={location.hook}><ResearchProvider>
      <HistoryClaimOperationBoundary><Probe /><RequireMember><ClaimOrderHistory /></RequireMember></HistoryClaimOperationBoundary>
    </ResearchProvider></Router>));
    expect(button("Confirm and link")).toBeDefined();
  }
  const historyReads = () => fetcher.mock.calls.filter(([url]) => String(url) === "/api/research/account/context").length;
  async function beginActualRefresh() {
    const held = deferred(); memberGate = held; const before = historyReads();
    await act(async () => authFixture.emit("TOKEN_REFRESHED", { access_token: jwt(id(1), id(2), 2), user: { id: id(1) } }));
    const probe = host.querySelector('[data-testid="actual-provider"]')!;
    expect(probe.getAttribute("data-phase")).toBe("checking"); expect(probe.getAttribute("data-member")).toBe("absent");
    expect(probe.getAttribute("data-token")).toBe("absent"); expect(host.querySelector('[data-testid="claim-order-history"]')).toBeNull();
    expect(historyReads()).toBe(before); expect(host.querySelector("form")).toBeNull(); return held;
  }
  it("restores the same uncertain original only after the real provider's checking/null/unmount and fresh context", async () => {
    await mountProvider(); await submit("Confirm history claim"); const original = String(posts()[0][1]?.body);
    expect(button("Retry the same confirmation")).toBeDefined(); const held = await beginActualRefresh(); expect(posts()).toHaveLength(1);
    await act(async () => held.resolve(memberResponse()));
    expect(host.querySelector('[data-testid="actual-provider"]')?.getAttribute("data-phase")).toBe("authenticated");
    expect(historyReads()).toBe(2); expect(button("Retry the same confirmation")).toBeDefined(); expect(posts()).toHaveLength(1);
    confirmResult = "replayed-wire"; await submit("Confirm history claim");
    expect(String(posts()[1][1]?.body)).toBe(original); expect(JSON.parse(original).expectedSubjectType).toBe("personal");
    // Synthetic wire-contract acceptance only; the real consumed-challenge RPC
    // retry is a separate backend limitation, never established by this fixture.
    expect(host.textContent).toContain("already linked to your account");
  });
  it("keeps a held original POST pending across guard remount, then accepts no stale success and handles actual retry denial", async () => {
    await mountProvider(); const oldReply = deferred(); confirmGate = oldReply; await submit("Confirm history claim");
    const original = String(posts()[0][1]?.body), held = await beginActualRefresh();
    await act(async () => held.resolve(memberResponse()));
    expect(host.textContent).toContain("Confirming your history claim"); expect(button("Retry the same confirmation")).toBeUndefined();
    expect(posts()).toHaveLength(1); await act(async () => oldReply.resolve(success())); noSuccessOrCredential();
    expect(button("Retry the same confirmation")).toBeDefined(); confirmResult = "invalid"; await submit("Confirm history claim");
    expect(String(posts()[1][1]?.body)).toBe(original); expect(button("Retry the same confirmation")).toBeUndefined();
    expect(host.textContent).toContain("not valid"); noSuccessOrCredential();
  });
  it.each(["signed-out", "recovery", "verification-denial", "inactive", "actor", "session"])(
    "retires the retained operation on actual %s during the guarded checking interval", async kind => {
      await mountProvider(); await submit("Confirm history claim"); const held = await beginActualRefresh();
      if (kind === "signed-out") await act(async () => authFixture.emit("SIGNED_OUT", null));
      if (kind === "recovery") await act(async () => authFixture.emit("PASSWORD_RECOVERY", authFixture.state.session));
      if (kind === "verification-denial") await act(async () => held.resolve(json({ ok: false, code: "account_access_required" }, 403)));
      else if (kind === "inactive") await act(async () => held.resolve(memberResponse("closed")));
      else if (kind === "actor" || kind === "session") await act(async () => authFixture.emit("SIGNED_IN", {
        access_token: jwt(kind === "actor" ? id(9) : id(1), id(10), 3), user: { id: kind === "actor" ? id(9) : id(1) },
      }));
      if (kind !== "verification-denial" && kind !== "inactive") await act(async () => held.resolve(memberResponse()));
      if (kind !== "recovery") await act(async () => authFixture.emit("SIGNED_IN", { access_token: jwt(id(1), id(2), 4), user: { id: id(1) } }));
      expect(button("Retry the same confirmation")).toBeUndefined(); expect(button("Confirm and link")).toBeUndefined();
      expect(posts()).toHaveLength(1); noSuccessOrCredential();
    });
  it("expires rather than renews an inert uncertain operation while the real member probe is held", async () => {
    vi.useFakeTimers();
    await mountProvider(); await submit("Confirm history claim"); const held = await beginActualRefresh();
    vi.setSystemTime(Date.now() + HISTORY_CLAIM_OPERATION_TTL_MS + 1);
    await act(async () => held.resolve(memberResponse()));
    expect(button("Retry the same confirmation")).toBeUndefined(); expect(button("Confirm and link")).toBeUndefined();
    expect(posts()).toHaveLength(1); noSuccessOrCredential();
  });
});
