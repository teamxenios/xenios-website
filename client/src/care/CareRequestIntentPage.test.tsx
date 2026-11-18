// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CareRequestIntentPage from "./CareRequestIntentPage";
import type { RequestWorkflowV1, StartReviewV1 } from "@shared/research/assisted-order/request-intent-workflow";

const auth = vi.hoisted(() => ({ session: null as Session | null,
  callback: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: {
    getSession: auth.getSession,
    onAuthStateChange: (callback: typeof auth.callback) => {
      auth.callback = callback;
      return { data: { subscription: { unsubscribe: () => {
        auth.unsubscribe(); if (auth.callback === callback) auth.callback = null;
      } } } };
    },
  } }),
  isRecoveryAccessToken: (token: string) => token.includes("synthetic-recovery"),
}));
vi.mock("@/components/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/SeoHead", () => ({ default: ({ robots }: { robots: string }) => <meta name="robots" content={robots} /> }));
vi.mock("../research/assisted-order/assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SUBJECT = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const ID = "30000000-0000-4000-8000-000000000001";
const REFERENCE = "XRI-30000000000040008000000000000001";
const at = "2026-11-18T03:00:00.000Z";
let sessionNumber = 0;
function providerSession(subject = SUBJECT, previous?: Session): Session {
  const old = previous ? JSON.parse(atob(previous.access_token.split(".")[1])) as { session_id: string; generation: number } : null;
  const claims = { sub: subject, session_id: old?.session_id ?? "90000000-0000-4000-8000-" + String(++sessionNumber).padStart(12, "0"),
    generation: (old?.generation ?? 0) + 1, amr: [{ method: "password" }] };
  const encoded = btoa(JSON.stringify(claims)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { access_token: "synthetic." + encoded + ".signature", refresh_token: "synthetic-unused",
    token_type: "bearer", expires_in: 3600, user: { id: subject, email: "fixture@example.invalid" } } as Session;
}
function workflow(reviewing = false): RequestWorkflowV1 {
  return { schemaVersion: 1, requestId: ID, publicReference: REFERENCE, state: reviewing ? "reviewing" : "queued",
    revision: reviewing ? 2 : 1, changedAt: at, customerNotice: "pending", events: [
      { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: at },
      { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: at },
      ...(reviewing ? [{ id: "40000000-0000-4000-8000-000000000003", revision: 2, kind: "review_started" as const, occurredAt: at }] : []),
    ] };
}
const receipt = { kind: "unapproved_selection_request", requestId: ID, publicReference: REFERENCE, status: "pending_review", createdAt: at };
const detail = { ...receipt, agreements: [], lines: [], contact: { fullLegalName: "Synthetic staff fixture",
  email: "fixture@example.invalid", mobilePhone: "+15555550123", ageConfirmed: true, billingSameAsShipping: true,
  shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" } } };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let container: HTMLDivElement, root: Root;
let server: { allowed: boolean; reviewing: boolean; workflowStatus: number; commands: StartReviewV1[];
  start?: (command: StartReviewV1) => Promise<Response>; read?: () => Promise<Response>; privateRead?: () => Promise<Response> };
function button(name: string) { return [...container.querySelectorAll("button")].find(node => node.textContent === name); }
async function click(name: string) { expect(button(name), name).toBeTruthy(); await act(async () => button(name)!.click()); }
async function input(control: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(key = "page") {
  await act(async () => { root.render(<CareRequestIntentPage key={key} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function openRequest() {
  await input(container.querySelector<HTMLInputElement>('input')!, REFERENCE);
  await click("Retrieve private request");
}
async function confirm() { await click("Start review"); await click("Confirm start review"); }
async function emit(event: string, value: Session | null) {
  await act(async () => { auth.session = value; auth.callback?.(event, value); });
}
beforeEach(() => {
  auth.session = null; auth.callback = null; auth.unsubscribe.mockClear();
  auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: auth.session } }));
  window.history.replaceState(null, "", "/care/request-intents");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  server = { allowed: true, reviewing: false, workflowStatus: 200, commands: [] };
  vi.stubGlobal("fetch", vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
    const url = String(path);
    if (url.endsWith("/start-review") && init?.method === "POST") {
      const command = JSON.parse(init.body as string) as StartReviewV1; server.commands.push(command);
      if (server.start) return server.start(command);
      server.reviewing = true; return json({ replay: false, workflow: workflow(true) });
    }
    if (url.endsWith("/workflow")) {
      if (server.read) return server.read();
      if (server.workflowStatus !== 200) return json({ error: server.workflowStatus === 503 ? "request_workflow_unavailable" : "forbidden" }, server.workflowStatus);
      return json({ workflow: workflow(server.reviewing), canStartReview: server.allowed && !server.reviewing });
    }
    if (url.includes("/staff?page=")) return json({ items: [{ ...receipt, lineCount: 0 }], total: 1, page: 1, pageSize: 25 });
    if (url.endsWith("/staff/" + ID)) return server.privateRead ? server.privateRead() : json(detail);
    return json({ error: "fixture_unexpected_request" }, 404);
  }));
  let commandSequence = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => "70000000-0000-4000-8000-" + String(++commandSequence).padStart(12, "0") as ReturnType<typeof crypto.randomUUID>);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("private staff workflow wiring (synthetic provider/server, real canonical transport)", () => {
  it("requires sign-in, keeps noindex and the exact private return destination", async () => {
    await mount();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fcare%2Frequest-intents");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads with the current ordinary bearer and never posts on mount, retrieval or confirmation opening", async () => {
    auth.session = providerSession(); await mount(); await openRequest();
    const first = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(first[1]?.headers).get("Authorization")).toBe("Bearer " + auth.session.access_token);
    expect(first[1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    expect(server.commands).toEqual([]); await click("Start review"); expect(server.commands).toEqual([]);
    await click("Confirm start review");
    expect(server.commands).toHaveLength(1); expect(server.commands[0].expectedRevision).toBe(1);
    expect(container.textContent).toContain("State: Reviewing | Revision 2");
    expect(container.textContent).toContain("saved request receipt remains pending review");
  });
  it.each([false, 403, 503] as const)("exposes no command when current processing availability is %s", async (mode) => {
    auth.session = providerSession(); if (mode === false) server.allowed = false; else server.workflowStatus = mode;
    await mount(); await openRequest();
    expect(button("Start review")).toBeUndefined(); expect(button("Confirm start review")).toBeUndefined();
    expect(server.commands).toEqual([]);
  });
  it("preserves the same-session draft DOM and same uncertain command through token rotation", async () => {
    const original = providerSession(); auth.session = original; await mount(); await openRequest();
    const referenceInput = container.querySelector<HTMLInputElement>('input')!;
    const totalLabel = [...container.querySelectorAll('label')].find(node => node.textContent?.startsWith("Final total"))!;
    const total = totalLabel.querySelector<HTMLInputElement>('input')!; await input(total, "1.25");
    server.start = async () => { throw new TypeError("synthetic lost response"); };
    await confirm(); expect(server.commands).toHaveLength(1);
    const frozen = server.commands[0];
    const rotated = providerSession(SUBJECT, original); await emit("TOKEN_REFRESHED", rotated);
    expect(container.querySelector('input')).toBe(referenceInput); expect(total.value).toBe("1.25"); expect(total.isConnected).toBe(true);
    expect(server.commands).toHaveLength(1);
    server.start = undefined; await click("Retry the same start-review attempt");
    expect(server.commands).toEqual([frozen, frozen]); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(new Headers(posts[1][1]?.headers).get("Authorization")).toBe("Bearer " + rotated.access_token);
  });
  it("retains the uncertain command across a real page unmount/remount in the same SDK session", async () => {
    auth.session = providerSession(); await mount(); await openRequest();
    server.start = async () => { throw new TypeError("synthetic lost response"); }; await confirm();
    const frozen = server.commands[0];
    await act(async () => root.render(<p>Another route</p>)); await mount("returned"); await openRequest();
    expect(button("Start review")).toBeUndefined(); server.start = undefined;
    await click("Retry the same start-review attempt"); expect(server.commands).toEqual([frozen, frozen]);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it("refreshes a valid409 through GET and requires a new explicit confirmation for queued state", async () => {
    auth.session = providerSession(); await mount(); await openRequest();
    server.start = async () => json({ error: "workflow_revision_conflict" }, 409); await confirm();
    expect(server.commands).toHaveLength(1); expect(container.textContent).toContain("requires a new confirmation");
    expect(button("Confirm start review")).toBeUndefined(); server.start = undefined; await confirm();
    expect(server.commands).toHaveLength(2); expect(server.commands[1].commandId).not.toBe(server.commands[0].commandId);
  });
  it("keeps a conflict followed by reviewing readback confirmed through page remount", async () => {
    auth.session = providerSession(); await mount(); await openRequest();
    server.start = async () => { server.reviewing = true; return json({ error: "workflow_revision_conflict" }, 409); };
    await confirm(); await mount("remounted"); await openRequest();
    expect(button("Start review")).toBeUndefined(); expect(button("Confirm start review")).toBeUndefined();
    expect(button("Retry the same start-review attempt")).toBeUndefined(); expect(server.commands).toHaveLength(1);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it("immediately drops confirmation and ignores an older private read on credential refresh", async () => {
    auth.session = providerSession(); await mount(); await openRequest(); await click("Start review");
    const old = deferred<Response>(); server.privateRead = () => old.promise;
    await input(container.querySelector<HTMLInputElement>('input')!, REFERENCE);
    await act(async () => button("Retrieve private request")!.click());
    server.allowed = false; const rotated = providerSession(SUBJECT, auth.session); await emit("TOKEN_REFRESHED", rotated);
    await act(async () => old.resolve(json({ ...detail, contact: { ...detail.contact, fullLegalName: "Obsolete private reply" } })));
    expect(button("Confirm start review")).toBeUndefined(); expect(container.textContent).not.toContain("Obsolete private reply");
    expect(server.commands).toEqual([]);
  });
  it("does not dispatch an old screen's command with a new SDK bearer despite no UI event", async () => {
    auth.session = providerSession(); await mount(); await openRequest(); await click("Start review");
    auth.session = providerSession(OTHER); await click("Confirm start review");
    expect(server.commands).toEqual([]); expect(container.textContent).toContain("outcome is unconfirmed");
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST"); expect(posts).toHaveLength(0);
  });
  it.each(["SIGNED_OUT", "PASSWORD_RECOVERY"])("revokes the workspace on %s and a late refresh cannot resurrect it", async (event) => {
    const original = providerSession(); auth.session = original; await mount(); await openRequest();
    const response = deferred<Response>(); server.start = () => response.promise;
    await click("Start review"); await act(async () => button("Confirm start review")!.click());
    const recovery = event === "PASSWORD_RECOVERY" ? { ...original, access_token: original.access_token + "-synthetic-recovery" } : null;
    await emit(event, recovery); await emit("TOKEN_REFRESHED", original);
    await act(async () => response.resolve(json({ replay: false, workflow: workflow(true) })));
    expect(container.textContent).toContain("Authorized Care sign-in required"); expect(container.textContent).not.toContain(detail.contact.email);
    expect(container.textContent).not.toContain("Review started."); expect(server.commands).toHaveLength(1);
    const replacement = providerSession(); await emit("SIGNED_IN", replacement);
    expect(container.textContent).toContain("Private request readback"); expect(container.querySelector<HTMLInputElement>('input')?.value).toBe("");
  });
  it.each([SUBJECT, OTHER])("gives a new canonical session for subject %s a new workspace and blocks old replies", async (subject) => {
    auth.session = providerSession(); await mount(); await openRequest(); await click("Start review");
    const replacement = providerSession(subject); await emit("SIGNED_IN", replacement);
    expect(button("Confirm start review")).toBeUndefined(); expect(container.querySelector<HTMLInputElement>('input')?.value).toBe("");
    expect(container.textContent).not.toContain(detail.contact.email); expect(server.commands).toEqual([]);
  });
  it("ignores an initial session read that resolves after an observed sign-out", async () => {
    const old = providerSession(); auth.session = old; const pending = deferred<{ data: { session: Session | null } }>();
    auth.getSession.mockImplementationOnce(() => pending.promise); await mount();
    await emit("SIGNED_OUT", null); await act(async () => pending.resolve({ data: { session: old } }));
    expect(container.textContent).toContain("Authorized Care sign-in required"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["missing-subject", "missing-session", "mismatched-subject", "malformed", "recovery"])("withholds processing for an unconfirmed %s identity", async (kind) => {
    const value = providerSession();
    if (kind === "missing-subject") value.user = { id: "" } as Session["user"];
    if (kind === "missing-session") value.access_token = "synthetic." + btoa(JSON.stringify({ sub: SUBJECT })) + ".signature";
    if (kind === "mismatched-subject") value.user.id = OTHER;
    if (kind === "malformed") value.access_token = "synthetic-malformed";
    if (kind === "recovery") value.access_token += "-synthetic-recovery";
    auth.session = value; await mount();
    expect(button("Start review")).toBeUndefined(); expect(server.commands).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
});
