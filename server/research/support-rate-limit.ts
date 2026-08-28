// ONE member-scoped support-submission budget (P2-3, 2026-08-27).
//
// The classic questions door (web + Telegram) and the customer-account
// support door previously drew from two independent buckets, which quietly
// doubled the effective write budget to 20/hour. Every support-shaped
// submission now consumes THIS one authority — same key, same window, same
// limit — so a member's total across every door is bounded once.
//
// Keyed by the member id the guard resolved, never by client-controlled
// email or IP alone. Both doors use the same durable fixed-window key. The
// classic questions door retains the generic limiter's documented memory
// fallback; the account portal fails closed when durable shared truth is
// absent rather than presenting an instance-local budget as shared.

import { rateLimitHit } from "./rate-limit";

export const SUPPORT_SUBMISSION_LIMIT_PER_HOUR = 10;
export const SUPPORT_SUBMISSION_WINDOW_SECONDS = 3600;

function supportSubmissionKey(memberId: string): string {
  return `member-support-submission:${memberId}`;
}

/** Classic questions-door policy: durable when available, process-local fallback otherwise. */
export function supportSubmissionAllowed(memberId: string): Promise<boolean> {
  return rateLimitHit(
    supportSubmissionKey(memberId),
    SUPPORT_SUBMISSION_WINDOW_SECONDS,
    SUPPORT_SUBMISSION_LIMIT_PER_HOUR,
  );
}

/** Account support requires the shared durable budget to be available. */
export function accountSupportSubmissionAllowed(memberId: string): Promise<boolean> {
  return rateLimitHit(
    supportSubmissionKey(memberId),
    SUPPORT_SUBMISSION_WINDOW_SECONDS,
    SUPPORT_SUBMISSION_LIMIT_PER_HOUR,
    { durableFailurePolicy: "deny" },
  );
}
