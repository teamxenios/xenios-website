import express, { type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { DisabledPaymentProvider, StripePaymentAdapter, TestPaymentProvider } from "../providers/payment";
import { registerPaymentClientConfigApi, resolvePaymentClientConfig, PAYMENT_CLIENT_CONFIG_PATH } from "./payment-client-config";

const stripe = () =>
  new StripePaymentAdapter({
    secretKey: "sk_test_fake_unit_test_only",
    webhookSecret: "whsec_fake_unit_test_only",
    transport: async () => {
      throw new Error("no network in this test");
    },
  });

describe("payment client configuration", () => {
  it("answers payment_disabled for a provider that cannot run the durable execution", () => {
    expect(resolvePaymentClientConfig(new DisabledPaymentProvider(), { STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678" })).toEqual({ ok: false, code: "payment_disabled" });
  });

  it("answers the Stripe publishable key with its mode, and only when the server key is the same mode", () => {
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake" })).toEqual({
      ok: true,
      config: { provider: "stripe", publishableKey: "pk_test_abcdefgh12345678", mode: "test" },
    });
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "pk_live_abcdefgh12345678", STRIPE_SECRET_KEY: "rk_live_fake" })).toMatchObject({ ok: true, config: { mode: "live" } });
    // A live browser key over a test server key (or the reverse) would tokenize against one account and charge another.
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "pk_live_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake" })).toEqual({ ok: false, code: "payment_misconfigured" });
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_live_fake" })).toEqual({ ok: false, code: "payment_misconfigured" });
    // No browser key, a malformed one, or a secret in its place: refused, never echoed.
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_SECRET_KEY: "sk_test_fake" })).toEqual({ ok: false, code: "payment_misconfigured" });
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "sk_test_fake_secret_in_wrong_slot", STRIPE_SECRET_KEY: "sk_test_fake" })).toEqual({ ok: false, code: "payment_misconfigured" });
    expect(resolvePaymentClientConfig(stripe(), { STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678" })).toEqual({ ok: false, code: "payment_misconfigured" });
  });

  it("answers the test provider outside production only", () => {
    expect(resolvePaymentClientConfig(new TestPaymentProvider(), { NODE_ENV: "test" })).toEqual({ ok: true, config: { provider: "test", publishableKey: null, mode: "test" } });
    expect(resolvePaymentClientConfig(new TestPaymentProvider(), { NODE_ENV: "production" })).toEqual({ ok: false, code: "payment_disabled" });
  });
});

describe("payment client configuration route", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function serve(resolve: Parameters<typeof registerPaymentClientConfigApi>[2]["resolve"]) {
    const app = express();
    registerPaymentClientConfigApi(
      app,
      {
        requireActiveMember: (req: Request, res: Response, next) => {
          const token = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          if (token !== "token-owner") {
            res.status(401).json({ ok: false, code: "unauthorized" });
            return;
          }
          (req as Request & { researchMember?: { id: string } }).researchMember = { id: "22222222-2222-4222-8222-222222222222" };
          next();
        },
      },
      { resolve },
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    return async (token?: string) => {
      const response = await fetch(`${origin}${PAYMENT_CLIENT_CONFIG_PATH}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      return { status: response.status, headers: response.headers, text: await response.text() };
    };
  }

  it("answers the signed-in buyer privately, refuses everyone else, and never carries a secret", async () => {
    const env = { STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake_unit_test_only", STRIPE_WEBHOOK_SECRET: "whsec_fake_unit_test_only" };
    const call = await serve(() => resolvePaymentClientConfig(stripe(), env));
    expect((await call()).status).toBe(401);
    const owner = await call("token-owner");
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.parse(owner.text)).toEqual({ ok: true, config: { provider: "stripe", publishableKey: "pk_test_abcdefgh12345678", mode: "test" } });
    expect(owner.text).not.toContain("sk_test");
    expect(owner.text).not.toContain("whsec");
  });

  it("answers 503 with the precise code when payment is disabled or misconfigured, and when the resolver throws", async () => {
    const disabled = await serve(() => ({ ok: false, code: "payment_disabled" }));
    expect(await disabled("token-owner")).toMatchObject({ status: 503 });
    expect(JSON.parse((await disabled("token-owner")).text)).toMatchObject({ ok: false, code: "payment_disabled" });
    const broken = await serve(() => {
      throw new Error("sk_test_leaked_in_error");
    });
    const answer = await broken("token-owner");
    expect(answer.status).toBe(503);
    expect(answer.text).not.toContain("sk_test");
  });
});
