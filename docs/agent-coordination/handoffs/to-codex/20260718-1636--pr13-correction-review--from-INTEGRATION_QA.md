# Disposition: PR #13 referral contract corrections

**From:** INTEGRATION_QA
**To:** CODEX_UI and CLAUDE_PRIMARY
**Date:** 2026-07-18T16:36:01-05:00
**Implementation reviewed:** `b33f9a74f653a8c8ee2b0131a310c3480374106d`
**Coordination head reviewed:** `efca312919f84953ce188a73b14ba77c9cb6246b`
**Draft PR:** #13 into `main`
**Disposition:** **Not cleared for merge. One P2 privacy/feature-state contract blocker remains.**

## Corrections verified

- Invitation routes fail closed. Valid-looking and malformed URL codes do not identify a referrer, attach `ref`, or enable a QR/share target.
- The application does not prefill `referralCode` from the query string.
- Production and development member dashboards expose aggregate counts only. Person-level rows, identifiers, dates, and statuses were removed from that surface.
- The dedicated referral page labels Give $10, Get $15 as proposed/configurable and leaves codes, QR, sharing, credits, and attribution disabled.
- The competing PR #13 shared referral helper was removed, preserving PR #12 ownership of `shared/research/referral-types.ts`.
- The new client adapter tests cover malformed, unvalidated, disabled, future-verified, production-disabled, and development-preview states.

## Remaining P2 blocker: cross-page copy still violates the aggregate-only contract

1. `client/src/research/pages/DataUse.tsx:36` says a referrer may receive `Invited`, `Pending`, `Qualified`, `Reward earned`, or `Expired`. Those are person-level progress states. This conflicts with PR #12's `ReferralDashboardState`, which permits aggregate visits, applications, qualified count, and credit totals only. It also contradicts the corrected member/referral pages and the correction handoff's claim that person-level statuses were removed.
2. `docs/research-input/BUSINESS_MODEL_AND_REFERRAL_DIRECTION.md:85` repeats the same person-level status model. Update the versioned direction to the accepted aggregate-only boundary, or route a separate explicit shared-contract/privacy decision before reintroducing individual status data.
3. `client/src/research/pages/Overview.tsx:91` describes the referral loop as one that "rewards qualified activation" in present tense while every referral/reward flag is disabled. Label this surface as proposed/inactive so it matches the dedicated referral page.

Required direction: make every PR #13 public and versioned surface consistent with the aggregate-only, disabled-by-default contract. Do not expand PR #12's shared contract as part of this copy fix.

## Non-blocking cleanup

- `client/src/research/business-components.tsx:244` contains a mojibake separator in its unused preview-label fallback. Current call sites supply clean explicit labels, so this is not a rendered blocker, but the fallback should be normalized to plain UTF-8 or ASCII.

## Independent verification

- Exact local and remote head: `efca312919f84953ce188a73b14ba77c9cb6246b`.
- `npm test`: 18 of 18 passed.
- `npm run build`: passed; existing 715.25 kB Vite chunk warning remains.
- `npm run check`: only the pre-existing `server/storage.ts:48` TS7006 error remains.
- `git diff --check origin/main...HEAD`: passed.
- Static route/call-site audit confirmed no production code, QR, enabled share action, person-level dashboard row, or application query prefill.

Route the copy/documentation fix back with a new commit ID. INTEGRATION_QA will re-review that exact head before changing the merge disposition.
