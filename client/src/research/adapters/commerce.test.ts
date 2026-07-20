// Adapter contract tests: the commerce and guides adapters must hit the
// exact member endpoints and surface every server condition through the one
// ApiResult envelope (ok / empty body / unavailable / error / unauthorized /
// forbidden). fetch is stubbed, so this pins the mapping matrix without a
// server and catches any drift in the shared paths.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commercePaths,
  fetchOrder,
  fetchOrders,
  fetchSubscriptions,
  joinWaitlist,
  subscriptionAction,
} from "./commerce";
import {
  fetchGuide,
  fetchGuides,
  fetchQuestions,
  fetchReferrals,
  fetchTelegramLink,
  guidesPaths,
  linkTelegram,
  rateAnswer,
  requestGuideTopic,
  submitGuideCorrection,
  submitQuestion,
  submitVoiceQuestion,
  unlinkTelegram,
} from "./guides";
import type { ApiResult } from "../lib/api";

type Call = { url: string; init: RequestInit };

const calls: Call[] = [];

function stubFetch(status: number, body: unknown) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          if (body === undefined) throw new Error("no body");
          return body;
        },
      };
    }),
  );
}

function stubFetchReject() {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("network down");
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The full mapping matrix, exercised through one GET adapter from each file.
// The mapping lives in lib/api, so one representative per adapter proves the
// adapter routes through it unchanged.
const matrixSubjects: Array<{
  name: string;
  run: () => Promise<ApiResult<unknown>>;
  path: string;
}> = [
  { name: "commerce.fetchOrders", run: () => fetchOrders(null), path: commercePaths.orders },
  { name: "guides.fetchGuides", run: () => fetchGuides(null), path: guidesPaths.guides },
];

describe.each(matrixSubjects)("ApiResult matrix via $name", ({ run, path }) => {
  it("maps 200 with data to ok", async () => {
    stubFetch(200, { items: [1, 2] });
    expect(await run()).toEqual({ kind: "ok", data: { items: [1, 2] } });
    expect(calls[0].url).toBe(path);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("maps 200 with an empty object to ok with empty data", async () => {
    stubFetch(200, {});
    expect(await run()).toEqual({ kind: "ok", data: {} });
  });

  it("maps 200 with an unparseable (empty) body to error", async () => {
    stubFetch(200, undefined);
    expect(await run()).toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
  });

  it("maps 401 to unauthorized", async () => {
    stubFetch(401, { message: "nope" });
    expect(await run()).toEqual({ kind: "unauthorized" });
  });

  it("maps 403 to forbidden with the server message", async () => {
    stubFetch(403, { message: "Members only." });
    expect(await run()).toEqual({ kind: "forbidden", message: "Members only." });
  });

  it("maps 403 without a body to forbidden with no message", async () => {
    stubFetch(403, undefined);
    expect(await run()).toEqual({ kind: "forbidden", message: undefined });
  });

  it.each([404, 501, 503])("maps %i to unavailable", async (status) => {
    stubFetch(status, { message: "not here" });
    expect(await run()).toEqual({ kind: "unavailable" });
  });

  it("maps a 500 with a message to error", async () => {
    stubFetch(500, { message: "Boom." });
    expect(await run()).toEqual({ kind: "error", message: "Boom." });
  });

  it("maps a 500 without a message to the generic error", async () => {
    stubFetch(500, {});
    expect(await run()).toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
  });

  it("maps a network failure to the connection error", async () => {
    stubFetchReject();
    expect(await run()).toEqual({
      kind: "error",
      message: "The connection failed. Please try again.",
    });
  });
});

describe("commerce adapter endpoints", () => {
  it("joinWaitlist POSTs the slug with the bearer token", async () => {
    stubFetch(200, { ok: true });
    const result = await joinWaitlist("bpc-157", "tok-1");
    expect(result).toEqual({ kind: "ok", data: { ok: true } });
    expect(calls[0].url).toBe("/api/research/member/waitlist");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ slug: "bpc-157" }));
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("fetchOrder encodes the order id into the path", async () => {
    stubFetch(200, { order: {} });
    await fetchOrder("ord/1 x", "tok");
    expect(calls[0].url).toBe("/api/research/member/orders/ord%2F1%20x");
  });

  it("fetchSubscriptions GETs the subscriptions path", async () => {
    stubFetch(200, { subscriptions: [] });
    await fetchSubscriptions("tok");
    expect(calls[0].url).toBe("/api/research/member/subscriptions");
    expect(calls[0].init.method).toBe("GET");
  });

  it("subscriptionAction POSTs to the encoded sub id and action", async () => {
    stubFetch(200, {});
    await subscriptionAction("sub 9", "pause", { until: "2026-08-01" }, "tok");
    expect(calls[0].url).toBe("/api/research/member/subscriptions/sub%209/pause");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ until: "2026-08-01" }));
  });

  it("omits the Authorization header when no token is given", async () => {
    stubFetch(200, {});
    await fetchOrders(null);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("guides adapter endpoints", () => {
  it("fetchGuide encodes the slug into the path", async () => {
    stubFetch(200, { guide: {} });
    await fetchGuide("dosing 101/a", "tok");
    expect(calls[0].url).toBe("/api/research/member/guides/dosing%20101%2Fa");
  });

  it("submitGuideCorrection defaults to the slug corrections path", async () => {
    stubFetch(200, { ok: true });
    await submitGuideCorrection("dosing", { message: "typo" }, "tok");
    expect(calls[0].url).toBe("/api/research/member/guides/dosing/corrections");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ message: "typo" }));
  });

  it("submitGuideCorrection prefers a non-empty override path", async () => {
    stubFetch(200, { ok: true });
    await submitGuideCorrection("dosing", { message: "typo" }, "tok", "/api/custom/corrections");
    expect(calls[0].url).toBe("/api/custom/corrections");
  });

  it("submitGuideCorrection falls back when the override is empty or null", async () => {
    stubFetch(200, { ok: true });
    await submitGuideCorrection("dosing", { message: "typo" }, "tok", "");
    expect(calls[0].url).toBe("/api/research/member/guides/dosing/corrections");
    stubFetch(200, { ok: true });
    await submitGuideCorrection("dosing", { message: "typo" }, "tok", null);
    expect(calls[0].url).toBe("/api/research/member/guides/dosing/corrections");
  });

  it("requestGuideTopic POSTs the topic body", async () => {
    stubFetch(200, { ok: true });
    await requestGuideTopic({ topic: "GLP-1 handling" }, "tok");
    expect(calls[0].url).toBe("/api/research/member/guide-topic-requests");
    expect(calls[0].init.body).toBe(JSON.stringify({ topic: "GLP-1 handling" }));
  });

  it("question endpoints hit their paths", async () => {
    stubFetch(200, { questions: [] });
    await fetchQuestions("tok");
    expect(calls[0].url).toBe("/api/research/member/questions");
    expect(calls[0].init.method).toBe("GET");

    stubFetch(200, { id: "q1" });
    await submitQuestion({ subject: "s", body: "b" }, "tok");
    expect(calls[0].url).toBe("/api/research/member/questions");
    expect(calls[0].init.method).toBe("POST");

    stubFetch(200, { id: "q2" });
    await submitVoiceQuestion({ audio: "AAA=", mimeType: "audio/webm" }, "tok");
    expect(calls[0].url).toBe("/api/research/member/questions/voice");

    stubFetch(200, { saved: true });
    await rateAnswer("q 1", { rating: 5 }, "tok");
    expect(calls[0].url).toBe("/api/research/member/questions/q%201/rating");
    expect(calls[0].init.body).toBe(JSON.stringify({ rating: 5 }));
  });

  it("telegram endpoints hit their paths with an empty POST body", async () => {
    stubFetch(200, { linked: false });
    await fetchTelegramLink("tok");
    expect(calls[0].url).toBe("/api/research/member/telegram");
    expect(calls[0].init.method).toBe("GET");

    stubFetch(200, { linkUrl: "https://t.me/x" });
    await linkTelegram("tok");
    expect(calls[0].url).toBe("/api/research/member/telegram/link");
    expect(calls[0].init.body).toBe(JSON.stringify({}));

    stubFetch(200, { unlinked: true });
    await unlinkTelegram("tok");
    expect(calls[0].url).toBe("/api/research/member/telegram/unlink");
    expect(calls[0].init.body).toBe(JSON.stringify({}));
  });

  it("fetchReferrals GETs the referrals path", async () => {
    stubFetch(200, { code: "XEN-1" });
    await fetchReferrals("tok");
    expect(calls[0].url).toBe("/api/research/member/referrals");
    expect(calls[0].init.method).toBe("GET");
  });
});
