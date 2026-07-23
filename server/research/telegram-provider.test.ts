import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The real Telegram Bot API adapter, driven entirely through an injected
// transport and clock: the send happy path, the guarantee that the bot token
// never appears in an error or a log line, the per-chat token bucket, the
// outage cooldown that stops a retry storm, Telegram's own 429 mapping, the
// audit recorder that structurally cannot receive text or token, the disabled
// fallback when the token is absent, and a regression pin on the untouched
// inbound webhook verification. No network anywhere.
// ---------------------------------------------------------------------------

const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

import {
  ChatSendLimiter,
  TELEGRAM_NOTICES,
  TELEGRAM_OUTAGE_COOLDOWN_MS,
  TELEGRAM_OUTAGE_THRESHOLD,
  TELEGRAM_SEND_BUCKET_CAPACITY,
  TelegramBotProvider,
  disabledTelegramProvider,
  redactBotToken,
  selectTelegramProvider,
  testTelegramProvider,
  type TelegramAuditEvent,
  type TelegramSendRequest,
  type TelegramTransportResult,
} from "./telegram-provider";

const T0 = Date.parse("2026-07-22T00:00:00.000Z");

// A distinctive fake token. If this marker ever shows up in an error message,
// a log line, or an audit event, the redaction has failed.
const FAKE_TOKEN = "123456789:UNIT_TEST_BOT_TOKEN_MARKER_abcdefghijklmnop";
const FAKE_SECRET = "unit-test-webhook-secret";

const ENV_KEYS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "RESEARCH_TELEGRAM_ENABLED"] as const;
const envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
});

let nowMs = T0;
let events: TelegramAuditEvent[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  nowMs = T0;
  events = [];
  caps.enabled = true;
  process.env.TELEGRAM_BOT_TOKEN = FAKE_TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = FAKE_SECRET;
  testTelegramProvider.reset();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

function okTransport(messageId: number | string = 42) {
  const sent: TelegramSendRequest[] = [];
  const transport = vi.fn(async (request: TelegramSendRequest): Promise<TelegramTransportResult> => {
    sent.push(request);
    return { status: 200, body: { ok: true, result: { message_id: messageId } } };
  });
  return { transport, sent };
}

function makeProvider(
  transport: (request: TelegramSendRequest) => Promise<TelegramTransportResult>,
  overrides: Partial<ConstructorParameters<typeof TelegramBotProvider>[0]> = {},
) {
  return new TelegramBotProvider({
    transport,
    nowMs: () => nowMs,
    audit: (event) => events.push(event),
    ...overrides,
  });
}

function everythingLogged(): string {
  const lines = [...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

describe("sendMessage over the injected transport", () => {
  it("sends a notice and returns the provider message id", async () => {
    const { transport, sent } = okTransport(42);
    const provider = makeProvider(transport);
    const result = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(result).toEqual({ ok: true, value: { providerMessageId: "42" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].chatRef).toBe("chat-1");
    expect(sent[0].text).toBe(TELEGRAM_NOTICES.update_waiting);
    // The token reaches the transport (it is the wire's credential) and
    // nothing else: not the result, not the audit, not a log.
    expect(sent[0].botToken).toBe(FAKE_TOKEN);
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    expect(events).toEqual([
      { type: "send_ok", chatRef: "chat-1", code: null, violations: [], atMs: T0 },
    ]);
  });

  it("still refuses unsafe content before the transport is ever called", async () => {
    const { transport } = okTransport();
    const provider = makeProvider(transport);
    const result = await provider.sendMessage({ chatRef: "chat-1", text: "Your password is hunter2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSAFE_CONTENT");
    expect(transport).not.toHaveBeenCalled();
    expect(events[0].type).toBe("send_refused_unsafe");
    expect(events[0].violations).toContain("password");
    // The refused text is nowhere in the audit trail.
    expect(JSON.stringify(events)).not.toContain("hunter2");
  });

  it("returns an unrecognized response shape as a truthful PROVIDER_ERROR", async () => {
    const provider = makeProvider(async () => ({ status: 200, body: { unexpected: true } }));
    const result = await provider.sendMessage({ chatRef: "chat-1", text: TELEGRAM_NOTICES.update_waiting });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });
});

// ---------------------------------------------------------------------------
// The token never leaks
// ---------------------------------------------------------------------------

describe("token redaction", () => {
  it("never lets the bot token into an error message, a log line, or an audit event", async () => {
    const provider = makeProvider(async () => {
      // A realistic worst case: the transport error carries the request URL,
      // token and all.
      throw new Error(
        `connect ETIMEDOUT https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`,
      );
    });
    const result = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROVIDER_ERROR");
      expect(result.message ?? "").not.toContain(FAKE_TOKEN);
      expect(result.message ?? "").toContain("[redacted]");
    }
    expect(everythingLogged()).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(events)).not.toContain(FAKE_TOKEN);
  });

  it("also scrubs anything shaped like a bot token, even one not in the environment", () => {
    const rotated = "987654321:SOME_OTHER_TOKEN_SHAPE_zyxwvutsrqponml";
    expect(redactBotToken(`failed calling /bot${rotated}/sendMessage`)).not.toContain(rotated);
  });

  it("keeps the audit event structurally free of text and token fields", async () => {
    const { transport } = okTransport();
    const provider = makeProvider(transport);
    await provider.sendMessage({ chatRef: "chat-1", text: TELEGRAM_NOTICES.update_waiting });
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]).sort()).toEqual(["atMs", "chatRef", "code", "type", "violations"]);
    expect(JSON.stringify(events)).not.toContain(TELEGRAM_NOTICES.update_waiting);
  });

  it("a throwing audit recorder never breaks the send", async () => {
    const { transport } = okTransport();
    const provider = new TelegramBotProvider({
      transport,
      nowMs: () => nowMs,
      audit: () => {
        throw new Error("audit sink down");
      },
    });
    const result = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The per-chat budget
// ---------------------------------------------------------------------------

describe("rate limiting", () => {
  it("refuses beyond the per-chat burst and refills with the injected clock", async () => {
    const { transport } = okTransport();
    const provider = makeProvider(transport);
    for (let i = 0; i < TELEGRAM_SEND_BUCKET_CAPACITY; i += 1) {
      const ok = await provider.sendMessage({ chatRef: "chat-1", text: TELEGRAM_NOTICES.update_waiting });
      expect(ok.ok).toBe(true);
    }
    const limited = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.code).toBe("RATE_LIMITED");
    expect(transport).toHaveBeenCalledTimes(TELEGRAM_SEND_BUCKET_CAPACITY);
    expect(events.at(-1)?.type).toBe("send_rate_limited");

    // Another chat has its own budget.
    const other = await provider.sendMessage({ chatRef: "chat-2", text: TELEGRAM_NOTICES.update_waiting });
    expect(other.ok).toBe(true);

    // A second later, one token has refilled.
    nowMs += 1000;
    const refilled = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(refilled.ok).toBe(true);
  });

  it("maps Telegram's own 429 to RATE_LIMITED with bounded retry metadata", async () => {
    const provider = makeProvider(async () => ({
      status: 429,
      body: { ok: false, parameters: { retry_after: 7 } },
    }));
    const result = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.message).toContain("~7s");
    }
    // Telegram answering 429 is not an outage: nothing opens the cooldown.
    expect(provider.outageState().consecutiveFailures).toBe(0);
  });

  it("the limiter itself is a plain token bucket over the injected clock", () => {
    const limiter = new ChatSendLimiter(2, 1);
    expect(limiter.tryTake("c", T0)).toBe(true);
    expect(limiter.tryTake("c", T0)).toBe(true);
    expect(limiter.tryTake("c", T0)).toBe(false);
    expect(limiter.tryTake("c", T0 + 999)).toBe(false);
    expect(limiter.tryTake("c", T0 + 1000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Outage: truthful errors, no retry storm
// ---------------------------------------------------------------------------

describe("outage state", () => {
  it("stops calling the wire after consecutive failures, then recovers after the cooldown", async () => {
    let up = false;
    const transport = vi.fn(async (): Promise<TelegramTransportResult> => {
      if (!up) throw new Error("ECONNREFUSED");
      return { status: 200, body: { ok: true, result: { message_id: 7 } } };
    });
    // Distinct chats so the per-chat budget never interferes with the outage
    // behavior under test.
    const provider = makeProvider(transport);

    for (let i = 0; i < TELEGRAM_OUTAGE_THRESHOLD; i += 1) {
      const failed = await provider.sendMessage({
        chatRef: `chat-${i}`,
        text: TELEGRAM_NOTICES.update_waiting,
      });
      expect(failed.ok).toBe(false);
      if (!failed.ok) expect(failed.code).toBe("PROVIDER_ERROR");
    }
    expect(transport).toHaveBeenCalledTimes(TELEGRAM_OUTAGE_THRESHOLD);
    expect(provider.outageState()).toEqual({
      consecutiveFailures: TELEGRAM_OUTAGE_THRESHOLD,
      lastFailureAtMs: T0,
      suppressedUntilMs: T0 + TELEGRAM_OUTAGE_COOLDOWN_MS,
    });

    // Inside the cooldown the wire is NOT touched: a truthful refusal, not a
    // retry storm.
    const suppressed = await provider.sendMessage({
      chatRef: "chat-x",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(suppressed.ok).toBe(false);
    if (!suppressed.ok) expect(suppressed.code).toBe("PROVIDER_ERROR");
    expect(transport).toHaveBeenCalledTimes(TELEGRAM_OUTAGE_THRESHOLD);
    expect(events.at(-1)?.type).toBe("send_suppressed_outage");

    // After the cooldown the wire is tried again, and a success closes the
    // outage completely.
    nowMs = T0 + TELEGRAM_OUTAGE_COOLDOWN_MS + 1;
    up = true;
    const recovered = await provider.sendMessage({
      chatRef: "chat-y",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(recovered.ok).toBe(true);
    expect(provider.outageState()).toEqual({
      consecutiveFailures: 0,
      lastFailureAtMs: T0,
      suppressedUntilMs: null,
    });
  });

  it("maps a non-2xx status to PROVIDER_ERROR carrying the status only, never the body", async () => {
    const provider = makeProvider(async () => ({
      status: 502,
      body: { secret_sounding_thing: "should never travel" },
    }));
    const result = await provider.sendMessage({
      chatRef: "chat-1",
      text: TELEGRAM_NOTICES.update_waiting,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PROVIDER_ERROR");
      expect(result.message).toContain("502");
      expect(result.message ?? "").not.toContain("should never travel");
    }
  });
});

// ---------------------------------------------------------------------------
// Disabled and unconfigured fallbacks
// ---------------------------------------------------------------------------

describe("fallbacks", () => {
  it("selects the disabled provider when the capability is off", async () => {
    caps.enabled = false;
    expect(selectTelegramProvider()).toBe(disabledTelegramProvider);
    const result = await disabledTelegramProvider.sendMessage({ chatRef: "c", text: "anything" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DISABLED");
  });

  it("throws TelegramNotConfigured naming variable NAMES only when the token is absent", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { transport } = okTransport();
    const provider = makeProvider(transport);
    await expect(
      provider.sendMessage({ chatRef: "chat-1", text: TELEGRAM_NOTICES.update_waiting }),
    ).rejects.toMatchObject({ name: "TelegramNotConfigured", missing: ["TELEGRAM_BOT_TOKEN"] });
    expect(transport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The inbound webhook verification is untouched (regression pin)
// ---------------------------------------------------------------------------

describe("verifyWebhook (unchanged)", () => {
  it("verifies the configured secret constant-time and refuses everything else", () => {
    const provider = makeProvider(okTransport().transport);
    expect(provider.verifyWebhook({ secretHeader: FAKE_SECRET, rawBody: "{}" }).ok).toBe(true);

    const wrong = provider.verifyWebhook({ secretHeader: "not-the-secret", rawBody: "{}" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.code).toBe("UNVERIFIED");

    const missing = provider.verifyWebhook({ secretHeader: undefined, rawBody: "{}" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("UNVERIFIED");

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const unconfigured = provider.verifyWebhook({ secretHeader: FAKE_SECRET, rawBody: "{}" });
    expect(unconfigured.ok).toBe(false);
    if (!unconfigured.ok) expect(unconfigured.code).toBe("NOT_CONFIGURED");
  });
});
