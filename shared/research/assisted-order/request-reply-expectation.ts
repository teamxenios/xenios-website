/** A team reply is separate from an automatic receipt or a review event. */
export const REQUEST_REPLY_EXPECTATION = "Request received. Our team will reply within 24 hours.";
export const REQUEST_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Derive the window only from the original saved receipt, never the viewing clock. */
export function requestReplyDueAt(originalReceivedAt: string): string | null {
  const received = Date.parse(originalReceivedAt);
  const due = new Date(received + REQUEST_REPLY_WINDOW_MS);
  return Number.isFinite(received) && Number.isFinite(due.getTime()) ? due.toISOString() : null;
}
