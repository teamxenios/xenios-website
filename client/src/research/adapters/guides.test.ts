// Questions and Telegram adapter endpoint contracts (the member.test.ts
// URL-pinning pattern). These pin the drift fix: the adapter previously
// pointed at /api/research/member/questions, /questions/:id/rating, and
// /telegram/unlink, none of which are registered, so every call landed on
// the SPA catch-all and the page reported everything "not connected".
// Each pinned path below mirrors a real registration in
// server/research/questions.ts, and the SERVER_REGISTERED_ROUTES list is the
// verbatim set of app.get/app.post/app.delete member routes there, so a
// repoint on either side fails this suite.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../lib/api";
import {
  fetchQuestions,
  fetchTelegramLink,
  guidesPaths,
  linkTelegram,
  rateAnswer,
  submitQuestion,
  unlinkTelegram,
} from "./guides";

const TOKEN = "member-jwt";

// The member-facing questions and Telegram routes registered in
// server/research/questions.ts (registerQuestionsApi), verbatim.
const SERVER_REGISTERED_ROUTES = [
  "GET /api/research/questions",
  "POST /api/research/questions",
  "POST /api/research/questions/:questionId/rate",
  "POST /api/research/telegram/link",
  "GET /api/research/telegram",
  "DELETE /api/research/telegram/link",
] as const;

function matchesRegistered(method: string, path: string): boolean {
  return SERVER_REGISTERED_ROUTES.some((route) => {
    const [routeMethod, routePath] = route.split(" ");
    if (routeMethod !== method) return false;
    const pattern = new RegExp(
      "^" + routePath.replace(/:[^/]+/g, "[^/]+") + "$",
    );
    return pattern.test(path);
  });
}

type Call = { path: string; method: string; auth: string | undefined; body: unknown };

function stubFetch(status: number, body: unknown): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({
        path,
        method: init?.method ?? "GET",
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The server's QuestionCreateRequest wire shape exactly.
const CREATE_BODY = {
  category: "other",
  bodyText: "Travel week\n\nHow should I handle a travel week?",
  followUpOfQuestionId: "q-parent",
};

const ADAPTERS: Array<{
  name: string;
  invoke: (token: string | null) => Promise<ApiResult<unknown>>;
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
}> = [
  { name: "fetchQuestions", invoke: (t) => fetchQuestions(t), path: "/api/research/questions", method: "GET" },
  {
    name: "submitQuestion",
    invoke: (t) => submitQuestion(CREATE_BODY, t),
    path: "/api/research/questions",
    method: "POST",
    body: CREATE_BODY,
  },
  {
    name: "rateAnswer",
    invoke: (t) => rateAnswer("q-1", { rating: 5 }, t),
    path: "/api/research/questions/q-1/rate",
    method: "POST",
    body: { rating: 5 },
  },
  { name: "fetchTelegramLink", invoke: (t) => fetchTelegramLink(t), path: "/api/research/telegram", method: "GET" },
  {
    name: "linkTelegram",
    invoke: (t) => linkTelegram(t),
    path: "/api/research/telegram/link",
    method: "POST",
    body: {},
  },
  {
    name: "unlinkTelegram",
    invoke: (t) => unlinkTelegram(t),
    path: "/api/research/telegram/link",
    method: "DELETE",
  },
];

describe("questions and Telegram adapter endpoint contracts", () => {
  it.each(ADAPTERS)("$name calls $method $path with the bearer token", async (spec) => {
    const { calls } = stubFetch(200, { ok: true });
    await spec.invoke(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(spec.path);
    expect(calls[0].method).toBe(spec.method);
    expect(calls[0].auth).toBe("Bearer " + TOKEN);
    if (spec.method === "POST") {
      expect(calls[0].body).toEqual(spec.body);
    } else {
      expect(calls[0].body).toBeUndefined();
    }
  });

  it.each(ADAPTERS)("$name points at a route registered in server/research/questions.ts", async (spec) => {
    const { calls } = stubFetch(200, { ok: true });
    await spec.invoke(TOKEN);
    expect(matchesRegistered(calls[0].method, calls[0].path)).toBe(true);
  });

  it("no adapter uses the unregistered /api/research/member questions prefix", () => {
    expect(guidesPaths.questions).not.toContain("/api/research/member");
    expect(guidesPaths.questionRating("q-1")).not.toContain("/api/research/member");
    expect(guidesPaths.telegram).not.toContain("/api/research/member");
    expect(guidesPaths.telegramLink).not.toContain("/api/research/member");
  });

  // The voice path deliberately stays where it was: no voice-question route
  // exists server-side, so it must NOT be claimed registered, and a call to
  // it maps to the honest unavailable state (the page keeps its pending copy).
  it("questionVoice is truthfully unregistered and maps to unavailable", async () => {
    expect(matchesRegistered("POST", guidesPaths.questionVoice)).toBe(false);
    stubFetch(404, { message: "not here" });
    const { submitVoiceQuestion } = await import("./guides");
    const res = await submitVoiceQuestion({ audio: "AA==", mimeType: "audio/webm" }, TOKEN);
    expect(res).toEqual({ kind: "unavailable" });
  });

  it.each(ADAPTERS)("$name: 404 maps to unavailable and 401 to unauthorized", async (spec) => {
    stubFetch(404, { message: "not here" });
    expect(await spec.invoke(TOKEN)).toEqual({ kind: "unavailable" });
    vi.unstubAllGlobals();
    stubFetch(401, { message: "expired" });
    expect(await spec.invoke(TOKEN)).toEqual({ kind: "unauthorized" });
  });
});
