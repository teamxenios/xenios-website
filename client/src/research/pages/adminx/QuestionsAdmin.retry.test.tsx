// @vitest-environment jsdom
// Real inbox UI and adapter, with synthetic Auth and intercepted fetch only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";


(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// A ready admin session, so the page renders its body rather than the sign-in
// gate. Authority still belongs to the server on every API call.
const supa = vi.hoisted(() => ({
  auth: {
    getSession: async () => ({ data: { session: { access_token: "admin-token" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
  },
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
}));

import QuestionsAdmin from "./QuestionsAdmin";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.history.pushState({}, "", "/admin/research/questions/q1");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}


const row = { id: "q-synthetic", member_email: "synthetic@example.test", topic: "Synthetic topic", status: "open", asked_at: "2026-11-02T10:00:00Z", last_activity_at: null, body: "PRIVATE_BODY_NOT_FOR_INBOX" };
function setup(initial: number) {
  const state = { status: initial };
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url);
    if (path.startsWith("/api/admin/me")) return new Response(JSON.stringify({ success: true, email: "operator@example.test" }), { status: 200, headers: {"content-type":"application/json"} });
    if (!path.startsWith("/api/admin/research/questions?")) throw new Error("Unexpected synthetic fetch: " + path);
    calls.push(path);
    return new Response(JSON.stringify(state.status === 200 ? { ok: true, questions: [row] } : { message: "Synthetic refusal" }), {status: state.status, headers: {"content-type":"application/json"}});
  }));
  return { state, calls };
}
function retry(view: HTMLElement): HTMLButtonElement {
 const button = Array.from(view.querySelectorAll("button")).find(b => b.textContent === "Retry inbox");
 expect(button, "unavailable inbox has an explicit retry action").toBeDefined();
 return button!;
}
describe("operator inbox unavailable-read recovery", () => {
 it.each([503, 404, 501])("recovers a %s without claiming the inbox is empty", async status => {
  const { state, calls } = setup(status);
  const view = await renderPage(<QuestionsAdmin />);
  expect(view.textContent).toContain("question inbox is unavailable");
  expect(view.textContent).not.toContain("No questions in this queue");
  expect(calls).toHaveLength(1);
  state.status = 200;
  await act(async () => { retry(view).click(); });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toBe(calls[0]);
  expect(view.textContent).toContain("synthetic@example.test");
  expect(view.textContent).not.toContain("PRIVATE_BODY_NOT_FOR_INBOX");
  expect(view.querySelector('a[href="/admin/research/questions/q-synthetic"]')).not.toBeNull();
  expect(view.textContent).not.toContain("Retry inbox");
 });
 it("retains the chosen queue and typed search through retry", async () => {
  const { state, calls } = setup(503);
  const view = await renderPage(<QuestionsAdmin />);
  const tab = Array.from(view.querySelectorAll("button")).find(b => b.textContent === "Answered")!;
  await act(async () => { tab.click(); });
  const search = view.querySelector('input[type="search"]') as HTMLInputElement;
  expect(search).not.toBeNull();
  await act(async () => { setValue(search, "synthetic"); await new Promise(resolve => setTimeout(resolve, 350)); });
  state.status = 200;
  await act(async () => { retry(view).click(); });
  expect(calls.at(-1)).toContain("status=answered");
  expect(search.value).toBe("synthetic");
  expect(view.textContent).toContain("synthetic@example.test");
 });
 it("leaves a failed retry actionable without automatic retry or false empty state", async () => {
  const {calls} = setup(503);
  const view = await renderPage(<QuestionsAdmin />);
  await act(async () => { retry(view).click(); });
  expect(calls).toHaveLength(2);
  expect(retry(view).disabled).toBe(false);
  expect(view.textContent).not.toContain("No questions in this queue");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(calls).toHaveLength(2);
 });
 it.each([401,403])("retains the %s access boundary without the unavailable retry", async status => {
  setup(status);
  const view = await renderPage(<QuestionsAdmin />);
  expect(view.textContent).toContain(status === 401 ? "Your admin session has ended" : "Access denied");
  expect(view.textContent).not.toContain("Retry inbox");
  expect(view.textContent).not.toContain("synthetic@example.test");
 });
});
