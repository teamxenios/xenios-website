import crypto from "crypto";
import { capabilityEnabled } from "./capabilities";

// ---------------------------------------------------------------------------
// xenios research member platform: the Telegram provider seam (Website 2 lane,
// Wave 5).
//
// The provider is the ONE place that knows about bot tokens, chat references,
// and the webhook secret, so a disabled or unconfigured capability can never
// mint a fake token, invent a verified webhook, or quietly send a message.
// The only network path in this file is the production transport inside
// TelegramBotProvider, and it is an injected seam: tests always drive an
// in-memory transport and never touch a wire.
//
// Selection is capability-driven (selectTelegramProvider):
//   telegram_support off  -> DisabledTelegramProvider (every call refuses)
//   NODE_ENV === "test"   -> TestTelegramProvider (deterministic, in memory)
//   otherwise             -> TelegramBotProvider (the real Bot API adapter)
//
// HARD RULE, encoded here and enforced on EVERY provider:
// Telegram is never the system of record, and nothing sensitive ever leaves
// this system over it. No passwords, reset or verification tokens, identity
// documents, payment data, assessment content, private media, sensitive PDFs,
// or detailed health answers. Telegram carries short notices that point back
// to the member's xenios account, and nothing else. The account is where the
// content lives; the notice only says that something is waiting.
//
// The rule is structural, not a promise: outbound text is drawn from the fixed
// notice allowlist below, and every sendMessage runs the deterministic scan
// before anything is transmitted. A caller that hand-builds a message carrying
// a forbidden class is refused by the provider itself, so there is no path
// around the guard.
// ---------------------------------------------------------------------------

// DISABLED: the capability is off. NOT_CONFIGURED: bot token or webhook secret
// missing. UNSAFE_CONTENT: the outbound guard refused the text. RATE_LIMITED:
// the per-chat budget (ours or Telegram's own 429) refused the send for now.
// PROVIDER_ERROR: the adapter itself failed, including the outage cooldown.
// The service maps the first two to capability_disabled (truthful) and never
// retries an UNSAFE_CONTENT refusal.
export type TelegramProviderErrorCode =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "UNSAFE_CONTENT"
  | "UNVERIFIED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TelegramProviderErrorCode; message?: string };

export type SendMessageInput = {
  // An opaque chat reference. It is a routing detail, never serialized into a
  // member-facing payload and never treated as an identity.
  chatRef: string;
  text: string;
};

export type VerifyWebhookInput = {
  // Telegram authenticates its webhook with a shared secret header. rawBody is
  // carried so an HMAC scheme can be added at this seam later without changing
  // a single caller.
  secretHeader: string | undefined;
  rawBody: string;
};

export interface TelegramProvider {
  sendMessage(input: SendMessageInput): Promise<ProviderResult<{ providerMessageId: string }>>;
  verifyWebhook(input: VerifyWebhookInput): ProviderResult<{ verified: true }>;
}

// The real Telegram header. Named here once so the route never spells it out.
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

// ---------------------------------------------------------------------------
// The outbound content guard
// ---------------------------------------------------------------------------

// A notice is a pointer, not content. Anything longer than this is a sign that
// somebody is trying to push real material through the wrong channel.
export const MAX_OUTBOUND_CHARS = 400;

// The ONLY texts this system sends over Telegram. Each one says that something
// is waiting and where to read it, and carries no member content whatsoever.
export const TELEGRAM_NOTICES = {
  link_confirmed:
    "Your Telegram is now linked to your xenios account. Messages here are notices only; everything you send and read lives in your account on the website.",
  question_received:
    "Got it. Samuel reviews questions personally, and the reply will be waiting in your xenios account on the website.",
  update_waiting:
    "There is an update waiting for you in your xenios account. Open the website to read it.",
} as const;

export type TelegramNoticeKey = keyof typeof TELEGRAM_NOTICES;

// The forbidden classes, as deterministic patterns. This is the second layer:
// the notice allowlist above already means no member content is composed for
// Telegram, and this scan refuses anything that slipped past that discipline.
// Labels are safe to log; the offending TEXT never is.
export const FORBIDDEN_OUTBOUND_CLASSES: readonly { label: string; pattern: RegExp }[] = [
  { label: "password", pattern: /\b(pass(word|phrase)|passcode)\b/i },
  {
    label: "reset or verification token",
    pattern: /\b(reset|verification|verify|one[-\s]?time|otp|magic|login)[-\s]?(token|code|link|url)\b/i,
  },
  {
    label: "credential",
    pattern: /\b(api[-\s]?key|secret|bearer|access[-\s]?token|refresh[-\s]?token|session[-\s]?token|link[-\s]?token|credential)\b/i,
  },
  {
    label: "identity document",
    pattern: /\b(passport|driver'?s?[-\s]licen[cs]e|national[-\s]id|id[-\s]document|social[-\s]security|ssn|date[-\s]of[-\s]birth)\b/i,
  },
  {
    label: "payment data",
    pattern: /\b(card[-\s]number|cvv|cvc|iban|sort[-\s]code|routing[-\s]number|account[-\s]number|expiry[-\s]date)\b/i,
  },
  // A long digit run is what a card, an account, or a document number looks
  // like once the label around it has been stripped off.
  { label: "long digit run", pattern: /\b\d{12,}\b/ },
  {
    label: "assessment or health answer",
    pattern: /\b(assessment[-\s]answer|health[-\s]answer|diagnos(is|ed|tic)|medication|blood[-\s]pressure|body[-\s]fat|symptom)\b/i,
  },
  {
    label: "private media",
    pattern: /\b(progress[-\s]photo|voice[-\s]note|exercise[-\s]video|transcript)\b/i,
  },
  {
    label: "sensitive document",
    pattern: /\b(blueprint|signed[-\s]agreement|waiver|\.pdf)\b/i,
  },
];

export type OutboundScan = { safe: boolean; violations: string[] };

// Deterministic, no model judgment. Returns the LABELS of every class the text
// matched, so a refusal can be logged without ever logging the text.
export function scanOutboundText(text: string): OutboundScan {
  const violations: string[] = [];
  if (typeof text !== "string" || text.trim().length === 0) {
    violations.push("empty message");
  }
  if (typeof text === "string" && text.length > MAX_OUTBOUND_CHARS) {
    violations.push("longer than a notice");
  }
  for (const forbidden of FORBIDDEN_OUTBOUND_CLASSES) {
    if (typeof text === "string" && forbidden.pattern.test(text)) violations.push(forbidden.label);
  }
  return { safe: violations.length === 0, violations };
}

// Called at the top of EVERY sendMessage, on every implementation. Returns a
// refusal to hand straight back, or null when the text is a safe notice.
function refuseUnsafeOutbound(text: string): ProviderResult<never> | null {
  const scan = scanOutboundText(text);
  if (scan.safe) return null;
  // Labels only. The refused text is not logged, because the whole point of
  // the refusal is that it should not travel.
  console.warn(`[telegram] outbound refused; forbidden classes: ${scan.violations.join(", ")}`);
  return {
    ok: false,
    code: "UNSAFE_CONTENT",
    message: "That message carries content Telegram never receives.",
  };
}

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------

// Both sides are hashed first, so the digests are always the same length:
// timingSafeEqual cannot throw on a length mismatch, and the comparison leaks
// neither the secret's content nor its length.
export function constantTimeEqual(left: string, right: string): boolean {
  const a = crypto.createHash("sha256").update(String(left), "utf8").digest();
  const b = crypto.createHash("sha256").update(String(right), "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Disabled
// ---------------------------------------------------------------------------

// The keys-later default. Every method refuses in the same shape, so a
// disabled capability is a truthful denial rather than a crash, a fabricated
// token, or a silent success. Verification refuses too: with the capability
// off there is no configured secret, so nothing can be verified against it and
// a webhook must not be honored.
export class DisabledTelegramProvider implements TelegramProvider {
  async sendMessage(): Promise<ProviderResult<{ providerMessageId: string }>> {
    return { ok: false, code: "DISABLED", message: "Telegram support is disabled." };
  }

  verifyWebhook(): ProviderResult<{ verified: true }> {
    return { ok: false, code: "DISABLED", message: "Telegram support is disabled." };
  }
}

export const disabledTelegramProvider = new DisabledTelegramProvider();

// ---------------------------------------------------------------------------
// Test (deterministic, in memory, no network)
// ---------------------------------------------------------------------------

// The fixed secret the test provider verifies against. Tests use it to prove a
// wrong or missing header is denied; it is never a real secret and is never
// read from the environment.
export const TEST_TELEGRAM_WEBHOOK_SECRET = "test-telegram-webhook-secret";

export type SentTelegramMessage = { chatRef: string; text: string; providerMessageId: string };

export class TestTelegramProvider implements TelegramProvider {
  // What actually went out. Tests scan this for the forbidden classes, so the
  // assertion is about transmitted text, not about intent.
  readonly sent: SentTelegramMessage[] = [];
  // What the guard refused, labels only, so a test can prove the refusal
  // happened without the refused text being kept anywhere.
  readonly refused: { chatRef: string; violations: string[] }[] = [];
  private counter = 0;

  reset() {
    this.sent.length = 0;
    this.refused.length = 0;
    this.counter = 0;
  }

  async sendMessage(input: SendMessageInput): Promise<ProviderResult<{ providerMessageId: string }>> {
    const refusal = refuseUnsafeOutbound(input.text);
    if (refusal) {
      this.refused.push({ chatRef: input.chatRef, violations: scanOutboundText(input.text).violations });
      return refusal;
    }
    this.counter += 1;
    const providerMessageId = `test-telegram-message-${this.counter}`;
    this.sent.push({ chatRef: input.chatRef, text: input.text, providerMessageId });
    return { ok: true, value: { providerMessageId } };
  }

  verifyWebhook(input: VerifyWebhookInput): ProviderResult<{ verified: true }> {
    if (typeof input.secretHeader !== "string" || input.secretHeader.length === 0) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret header is missing." };
    }
    if (!constantTimeEqual(input.secretHeader, TEST_TELEGRAM_WEBHOOK_SECRET)) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret did not match." };
    }
    return { ok: true, value: { verified: true } };
  }
}

export const testTelegramProvider = new TestTelegramProvider();

// ---------------------------------------------------------------------------
// The real bot adapter
// ---------------------------------------------------------------------------

export class TelegramNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Telegram support is not configured: ${missing.join(", ")}`);
    this.name = "TelegramNotConfigured";
    this.missing = missing;
  }
}

const REQUIRED_ENV = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"] as const;

export function missingTelegramEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// ---------------------------------------------------------------------------
// The injected transport (the only place bytes leave for the Bot API)
// ---------------------------------------------------------------------------

// The transport receives the token as an argument and uses it once, in the
// request URL. It is never logged, never stored on the provider, and never
// part of any error message this module produces (see redactBotToken).
export type TelegramSendRequest = { botToken: string; chatRef: string; text: string };
export type TelegramTransportResult = { status: number; body: unknown };
export type TelegramTransport = (request: TelegramSendRequest) => Promise<TelegramTransportResult>;

export const TELEGRAM_API_BASE = "https://api.telegram.org";
const TRANSPORT_TIMEOUT_MS = 10_000;

// The production transport: one bounded HTTP POST, no retries here. Retry
// discipline belongs to the provider's outage state, not to the wire call, so
// a Telegram outage can never turn one notice into a storm of requests.
const fetchTelegramTransport: TelegramTransport = async ({ botToken, chatRef, text }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS);
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatRef, text, disable_web_page_preview: true }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as unknown;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

// Any string that is about to travel into a log or an error message passes
// through here first. The configured token is stripped, and so is anything
// shaped like a bot token, so a rotated or mistyped token cannot leak through
// a transport error either.
export function redactBotToken(message: string): string {
  let out = String(message);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token && token.length > 0) out = out.split(token).join("[redacted]");
  // No word boundaries: in a Bot API URL the token follows "/bot" directly,
  // so a \b would fail to anchor and the token would slip through.
  out = out.replace(/\d{6,12}:[A-Za-z0-9_-]{20,}/g, "[redacted]");
  return out;
}

// ---------------------------------------------------------------------------
// Per-chat send budget (token bucket, injected clock)
// ---------------------------------------------------------------------------

// Telegram allows roughly one message per second per chat. Notices are rare,
// so a small burst with a one-per-second refill keeps every legitimate flow
// unthrottled while a runaway loop is stopped at the provider.
export const TELEGRAM_SEND_BUCKET_CAPACITY = 3;
export const TELEGRAM_SEND_REFILL_PER_SECOND = 1;

// Bounded memory: beyond this many distinct chats, the oldest bucket is
// dropped. A dropped bucket refills to full, which only ever errs toward
// allowing a send, never toward wrongly refusing one.
const MAX_TRACKED_CHATS = 10_000;

export class ChatSendLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastMs: number }>();

  constructor(
    private readonly capacity: number = TELEGRAM_SEND_BUCKET_CAPACITY,
    private readonly refillPerSecond: number = TELEGRAM_SEND_REFILL_PER_SECOND,
  ) {}

  tryTake(chatRef: string, nowMs: number): boolean {
    let bucket = this.buckets.get(chatRef);
    if (!bucket) {
      if (this.buckets.size >= MAX_TRACKED_CHATS) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: this.capacity, lastMs: nowMs };
      this.buckets.set(chatRef, bucket);
    } else {
      const elapsedSeconds = Math.max(0, nowMs - bucket.lastMs) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
      bucket.lastMs = nowMs;
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Audit events (injected recorder; structurally unable to leak)
// ---------------------------------------------------------------------------

// The event type has NO field for message text and NO field for the token, so
// an audit sink cannot receive either even by mistake. Violations are labels.
export type TelegramAuditEvent = {
  type:
    | "send_ok"
    | "send_refused_unsafe"
    | "send_rate_limited"
    | "send_suppressed_outage"
    | "send_failed";
  chatRef: string;
  code: TelegramProviderErrorCode | null;
  violations: string[];
  atMs: number;
};
export type TelegramAuditRecorder = (event: TelegramAuditEvent) => void;

// ---------------------------------------------------------------------------
// Outage state (bounded, no retry storm)
// ---------------------------------------------------------------------------

// After this many consecutive transport failures the provider stops calling
// the wire at all for the cooldown window and refuses truthfully instead.
// Sends are notices, so dropping one during an outage is the correct trade;
// the durable record is already in the database.
export const TELEGRAM_OUTAGE_THRESHOLD = 3;
export const TELEGRAM_OUTAGE_COOLDOWN_MS = 30_000;

// The complete retry metadata, bounded by construction: two numbers and a
// counter, never a queue of failed payloads.
export type TelegramOutageState = {
  consecutiveFailures: number;
  lastFailureAtMs: number | null;
  suppressedUntilMs: number | null;
};

export type TelegramBotProviderOptions = {
  transport?: TelegramTransport;
  nowMs?: () => number;
  audit?: TelegramAuditRecorder;
  limiter?: ChatSendLimiter;
  outageThreshold?: number;
  outageCooldownMs?: number;
};

// The real Bot API adapter. sendMessage is wired over the injected transport;
// the token comes from the environment per call and is never stored, logged,
// or echoed. Order of the gates: content guard (unsafe text is refused as
// unsafe whatever the deployment state says), configuration, outage cooldown,
// per-chat budget, then exactly ONE transport call with no in-call retry.
//
// verifyWebhook is untouched: a pure constant-time comparison against the
// configured secret, refusing before the route reads a single byte of body.
export class TelegramBotProvider implements TelegramProvider {
  private readonly transport: TelegramTransport;
  private readonly nowMs: () => number;
  private readonly audit: TelegramAuditRecorder | null;
  private readonly limiter: ChatSendLimiter;
  private readonly outageThreshold: number;
  private readonly outageCooldownMs: number;
  private readonly outage: TelegramOutageState = {
    consecutiveFailures: 0,
    lastFailureAtMs: null,
    suppressedUntilMs: null,
  };

  constructor(options: TelegramBotProviderOptions = {}) {
    this.transport = options.transport ?? fetchTelegramTransport;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.audit = options.audit ?? null;
    this.limiter = options.limiter ?? new ChatSendLimiter();
    this.outageThreshold = options.outageThreshold ?? TELEGRAM_OUTAGE_THRESHOLD;
    this.outageCooldownMs = options.outageCooldownMs ?? TELEGRAM_OUTAGE_COOLDOWN_MS;
  }

  outageState(): TelegramOutageState {
    return { ...this.outage };
  }

  private requireConfig() {
    const missing = missingTelegramEnv();
    if (missing.length > 0) throw new TelegramNotConfigured(missing);
  }

  // A recorder failure never breaks a send; the audit is evidence, not a gate.
  private record(event: TelegramAuditEvent) {
    if (!this.audit) return;
    try {
      this.audit(event);
    } catch {
      // swallowed on purpose
    }
  }

  private transportFailed(
    chatRef: string,
    atMs: number,
    detail: string,
  ): ProviderResult<{ providerMessageId: string }> {
    this.outage.consecutiveFailures += 1;
    this.outage.lastFailureAtMs = atMs;
    if (this.outage.consecutiveFailures >= this.outageThreshold) {
      this.outage.suppressedUntilMs = atMs + this.outageCooldownMs;
    }
    this.record({ type: "send_failed", chatRef, code: "PROVIDER_ERROR", violations: [], atMs });
    return { ok: false, code: "PROVIDER_ERROR", message: redactBotToken(detail) };
  }

  async sendMessage(input: SendMessageInput): Promise<ProviderResult<{ providerMessageId: string }>> {
    const atMs = this.nowMs();

    // The content guard runs BEFORE the configuration check, so an unsafe
    // message is refused as unsafe whatever the deployment state says.
    const refusal = refuseUnsafeOutbound(input.text);
    if (refusal) {
      this.record({
        type: "send_refused_unsafe",
        chatRef: input.chatRef,
        code: "UNSAFE_CONTENT",
        violations: scanOutboundText(input.text).violations,
        atMs,
      });
      return refusal;
    }
    this.requireConfig();
    const botToken = process.env.TELEGRAM_BOT_TOKEN as string;

    // The outage cooldown: refuse without touching the wire, so a Telegram
    // outage is one failure per notice, never a storm of retries.
    if (this.outage.suppressedUntilMs !== null && atMs < this.outage.suppressedUntilMs) {
      this.record({
        type: "send_suppressed_outage",
        chatRef: input.chatRef,
        code: "PROVIDER_ERROR",
        violations: [],
        atMs,
      });
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: "Telegram transport is in a failure cooldown; the send was not attempted.",
      };
    }

    if (!this.limiter.tryTake(input.chatRef, atMs)) {
      this.record({
        type: "send_rate_limited",
        chatRef: input.chatRef,
        code: "RATE_LIMITED",
        violations: [],
        atMs,
      });
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: "Sends to this chat are briefly rate limited; the notice was not sent.",
      };
    }

    let result: TelegramTransportResult;
    try {
      result = await this.transport({ botToken, chatRef: input.chatRef, text: input.text });
    } catch (err) {
      return this.transportFailed(
        input.chatRef,
        atMs,
        `Telegram send failed in transport: ${err instanceof Error ? err.message : "transport threw"}`,
      );
    }

    // Telegram's own throttle is a rate limit, not an outage: the service is
    // up and answering. Bounded retry metadata only (a single number of
    // seconds, when Telegram provides one).
    if (result.status === 429) {
      const retryAfterRaw = (result.body as { parameters?: { retry_after?: unknown } } | null)
        ?.parameters?.retry_after;
      const retryAfter =
        typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw)
          ? Math.max(0, Math.min(3600, Math.floor(retryAfterRaw)))
          : null;
      this.record({
        type: "send_rate_limited",
        chatRef: input.chatRef,
        code: "RATE_LIMITED",
        violations: [],
        atMs,
      });
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: `Telegram throttled this chat${retryAfter !== null ? ` (retry after ~${retryAfter}s)` : ""}; the notice was not sent.`,
      };
    }

    // Only the STATUS travels into the error message. The response body is
    // never echoed: it is not ours and could carry anything.
    if (result.status < 200 || result.status >= 300) {
      return this.transportFailed(input.chatRef, atMs, `Telegram send failed (HTTP ${result.status}).`);
    }

    const body = result.body as { ok?: unknown; result?: { message_id?: unknown } } | null;
    const messageId = body?.ok === true ? body.result?.message_id : undefined;
    if (typeof messageId !== "number" && typeof messageId !== "string") {
      return this.transportFailed(input.chatRef, atMs, "Telegram returned an unrecognized response shape.");
    }

    this.outage.consecutiveFailures = 0;
    this.outage.suppressedUntilMs = null;
    this.record({ type: "send_ok", chatRef: input.chatRef, code: null, violations: [], atMs });
    return { ok: true, value: { providerMessageId: String(messageId) } };
  }

  verifyWebhook(input: VerifyWebhookInput): ProviderResult<{ verified: true }> {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) {
      return { ok: false, code: "NOT_CONFIGURED", message: "No webhook secret is configured." };
    }
    if (typeof input.secretHeader !== "string" || input.secretHeader.length === 0) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret header is missing." };
    }
    if (!constantTimeEqual(input.secretHeader, secret)) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret did not match." };
    }
    return { ok: true, value: { verified: true } };
  }
}

export const telegramBotProvider = new TelegramBotProvider();

// Resolved per call, never memoized at import: capability state depends on
// environment that can change between requests (and between tests).
export function selectTelegramProvider(): TelegramProvider {
  if (!capabilityEnabled("telegram_support")) return disabledTelegramProvider;
  if (process.env.NODE_ENV === "test") return testTelegramProvider;
  return telegramBotProvider;
}
