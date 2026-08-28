// ONE member-scoped support-submission budget (P2-3, 2026-08-27).
//
// The classic questions door (web + Telegram) and the customer-account
// support door previously drew from two independent buckets, which quietly
// doubled the effective write budget to 20/hour. Every support-shaped
// submission now consumes THIS one authority — same key, same window, same
// limit — so a member's total across every door is bounded once.
//
// Keyed by the member id the guard resolved, never by client-controlled
// email or IP alone. Backed by the durable fixed-window limiter
// (research_rate_limit_hit) with its documented in-memory fallback.

import { rateLimitHit } from "./rate-limit";

export const SUPPORT_SUBMISSION_LIMIT_PER_HOUR = 10;
export const SUPPORT_SUBMISSION_WINDOW_SECONDS = 3600;

/** True when this member may submit another support/question write anywhere. */
export function supportSubmissionAllowed(memberId: string): Promise<boolean> {
  return rateLimitHit(
    `member-support-submission:${memberId}`,
    SUPPORT_SUBMISSION_WINDOW_SECONDS,
    SUPPORT_SUBMISSION_LIMIT_PER_HOUR,
  );
}
