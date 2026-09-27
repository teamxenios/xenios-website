import crypto from "node:crypto";
import type { StatusRecoveryCrypto } from "./ports";

export function statusRecoveryDigest(value: string): string {
  return crypto
    .createHash("sha256")
    .update("xenios.status-recovery.v1\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function deliveryKey(): Buffer {
  const secret = process.env.RESEARCH_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEARCH_SESSION_SECRET is required in production");
    }
    return crypto
      .createHash("sha256")
      .update("xenios-status-recovery-dev-only-secret", "utf8")
      .digest();
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export const statusRecoveryCrypto: StatusRecoveryCrypto = Object.freeze({
  randomToken: () => crypto.randomBytes(32).toString("base64url"),
  // A durable outbox retry must regenerate the exact same link without ever
  // persisting the bearer token. HMAC-SHA-256 produces a 256-bit opaque token
  // bound to the existing server secret and the event's stable idempotency key.
  deliveryToken: (idempotencyKey: string) => crypto
    .createHmac("sha256", deliveryKey())
    .update("xenios.status-recovery.delivery.v1\0", "utf8")
    .update(idempotencyKey, "utf8")
    .digest("base64url"),
  digestToken: statusRecoveryDigest,
  stableHash: (value: string) => crypto
    .createHash("sha256")
    .update("xenios.status-recovery.stable.v1\0", "utf8")
    .update(value, "utf8")
    .digest("hex"),
});
