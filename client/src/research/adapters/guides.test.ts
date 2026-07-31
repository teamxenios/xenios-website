import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchQuestions,
  fetchTelegramLink,
  guidesPaths,
  linkTelegram,
  rateAnswer,
  submitQuestion,
  unlinkTelegram,
} from "./guides";

const question = {
  questionId: "q-1",
  category: "plan",
  status: "answer_ready",
  source: "web",
  bodyText: "Should I change my plan this week?",
  transcriptMediaId: null,
  answerText: "Keep the current plan.",
  answeredAt: "2026-07-30T12:00:00.000Z",
  rating: null,
  followUpOfQuestionId: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  slaTargetAt: "2026-07-30T22:00:00.000Z",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("questions and Telegram adapters", () => {
  it("uses canonical paths, methods, and one Bearer prefix", async () => {
    const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
      if (path === guidesPaths.questions && init.method === "GET") return response({ ok: true, questions: [question] });
      if (path === guidesPaths.questions && init.method === "POST") return response({ ok: true, question });
      if (path.endsWith("/rate")) return response({ ok: true });
      if (path === guidesPaths.telegram && init.method === "GET") {
        return response({ ok: true, state: { linked: false, linkedAt: null, telegramDisplayName: null } });
      }
      if (path === guidesPaths.telegramLink && init.method === "POST") {
        return response({ ok: true, link: { linkToken: "a".repeat(32), expiresAt: "2026-07-30T12:15:00.000Z", botUsername: "xenios_bot" } });
      }
      return response({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchQuestions("raw-token");
    await submitQuestion({ category: "plan", bodyText: "Should I change my plan?" }, "raw-token");
    await rateAnswer("q/1", { questionId: "q/1", rating: 5 }, "raw-token");
    await fetchTelegramLink("raw-token");
    await linkTelegram("raw-token");
    await unlinkTelegram("raw-token");

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ["/api/research/questions", "GET"],
      ["/api/research/questions", "POST"],
      ["/api/research/questions/q%2F1/rate", "POST"],
      ["/api/research/telegram", "GET"],
      ["/api/research/telegram/link", "POST"],
      ["/api/research/telegram/link", "DELETE"],
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer raw-token");
    }
  });

  it("fails closed on malformed question DTOs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true, questions: [{ ...question, status: "invented" }] })));
    await expect(fetchQuestions("token")).resolves.toMatchObject({ kind: "error", code: "malformed_response" });
  });

  it.each([
    ["array source", { source: ["web"], bodyText: "HOSTILE_ARRAY_SOURCE" }],
    ["object source", { source: { toString: () => "web" }, bodyText: "HOSTILE_OBJECT_SOURCE" }],
    ["missing web body", { source: "web", bodyText: null, transcriptMediaId: null, answerText: "HOSTILE_WEB_BODY" }],
    ["missing Telegram text body", { source: "telegram_text", bodyText: "", transcriptMediaId: null, answerText: "HOSTILE_TEXT_BODY" }],
    ["missing voice media", { source: "telegram_voice", bodyText: null, transcriptMediaId: null, answerText: "HOSTILE_VOICE_MEDIA" }],
    ["voice body smuggling", { source: "telegram_voice", bodyText: "HOSTILE_VOICE_BODY", transcriptMediaId: "media-1" }],
    ["loose created date", { createdAt: "July 30, 2026", bodyText: "HOSTILE_CREATED_DATE" }],
    ["loose answered date", { answeredAt: "2026-07-30 12:00:00Z", bodyText: "HOSTILE_ANSWERED_DATE" }],
    ["loose SLA date", { slaTargetAt: "2026-07-30T22:00:00Z", bodyText: "HOSTILE_SLA_DATE" }],
  ])("rejects %s", async (_label, patch) => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true, questions: [{ ...question, ...patch }] })));
    await expect(fetchQuestions("token")).resolves.toMatchObject({ kind: "error", code: "malformed_response" });
  });

  it("fails closed on malformed create, rating, Telegram state, link, and unlink DTOs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true })));
    await expect(submitQuestion({ category: "other", bodyText: "A valid question." }, "token")).resolves.toMatchObject({ code: "malformed_response" });
    await expect(rateAnswer("q", { questionId: "q", rating: 1 }, "token")).resolves.toMatchObject({ kind: "ok" });
    await expect(fetchTelegramLink("token")).resolves.toMatchObject({ code: "malformed_response" });
    await expect(linkTelegram("token")).resolves.toMatchObject({ code: "malformed_response" });
    await expect(unlinkTelegram("token")).resolves.toMatchObject({ kind: "ok" });
  });

  it("rejects Telegram tokens and states with invalid field types", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, state: { linked: "yes", linkedAt: null, telegramDisplayName: null } }))
      .mockResolvedValueOnce(response({ ok: true, link: { linkToken: "short", expiresAt: "never", botUsername: 4 } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTelegramLink("token")).resolves.toMatchObject({ code: "malformed_response" });
    await expect(linkTelegram("token")).resolves.toMatchObject({ code: "malformed_response" });
  });
});
