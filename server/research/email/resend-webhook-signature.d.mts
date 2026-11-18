export type ResendDeliveryKind = "accepted" | "delivered" | "bounced";

/** A provider event whose exact bytes carried a valid signature from an approved secret. */
export type VerifiedResendEvent = {
  /** The signed message id (svix-id): one per provider event, stable across retries. */
  eid: string;
  /** The parsed event. Only `type` is checked here; each channel checks the rest. */
  event: { type: string; data?: unknown; [key: string]: unknown };
  /** sha256 hex of the exact request bytes. */
  digest: string;
};

/** Throws on any signature, header, window, size or encoding failure. */
export type ResendWebhookVerifier = (bytes: Buffer, headers: readonly string[]) => VerifiedResendEvent;

export function resendDeliveryKind(type: unknown): ResendDeliveryKind | null;
export function resendWebhookVerifier(options: { secrets: readonly string[]; now?: () => number }): ResendWebhookVerifier;
