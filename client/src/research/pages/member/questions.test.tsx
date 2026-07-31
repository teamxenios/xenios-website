// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import Questions from "./Questions";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const context = {
  gate: "open",
  member: { firstName: "M", status: "active", applicationStatus: null },
  memberToken: "raw-token",
  memberChecking: false,
  recovery: "none",
} as ResearchContextValue;

const question = {
  questionId: "q-1",
  category: "plan",
  status: "answer_ready",
  source: "web",
  bodyText: "Should I keep the current plan?",
  transcriptMediaId: null,
  answerText: "Keep the current plan.",
  answeredAt: "2026-07-30T12:00:00.000Z",
  rating: null,
  followUpOfQuestionId: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  slaTargetAt: "2026-07-30T22:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function capabilities() {
  return json({ ok: true, capabilities: { questions: { enabled: true }, telegram_support: { enabled: true } } });
}

async function renderWith(handler: (path: string, init: RequestInit) => Promise<Response>) {
  __resetCapabilitiesCache();
  vi.stubGlobal("fetch", vi.fn(handler));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context}><main><Questions /></main></ResearchContext.Provider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  __resetCapabilitiesCache();
  vi.unstubAllGlobals();
});

describe("Questions", () => {
  it("renders one main/H1 and truthful empty and unlinked states", async () => {
    const view = await renderWith(async (path) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [] });
      return json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
    });
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("No questions yet");
    expect(view.textContent).toContain("Not linked");
    expect(view.textContent).not.toMatch(/queue|guarantee|within 12/i);
  });

  it("fails closed without displaying malformed server content", async () => {
    const view = await renderWith(async (path) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [{ ...question, status: "HOSTILE_STATUS", bodyText: "HOSTILE_BODY" }] });
      return json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
    });
    expect(view.textContent).toContain("response could not be verified");
    expect(view.textContent).not.toContain("HOSTILE_BODY");
  });

  it.each([
    ["HOSTILE_ARRAY_SOURCE", { source: ["web"], bodyText: "HOSTILE_ARRAY_SOURCE" }],
    ["HOSTILE_OBJECT_SOURCE", { source: { type: "web" }, bodyText: "HOSTILE_OBJECT_SOURCE" }],
    ["HOSTILE_MISSING_WEB_BODY", { source: "web", bodyText: null, answerText: "HOSTILE_MISSING_WEB_BODY" }],
    ["HOSTILE_MISSING_VOICE_MEDIA", { source: "telegram_voice", bodyText: null, transcriptMediaId: null, answerText: "HOSTILE_MISSING_VOICE_MEDIA" }],
    ["HOSTILE_LOOSE_DATE", { createdAt: "July 30, 2026", bodyText: "HOSTILE_LOOSE_DATE" }],
  ])("hides hostile marker %s and makes no invalid voice/media claim", async (marker, patch) => {
    const view = await renderWith(async (path) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [{ ...question, ...patch }] });
      return json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
    });
    expect(view.textContent).toContain("response could not be verified");
    expect(view.textContent).not.toContain(marker);
    expect(view.textContent).not.toContain("Submitted by voice");
    expect(view.textContent).not.toContain("recording is available");
    expect(view.textContent).not.toContain("private media");
  });

  it("shows voice/media copy only for a valid telegram_voice relationship", async () => {
    const voice = {
      ...question,
      source: "telegram_voice",
      bodyText: null,
      transcriptMediaId: "media-1",
    };
    const view = await renderWith(async (path) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [voice] });
      return json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
    });
    expect(view.textContent).toContain("Submitted by voice");
    expect(view.textContent).toContain("recording is available in your private media");
  });

  it("shows unauthorized and unavailable states without raw server errors", async () => {
    const unauthorized = await renderWith(async (path) => path === "/api/research/capabilities"
      ? capabilities()
      : path === "/api/research/questions"
        ? json({ ok: false, code: "unauthorized", message: "RAW_SECRET_ERROR" }, 401)
        : json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } }));
    expect(unauthorized.textContent).toContain("session has ended");
    expect(unauthorized.textContent).not.toContain("RAW_SECRET_ERROR");
  });

  it("renders a valid answer and saves a keyboard-native rating", async () => {
    const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [question] });
      if (path === "/api/research/telegram") return json({ ok: true, state: { linked: true, linkedAt: "2026-07-30T12:00:00.000Z", telegramDisplayName: "Member" } });
      if (path.endsWith("/rate") && init.method === "POST") return json({ ok: true });
      return json({ ok: true });
    });
    const view = await renderWith(fetchMock);
    expect(view.textContent).toContain("Keep the current plan");
    const rating = view.querySelector('input[name="rating-q-1"][value="5"]') as HTMLInputElement;
    await act(async () => { rating.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.textContent).toContain("Rating saved: 5 of 5");
    expect(fetchMock).toHaveBeenCalledWith("/api/research/questions/q-1/rate", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer raw-token" }),
    }));
  });

  it("submits the canonical request and explains rate limiting", async () => {
    const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions" && init.method === "GET") return json({ ok: true, questions: [] });
      if (path === "/api/research/questions" && init.method === "POST") return json({ ok: false, code: "rate_limited", message: "RAW_LIMIT" }, 429);
      return json({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
    });
    const view = await renderWith(fetchMock);
    const textarea = view.querySelector("#question-body") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "May I ask another question?");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      (view.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.textContent).toContain("too many questions recently");
    expect(view.textContent).not.toContain("RAW_LIMIT");
  });

  it("unlinks with DELETE and never stores question text or a link token", async () => {
    const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
      if (path === "/api/research/capabilities") return capabilities();
      if (path === "/api/research/questions") return json({ ok: true, questions: [] });
      if (path === "/api/research/telegram" && init.method === "GET") return json({ ok: true, state: { linked: true, linkedAt: "2026-07-30T12:00:00.000Z", telegramDisplayName: "Member" } });
      return json({ ok: true });
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const view = await renderWith(fetchMock);
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent === "Unlink Telegram")!;
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock).toHaveBeenCalledWith("/api/research/telegram/link", expect.objectContaining({ method: "DELETE" }));
    expect(view.textContent).toContain("Telegram was unlinked");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
