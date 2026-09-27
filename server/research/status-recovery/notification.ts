import { STATUS_RECOVERY_EMAIL_LIFETIME_MINUTES } from "../../../shared/research/status-recovery/contract";
import type { StatusRecoveryClock, StatusRecoveryCrypto, StatusRecoveryStore } from "./ports";

const DEFAULT_SITE_ORIGIN = "https://xeniostechnology.com";

export type StatusRecoveryOutboxJob = Readonly<{
  event_key: unknown;
  recipient: unknown;
  payload: unknown;
}>;

export type PreparedStatusRecoveryEmail = Readonly<{
  to: string;
  subject: string;
  text: string;
}>;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function trustedSiteOrigin(configured: string | undefined): string {
  try {
    const value = new URL((configured ?? "").trim() || DEFAULT_SITE_ORIGIN);
    if (
      value.protocol !== "https:"
      || value.username !== ""
      || value.password !== ""
      || value.pathname !== "/"
      || value.search !== ""
      || value.hash !== ""
    ) return DEFAULT_SITE_ORIGIN;
    return value.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export async function prepareStatusRecoveryOutboxEmail(input: Readonly<{
  job: StatusRecoveryOutboxJob;
  store: StatusRecoveryStore;
  crypto: StatusRecoveryCrypto;
  clock: StatusRecoveryClock;
  siteUrl?: string;
}>): Promise<PreparedStatusRecoveryEmail | null> {
  const payload = record(input.job.payload);
  if (!payload) return null;
  const subjectType = payload.subjectType;
  const subjectId = payload.subjectId;
  const ownerId = payload.ownerId;
  const idempotencyKey = payload.idempotencyKey;
  if (
    subjectType !== "assisted_order"
    || typeof subjectId !== "string"
    || !UUID.test(subjectId)
    || !(ownerId === null || (typeof ownerId === "string" && UUID.test(ownerId)))
    || typeof idempotencyKey !== "string"
    || !/^[0-9a-f]{64}$/u.test(idempotencyKey)
  ) return null;

  // Deterministic only to the secret server key + durable event identity. It
  // remains an opaque 256-bit credential, but a provider/outbox retry cannot
  // rotate the digest underneath an email the provider already accepted.
  const rawToken = input.crypto.deliveryToken(idempotencyKey);
  const createdAt = input.clock.now();
  const binding = await input.store.prepareDelivery({
    subjectType,
    subjectId,
    ownerId: ownerId as string | null,
    idempotencyKey,
    tokenDigest: input.crypto.digestToken(rawToken),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + STATUS_RECOVERY_EMAIL_LIFETIME_MINUTES * 60 * 1000,
    ).toISOString(),
    source: "public_status_recovery",
  });
  if (!binding) return null;

  // The recipient is re-read from the canonical subject during delivery. A
  // stale or hand-modified outbox row cannot redirect the credential to its
  // stored `recipient` value.
  const recoveryUrl = `${trustedSiteOrigin(input.siteUrl)}/status#recovery=${encodeURIComponent(rawToken)}`;
  return Object.freeze({
    to: binding.canonicalEmail,
    subject: `Secure Xenios order status link (${binding.publicReference})`,
    text: [
      "Use this secure link to check the status of your Xenios order request.",
      "",
      `Reference: ${binding.publicReference}`,
      `Secure status link: ${recoveryUrl}`,
      "",
      `This single-use link expires in ${STATUS_RECOVERY_EMAIL_LIFETIME_MINUTES} minutes. Opening the page does not use the link; choose “View status” on the page to continue.`,
      "If you did not request this link, you can ignore this email.",
      "",
      "Xenios Research",
      "research@xeniostechnology.com",
    ].join("\n"),
  });
}
