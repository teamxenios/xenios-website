// Provider client configuration for the checkout page.
//
// The page needs two facts before it can collect a payment method through the
// provider's own browser surface: WHICH durable provider the checkout runs on
// and the provider's PUBLIC browser key. A Stripe publishable key is designed
// to ship to browsers (it can tokenize a card; it cannot charge, read or
// refund), so answering it is not a disclosure. Nothing else about the
// provider leaves this module: the secret key and the webhook secret are read
// only to check that the browser key and the server key are the same mode.
//
// A provider that cannot run the durable execution (production's Disabled
// provider today) answers payment_disabled, and the page keeps today's manual
// and assisted ordering exactly as it is. A mismatch between a live browser
// key and a test server key (or the reverse) is refused as misconfigured so a
// customer can never tokenize against one account while the server charges
// another.
import type { Express, Request, Response } from "express";
import { supportsDurableExecution, type PaymentProvider } from "../providers/payment";
import { subjectOf } from "./routes";

export type PaymentClientMode = "test" | "live";

export interface PaymentClientConfig {
  provider: "stripe" | "test";
  /** The provider's public browser key (pk_test_/pk_live_). Null for the test provider. */
  publishableKey: string | null;
  mode: PaymentClientMode;
}

export type PaymentClientConfigResult =
  | { ok: true; config: PaymentClientConfig }
  | { ok: false; code: "payment_disabled" | "payment_misconfigured" };

const PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9]{8,}$/;

function serverKeyMode(secret: string | undefined): PaymentClientMode | null {
  if (!secret) return null;
  if (/^(sk|rk)_test_/.test(secret)) return "test";
  if (/^(sk|rk)_live_/.test(secret)) return "live";
  return null;
}

/** Pure: decides what the browser may be told. Never returns a secret. */
export function resolvePaymentClientConfig(provider: PaymentProvider, env: NodeJS.ProcessEnv = process.env): PaymentClientConfigResult {
  if (!supportsDurableExecution(provider)) return { ok: false, code: "payment_disabled" };
  if (provider.name === "test") {
    // The test provider never runs in production (the resolver refuses it), and
    // this answer refuses again so a mis-set environment cannot expose it.
    if (env.NODE_ENV === "production") return { ok: false, code: "payment_disabled" };
    return { ok: true, config: { provider: "test", publishableKey: null, mode: "test" } };
  }
  if (provider.name !== "stripe") return { ok: false, code: "payment_disabled" };
  const publishable = env.STRIPE_PUBLISHABLE_KEY ?? "";
  const match = PUBLISHABLE_KEY.exec(publishable);
  if (!match) return { ok: false, code: "payment_misconfigured" };
  const mode = match[1] as PaymentClientMode;
  const server = serverKeyMode(env.STRIPE_SECRET_KEY);
  if (server === null || server !== mode) return { ok: false, code: "payment_misconfigured" };
  return { ok: true, config: { provider: "stripe", publishableKey: publishable, mode } };
}

export const PAYMENT_CLIENT_CONFIG_PATH = "/api/research/checkout/payment-config";

export interface PaymentClientConfigGuards {
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

function privateNoStore(res: Response): void {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

/**
 * GET /api/research/checkout/payment-config for the signed-in buyer.
 * 503 with payment_disabled or payment_misconfigured means "use today's
 * ordering path"; the page never guesses a provider from a missing answer.
 */
export function registerPaymentClientConfigApi(app: Express, guards: PaymentClientConfigGuards, deps: { resolve: () => PaymentClientConfigResult }): void {
  app.get(PAYMENT_CLIENT_CONFIG_PATH, guards.requireActiveMember, (req: Request, res: Response) => {
    privateNoStore(res);
    if (!subjectOf(req)) {
      res.status(403).json({ ok: false, code: "forbidden", message: "This area requires an active membership." });
      return;
    }
    let result: PaymentClientConfigResult;
    try {
      result = deps.resolve();
    } catch {
      result = { ok: false, code: "payment_disabled" };
    }
    if (!result.ok) {
      res.status(503).json({ ok: false, code: result.code, message: "Card payment is not available right now. Your cart is kept." });
      return;
    }
    res.json({ ok: true, config: result.config });
  });
}
