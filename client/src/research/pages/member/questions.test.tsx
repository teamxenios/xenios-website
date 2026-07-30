// @vitest-environment jsdom
// The member Questions page (/research/member/questions). What this pins:
//
//   1. THE GATE FIX: the page renders the real surface (form + history) for a
//      member even though the capability registry emits no "questions" key.
//      It previously gated the whole surface on that never-emitted key, so
//      every member saw a single disabled card forever.
//   2. THE WIRE FIX: the list renders real server rows in the shared
//      MemberQuestion shape from GET /api/research/questions (subject derived
//      from the member's own first line, status vocabulary verbatim), and
//      submitting posts the server's QuestionCreateRequest shape to the
//      registered POST /api/research/questions route.
//   3. The voice and Telegram panels stay honestly gated behind their REAL
//      registry keys (private_media, telegram_support) while those are off.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import Questions from "./Questions";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  __resetCapabilitiesCache();
  window.localStorage.clear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

// A real server row in the shared MemberQuestion contract shape. The first
// line of bodyText is the subject convention the form writes.
const WIRE_QUESTION = {
  questionId: "q-1",
  category: "plan",
  status: "answer_ready",
  source: "web",
  bodyText: "Timing the evening protocol\n\nOn late training days, should the evening steps move earlier?",
  transcriptMediaId: null,
  answerText: "Keep them anchored to bedtime for now.",
  answeredAt: "2026-07-20T10:00:00.000Z",
  rating: null,
  followUpOfQuestionId: null,
  createdAt: "2026-07-19T08:00:00.000Z",
  slaTargetAt: "2026-07-19T20:00:00.000Z",
};

// The registry as the server emits it: the six shared keys plus the commerce
// pair. There is deliberately NO "questions" key.
const REGISTRY = {
  ok: true,
  capabilities: {
    identity_verification: { enabled: false },
    private_media: { enabled: false },
    telegram_support: { enabled: false },
    infinity_events: { enabled: false },
    document_rendering: { enabled: false },
    assessment: { enabled: false },
    product_commerce: { enabled: false },
    quantum_commerce: { enabled: false },
  },
};

type RecordedCall = { url: string; method: string; body: unknown };

function stubFetch(): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (String(url) === "/api/research/capabilities") return json(200, REGISTRY);
      if (String(url) === "/api/research/questions" && method === "GET") {
        return json(200, { ok: true, questions: [WIRE_QUESTION] });
      }
      if (String(url) === "/api/research/questions" && method === "POST") {
        return json(200, { ok: true, question: { ...WIRE_QUESTION, questionId: "q-2", status: "pending" } });
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
    root!.render(<ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>);
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("member Questions page", () => {
  it("renders the real surface with no whole-page capability card, and lists real server rows", async () => {
    stubFetch();
    const view = await renderPage(<Questions />);

    // The gate fix: no disabled "questions" capability card anywhere.
    expect(view.querySelector('[data-testid="ra-capability-questions"]')).toBeNull();

    // The real form is present.
    expect(view.querySelector("#question-subject")).not.toBeNull();
    expect(view.querySelector("#question-body")).not.toBeNull();

    // The real server row renders: subject from the member's own first line,
    // the verbatim status vocabulary, and the asked date.
    const row = view.querySelector('[data-testid="question-q-1"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Timing the evening protocol");
    expect(row!.textContent).toContain("Answer Ready");
    expect(row!.textContent).toContain("Asked 2026-07-19");

    // The voice and Telegram panels stay honestly gated on their REAL keys.
    expect(view.querySelector('[data-testid="ra-capability-private_media"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="ra-capability-telegram_support"]')).not.toBeNull();
  });

  it("submits the server's QuestionCreateRequest shape to the registered route", async () => {
    const calls = stubFetch();
    const view = await renderPage(<Questions />);

    setValue(view.querySelector("#question-subject") as HTMLInputElement, "Travel week");
    setValue(view.querySelector("#question-body") as HTMLTextAreaElement, "How should I handle a travel week?");
    const form = view.querySelector('form[aria-label="Ask a new question"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    const post = calls.find((c) => c.method === "POST" && c.url === "/api/research/questions");
    expect(post).toBeDefined();
    expect(post!.body).toEqual({
      category: "other",
      bodyText: "Travel week\n\nHow should I handle a travel week?",
    });
    expect(view.textContent).toContain("Question sent.");
  });
});
