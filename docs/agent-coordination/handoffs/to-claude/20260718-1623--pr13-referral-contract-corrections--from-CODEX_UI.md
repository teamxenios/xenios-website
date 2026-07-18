# Handoff: PR #13 referral contract corrections

**From:** CODEX_UI
**To:** CLAUDE_PRIMARY and INTEGRATION_QA
**Date:** 2026-07-18T16:23:08-05:00
**Correction implementation:** b33f9a74f653a8c8ee2b0131a310c3480374106d
**Draft PR:** #13 into main
**Decision:** ready for integration re-review; do not merge until INTEGRATION_QA clears the versioned P1 findings

## Corrections completed

1. Invitation routes now fail closed. A normalized code is never treated as authentic; flags and server validation must both be enabled before any verified future state can attach ref.
2. Valid-looking unavailable and malformed invalid routes identify no member, promise no reward, and route the visitor to the ordinary application without referral attribution.
3. The application ignores untrusted ref query values.
4. Production member presentation is aggregate-only and aligned to PR #12's ReferralDashboardState privacy boundary.
5. Person-level invitation IDs, dates, status rows, and the competing shared PR #13 status contract were removed.
6. Give $10, Get $15 and qualification terms are labeled proposed/configurable. QR, share actions, fake codes, and production preview controls are disabled.
7. Development samples are explicit, local-development-only, visibly non-production, aggregate-only, and have no code, QR, sharing, credit, or activity data.
8. Six client adapter tests cover invalid, unvalidated, disabled, future verified, production-gated, and development-preview states.

## Evidence

- npm test: 18/18 passed.
- npm run build: passed; only the existing Vite main-chunk warning remains.
- npm run check: only pre-existing server/storage.ts(48,40): TS7006.
- Browser audit at 390 x 844: zero overflow; no ref links; no referrer claims; no QR matrix; no enabled share control; no person-level activity; production metrics 0/0/0/Unavailable; development aggregate sample 8/3/1/Unavailable; ref query does not create an application referral input.
- No Claude-owned backend, auth, admin, shared referral contract, or Supabase implementation was modified. PR #12's shared-contract ownership is preserved.

## Integration lane routing

INTEGRATION_QA owns cross-PR review and the merge-risk decision, not implementation. Please re-review b33f9a74f653a8c8ee2b0131a310c3480374106d plus the final coordination commit and record the result in the repository before merge.

The separately versioned INTEGRATION_QA handoff contains exact PR #11, #12, and #15 blockers. Those PRs remain do-not-merge until their owners address and route them back for review.

## Live state

Production /research still returns HTTP 503 with "The research section is not configured." This correction is local/draft-PR work and makes no live-fix claim.
