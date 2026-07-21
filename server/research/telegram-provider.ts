import crypto from "crypto";
import { capabilityEnabled } from "./capabilities";

// ---------------------------------------------------------------------------
// xenios research member platform: the Telegram provider seam (Website 2 lane,
// Wave 5).
//
// Nothing in this file talks to a network. The provider is the ONE place that
// knows about bot tokens, chat references, and the webhook secret, so a
// disabled or unconfigured capability can never mint a fake token, invent a
// verified webhook, or quietly send a message.
//
// Selection is capability-driven (selectTelegramProvider):
//   telegram_support off  -> DisabledTelegramProvider (every call refuses)
//   NODE_ENV === "test"   -> TestTelegramProvider (deterministic, in memory)
//   otherwise             -> TelegramBotProvider (the real adapter shell)
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
// missing. UNSAFE_CONTENT: the outbound guard refused the text. PROVIDER_ERROR:
// the adapter itself failed. The service maps the first two to
// capability_disabled (truthful) and never retries an UNSAFE_CONTENT refusal.
export type TelegramProviderErrorCode =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "UNSAFE_CONTENT"
  | "UNVERIFIED"
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
// The real bot adapter (SHELL)
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

// The seam where the Bot API send call gets wired. sendMessage is deliberately
// inert: it throws TelegramNotConfigured without a token and a secret, and
// returns a truthful PROVIDER_ERROR once configured, because the HTTP adapter
// body is a later wave. It performs no network I/O, so no message can reach a
// member's phone by accident before that wave lands.
//
// verifyWebhook is REAL here, and deliberately so. It is a pure constant-time
// comparison against the configured secret, needs no network, and is the one
// thing that must work correctly the moment a bot exists: an unverified
// webhook is refused before the route reads a single byte of the body.
export class TelegramBotProvider implements TelegramProvider {
  private requireConfig() {
    const missing = missingTelegramEnv();
    if (missing.length > 0) throw new TelegramNotConfigured(missing);
  }

  async sendMessage(input: SendMessageInput): Promise<ProviderResult<{ providerMessageId: string }>> {
    // The content guard runs BEFORE the configuration check, so an unsafe
    // message is refused as unsafe whatever the deployment state says.
    const refusal = refuseUnsafeOutbound(input.text);
    if (refusal) return refusal;
    this.requireConfig();
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "The Telegram Bot API adapter is not wired yet (sendMessage).",
    };
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
