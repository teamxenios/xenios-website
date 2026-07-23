// @vitest-environment jsdom
// The admin question answer composer against the REAL endpoint
// (POST /api/admin/research/questions/:id/answer, wire shape
// {answerText, status}). This pins the drift fix: the page previously posted
// a "/reply" path that never existed on the server, so every answer landed on
// the SPA catch-all and nothing was sent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { Route } from "wouter";

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

import QuestionAdminDetail from "./QuestionAdminDetail";

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

const QUESTION_PATH = "/api/admin/research/questions/q1";
const ANSWER_PATH = "/api/admin/research/questions/q1/answer";

const questionFixture = {
  id: "q1",
  member_email: "member@example.com",
  topic: "Dosing",
  status: "open",
  asked_at: "2026-07-20T10:00:00.000Z",
  body: "Which protocol applies here?",
  thread: [],
};

type RecordedCall = { url: string; method: string; body: string | undefined };

function stubFetch(answerStatus = 200, answerBody: unknown = { ok: true }): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      const json = (status: number, body: unknown) => ({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      });
      if (String(url).startsWith("/api/admin/me")) {
        return json(200, { success: true, email: "founder@xeniostechnology.com" });
      }
      if (String(url) === QUESTION_PATH && method === "GET") {
        return json(200, { ok: true, question: questionFixture });
      }
      if (String(url) === ANSWER_PATH && method === "POST") {
        return json(answerStatus, answerBody);
      }
      throw new TypeError(`unstubbed fetch: ${method} ${url}`);
    }),
  );
  return calls;
}

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

function page(): ReactNode {
  return <Route path="/admin/research/questions/:id" component={QuestionAdminDetail} />;
}

describe("QuestionAdminDetail answer composer", () => {
  it("posts the REAL answer endpoint with {answerText, status} and reloads the thread", async () => {
    const calls = stubFetch();
    const view = await renderPage(page());

    await act(async () => {
      setValue(byTestId<HTMLTextAreaElement>(view, "question-answer-text"), "Here is the plan.");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "question-answer-send").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(ANSWER_PATH);
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ answerText: "Here is the plan.", status: "answer_ready" });
    expect(view.textContent).toContain("Answer sent.");
    // The thread reloads after a sent answer.
    expect(calls.filter((c) => c.method === "GET" && c.url === QUESTION_PATH).length).toBeGreaterThanOrEqual(2);
  });

  it("posts more_information_needed when that status is selected", async () => {
    const calls = stubFetch();
    const view = await renderPage(page());

    await act(async () => {
      setValue(byTestId<HTMLTextAreaElement>(view, "question-answer-text"), "Which lot number is on the vial?");
      setValue(byTestId<HTMLSelectElement>(view, "question-answer-status"), "more_information_needed");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "question-answer-send").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({
      answerText: "Which lot number is on the vial?",
      status: "more_information_needed",
    });
    expect(view.textContent).toContain("asked for more information");
  });

  it("says nothing was sent when the endpoint is not published (never a fake success)", async () => {
    stubFetch(404, {});
    const view = await renderPage(page());

    await act(async () => {
      setValue(byTestId<HTMLTextAreaElement>(view, "question-answer-text"), "Here is the plan.");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "question-answer-send").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(view.textContent).toContain("nothing was sent");
    expect(view.textContent).not.toContain("Answer sent.");
  });
});
