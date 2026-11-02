// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportCaseSummaryDto } from "@shared/research/customer-account/contract";

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("../core", () => ({ useResearch: () => ({ memberToken: session.token }) }));
vi.mock("../account-portal/AccountPortalShell", () => ({
  AccountPortalShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import AccountSupport from "./AccountSupport";

const API = "/api/research/customer-account/support";
const draft = { subject: "Synthetic support question", description: "Please help with this synthetic account question." };
const caseOf = (owner: string): SupportCaseSummaryDto => ({
  id: `case-${owner}`, category: "account", subject: `${owner} private support case`, state: "open",
  lastUpdateAt: "2026-11-01T00:00:00.000Z", responseExpectation: "Synthetic support expectation.",
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Request = ReturnType<typeof deferred<Response>> & { method: string; init: RequestInit; owner: string | null };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
let host: HTMLDivElement;
let root: Root;
let pending: Request[];
let reads: Map<string | null, number>;
let fetchMock: ReturnType<typeof vi.fn>;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
async function render(owner: string | null) {
  session.token = owner ? `synthetic-${owner}` : null;
  await act(async () => root.render(<AccountSupport />));
  await flush();
}
async function typeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function fill() {
  await typeValue(host.querySelector<HTMLInputElement>("#support-subject")!, draft.subject);
  await typeValue(host.querySelector<HTMLTextAreaElement>("#support-description")!, draft.description);
}
function expectDraft() {
  expect(host.querySelector<HTMLInputElement>("#support-subject")!.value).toBe(draft.subject);
  expect(host.querySelector<HTMLTextAreaElement>("#support-description")!.value).toBe(draft.description);
}
async function submit() {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
function refreshButton() {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Refresh cases");
  expect(button, "An explicit case-history refresh must be reachable in the production support mount").toBeDefined();
  return button!;
}
async function refresh() {
  await act(async () => refreshButton().click());
  return pending[pending.length - 1]!;
}
function assertPrivateRead(request: Request, owner: string) {
  expect(request.method).toBe("GET");
  expect(request.owner).toBe(owner);
  expect(request.init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  expect(new Headers(request.init.headers).get("Authorization")).toBe(`Bearer synthetic-${owner}`);
  expect(request.init.body).toBeUndefined();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  pending = [];
  reads = new Map();
  session.token = null;
  fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    expect(String(input)).toBe(API);
    const method = init.method ?? "GET";
    const bearer = new Headers(init.headers).get("Authorization");
    const owner = bearer?.startsWith("Bearer synthetic-") ? bearer.slice("Bearer synthetic-".length) : null;
    if (method === "GET") {
      const count = (reads.get(owner) ?? 0) + 1;
      reads.set(owner, count);
      if (count === 1) return Promise.resolve(response({ kind: "ok", data: [caseOf(owner ?? "missing")] }));
    }
    const request = { ...deferred<Response>(), method, init, owner };
    pending.push(request);
    return request.promise;
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("explicit member-bound support history refresh", () => {
  it("checks history after an uncertain submission without automatically posting again or losing the draft", async () => {
    await render("owner-a");
    await fill();
    await submit();
    const write = pending[0]!;
    expect(write.method).toBe("POST");
    // A lost response cannot establish that the server did not save a case.
    await act(async () => write.reject(new Error("synthetic reply lost after an unknown server outcome")));
    await flush();
    expect(host.textContent).toContain("We couldn't confirm whether your support request was recorded.");
    expect(host.textContent).not.toContain("Your account was not changed");
    expect(host.textContent).not.toContain("The request could not be recorded");
    expectDraft();
    expect(reads.get("owner-a")).toBe(1);
    expect(pending).toHaveLength(1);

    const read = await refresh();
    assertPrivateRead(read, "owner-a");
    expect(host.textContent).toContain("Refreshing support cases.");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await submit();
    expect(pending.filter((item) => item.method === "POST")).toHaveLength(1);
    expectDraft();
    const recovered = { ...caseOf("owner-a"), id: "case-previous-submit", subject: draft.subject };
    await act(async () => read.resolve(response({ kind: "ok", data: [recovered] })));
    await flush();
    expect(host.querySelectorAll(".account-list-card")).toHaveLength(1);
    expect(host.querySelector(".account-list-card")!.textContent).toContain(draft.subject);
    expect(host.textContent).toContain("Case history refreshed. Check it before submitting again.");
    expectDraft();
    expect(pending.filter((item) => item.method === "POST")).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it("replaces a locally confirmed case with fresh canonical state without duplication", async () => {
    await render("owner-a");
    await fill();
    await submit();
    const created = { ...caseOf("owner-a"), id: "case-confirmed", subject: draft.subject };
    await act(async () => pending[0]!.resolve(response({ kind: "ok", data: created })));
    await flush();
    expect(host.querySelectorAll(".account-list-card")).toHaveLength(2);
    const read = await refresh();
    await act(async () => read.resolve(response({ kind: "ok", data: [{ ...created, state: "resolved", responseExpectation: "Synthetic resolved state from refresh." }] })));
    await flush();
    expect(host.querySelectorAll(".account-list-card")).toHaveLength(1);
    expect(host.querySelector(".account-list-card")!.textContent).toContain("Resolved");
    expect(host.querySelector(".account-list-card")!.textContent).toContain("Synthetic resolved state from refresh.");
    expect(host.textContent).not.toContain(caseOf("owner-a").subject);
    expect(pending.filter((item) => item.method === "POST")).toHaveLength(1);
  });

  it.each(["service error", "transport error"])("keeps prior history and unsent edits after a refresh %s, then permits an explicit retry", async (failure) => {
    await render("owner-a");
    await fill();
    const read = await refresh();
    if (failure === "service error") await act(async () => read.resolve(response({ kind: "error" }, 503)));
    else await act(async () => read.reject(new Error("synthetic private transport detail")));
    await flush();
    expect(host.textContent).toContain("Cases could not be refreshed. Previously loaded history is still shown and may be out of date.");
    expect(host.textContent).toContain(caseOf("owner-a").subject);
    expect(host.textContent).not.toContain("No support cases are visible");
    expect(host.textContent).not.toContain("synthetic private transport detail");
    expectDraft();
    expect(reads.get("owner-a")).toBe(2);
    const retry = await refresh();
    await act(async () => retry.resolve(response({ kind: "ok", data: [] })));
    await flush();
    expect(host.textContent).toContain("No support cases are visible");
    expect(host.textContent).not.toContain(caseOf("owner-a").subject);
    expect(host.textContent).not.toContain("Cases could not be refreshed");
    expectDraft();
    expect(pending.every((item) => item.method === "GET")).toBe(true);
  });

  it("closes the private form and history when the explicit refresh is denied", async () => {
    await render("owner-a");
    await fill();
    const read = await refresh();
    await act(async () => read.resolve(response({ kind: "denied", reason: "synthetic private denial detail" }, 403)));
    await flush();
    expect(host.querySelector('[data-testid="account-denied"]')).not.toBeNull();
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("#support-subject")).toBeNull();
    expect(host.textContent).not.toContain(caseOf("owner-a").subject);
    expect(host.innerHTML).not.toContain(draft.subject);
    expect(host.textContent).not.toContain("synthetic private denial detail");
    expect(pending.every((item) => item.method === "GET")).toBe(true);
  });

  it.each(["success", "failure"])("discards an old owner's late refresh %s after the member changes", async (outcome) => {
    await render("owner-a");
    await fill();
    const oldRead = await refresh();
    await render("owner-b");
    expect(host.textContent).toContain(caseOf("owner-b").subject);
    expect(host.textContent).not.toContain(caseOf("owner-a").subject);
    expect(host.querySelector<HTMLInputElement>("#support-subject")!.value).toBe("");
    if (outcome === "success") await act(async () => oldRead.resolve(response({ kind: "ok", data: [caseOf("old-owner-secret")] })));
    else await act(async () => oldRead.reject(new Error("old owner's private error")));
    await flush();
    expect(host.textContent).toContain(caseOf("owner-b").subject);
    expect(host.textContent).not.toContain("old-owner-secret");
    expect(host.textContent).not.toContain("old owner's private error");
    expect(host.textContent).not.toContain("Cases could not be refreshed");
    expect(reads.get("owner-a")).toBe(2);
    expect(reads.get("owner-b")).toBe(1);
    expect(host.innerHTML).not.toContain("synthetic-owner-");
  });

  it("discards an outstanding private refresh on sign-out without fetching anonymously", async () => {
    await render("owner-a");
    const read = await refresh();
    await render(null);
    await act(async () => read.resolve(response({ kind: "ok", data: [caseOf("signed-out-secret")] })));
    await flush();
    expect(host.querySelector('[data-testid="account-denied"]')).not.toBeNull();
    expect(host.textContent).not.toContain("signed-out-secret");
    expect(host.querySelector("form")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("discards a late refresh after the old view is unmounted and replaced", async () => {
    await render("owner-a");
    const oldRead = await refresh();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render("owner-b");
    await act(async () => oldRead.resolve(response({ kind: "ok", data: [caseOf("unmounted-secret")] })));
    await flush();
    expect(host.textContent).toContain(caseOf("owner-b").subject);
    expect(host.textContent).not.toContain("unmounted-secret");
    expect(host.textContent).not.toContain("Case history refreshed");
  });

  it("starts one explicit GET for two clicks before the pending render", async () => {
    await render("owner-a");
    const button = refreshButton();
    await act(async () => { button.click(); button.click(); });
    expect(reads.get("owner-a")).toBe(2);
    expect(pending).toHaveLength(1);
    await act(async () => pending[0]!.resolve(response({ kind: "ok", data: [caseOf("owner-a")] })));
    await flush();
    expect(refreshButton().disabled).toBe(false);
  });

  it("does not overlap an explicit refresh with an outstanding support POST", async () => {
    await render("owner-a");
    await fill();
    await submit();
    expect(refreshButton().disabled).toBe(true);
    await act(async () => refreshButton().click());
    expect(reads.get("owner-a")).toBe(1);
    expect(pending).toHaveLength(1);
    await act(async () => pending[0]!.resolve(response({ kind: "error" }, 503)));
    await flush();
    expect(refreshButton().disabled).toBe(false);
    expectDraft();
  });
});
