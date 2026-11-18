import express, { type Express } from "express";
import { attachResendReceiptDoor } from "../assisted-order/quote/delivery/signed-receipts.mjs";
import { customerNoticeReceiptChannel, type CustomerNoticeReceiptRecorder } from "../assisted-order/request-intent/customer-notice-receipts";
import { resendWebhookVerifier } from "./resend-webhook-signature.mjs";

type QuoteReceipts = {
  receive(bytes: Buffer, headers: readonly string[], reconcile: (...args: unknown[]) => unknown): Promise<{ status: number; unclaimed?: boolean }>;
};
type Reconcile = (...args: unknown[]) => unknown;
export type SharedQuoteReceiptOptions = {
  enabled: true;
  tenant: string;
  secrets: readonly string[];
  expressRaw: typeof express.raw;
  attachChannel(receipts: QuoteReceipts, reconcile: Reconcile): void;
};

/** Configuration is server-owned and bound to one exact deployed environment. */
export function receiptEnvironment(env: NodeJS.ProcessEnv): "ea-production" | "ea-staging" | null {
  if (env.RENDER !== "true" || env.IS_PULL_REQUEST === "true") return null;
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  if (env.RENDER_SERVICE_ID === "srv-d8s9vej7uimc7384dfcg" && url === "https://yvzeduaxbwgcwllhywff.supabase.co") return "ea-production";
  if (env.RENDER_SERVICE_ID === "srv-d9h4f4m7r5hc73ctjng0" && url === "https://srcphrgnxreqyirkitxd.supabase.co" &&
      env.RENDER_EXTERNAL_URL === "https://xenios-research-staging.onrender.com") return "ea-staging";
  return null;
}

/**
 * Mount once, BEFORE the global JSON/urlencoded parsers. Customer receipts do
 * not require the private quote desk, its issuer, a quote DB login or a sender.
 * A fully authorized quote desk can attach its channel later to this same door.
 * No secret, provider payload, address or configuration value is logged.
 */
export function mountEarlyAccessReceiptEndpoint(
  app: Express,
  env: NodeJS.ProcessEnv,
  record?: CustomerNoticeReceiptRecorder,
) {
  const tenant = receiptEnvironment(env);
  if (env.EA_REQUEST_DELIVERY_RECEIPTS_ENABLED !== "true" || !tenant) return null;
  let secrets: readonly string[] = [];
  let verify: ReturnType<typeof resendWebhookVerifier> | null = null;
  try {
    const configured: unknown = JSON.parse(env.EA_REQUEST_DELIVERY_RECEIPT_SECRETS ?? "null");
    if (!Array.isArray(configured) || configured.some(value => typeof value !== "string")) throw new Error();
    secrets = Object.freeze([...configured]);
    verify = resendWebhookVerifier({ secrets });
  } catch {
    // Configuration failure must not acknowledge provider events or disable
    // unrelated intake. This bounded door remains retryable with no DB call.
    verify = null;
  }
  let quote: { receipts: QuoteReceipts; reconcile: Reconcile } | null = null;
  const notices = verify ? customerNoticeReceiptChannel(secrets, record) : null;
  attachResendReceiptDoor(app, {
    raw: express.raw,
    receipts: {
      async receive(bytes: Buffer, headers: readonly string[]) {
        if (!verify) return { status: 503 };
        // The quote channel normally performs this first shared verification.
        // Keep the same signature boundary while the issuing desk is closed.
        try { verify(bytes, headers); } catch { return { status: 400 }; }
        if (quote) return quote.receipts.receive(bytes, headers, quote.reconcile);
        return { status: 204, unclaimed: true };
      },
    },
    reconcile: async () => undefined,
    notices,
  });
  return {
    status: verify ? "enabled" as const : "unavailable" as const,
    forQuote(expectedTenant: string): SharedQuoteReceiptOptions | null {
      if (!verify || expectedTenant !== tenant) return null;
      return {
        enabled: true, tenant, secrets, expressRaw: express.raw,
        attachChannel(receipts, reconcile) {
          if (quote || typeof receipts?.receive !== "function" || typeof reconcile !== "function") {
            throw new Error("Shared quote receipt channel already attached or invalid.");
          }
          quote = { receipts, reconcile };
        },
      };
    },
  };
}
