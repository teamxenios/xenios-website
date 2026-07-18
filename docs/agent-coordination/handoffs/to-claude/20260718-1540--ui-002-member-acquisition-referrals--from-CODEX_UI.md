# Handoff: UI-002 member acquisition and referral presentation

**From:** CODEX_UI
**To:** CLAUDE_PRIMARY
**Date:** 2026-07-18T16:23:08-05:00
**Original implementation:** b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6
**Contract reconciliation:** 970d153d2499f6838c75471a487f58687fe0fc52
**Fail-closed correction:** b33f9a74f653a8c8ee2b0131a310c3480374106d
**Draft PR:** #13 into main
**State:** corrected; INTEGRATION_QA re-review requested; do not merge yet

## Final PR #13 presentation boundary

- Invitation routes fail closed. URL normalization is syntax handling, not authenticity.
- While invitation validation and feature flags are disabled, the route presents unavailable or invalid, identifies no referrer, attaches no ref query, and promises no reward.
- The application does not prefill from an untrusted ref query parameter.
- Production member presentation consumes only PR #12's aggregate ReferralDashboardState boundary. It renders no per-invitation identifier, date, identity, or status row.
- Production QR and sharing actions remain disabled. No fake member code or executable preview link is rendered.
- Give $10, Get $15, qualification, expiry, reversal, and reward terms are explicitly proposed and configurable while flags are off.
- Development samples require the local development build and preview=1, display a prominent non-production label, remain aggregate-only, and keep codes, credits, QR, and sharing disabled.
- PR #12 owns shared/server referral contracts. PR #13 removed its competing shared presentation contract and keeps its adapter under client/src/research.

## Backend contract request

When PR #12's P1 findings are fixed and its shared contract is ready for integration:

1. Provide an enabled, authenticated invitation-validation response before CODEX_UI can display a verified invitation or attach a ref value.
2. Bind dashboard access and codes to stable authenticated member identity.
3. Preserve the aggregate-only privacy boundary unless a separately reviewed shared-contract change explicitly expands it.
4. Enable credits independently from referrals and only after the ledger transitions are atomic, idempotent, window-aware, and fraud checked.
5. Return explicit feature availability so the UI can continue to fail closed.

## Verification

- npm test: 18 of 18 passed across 2 files, including malformed, unvalidated, disabled, fully validated future-state, production-gating, and aggregate development-preview cases.
- npm run build: passed with the existing main-bundle size warning.
- npm run check: only pre-existing server/storage.ts(48,40): TS7006.
- Browser at 390 x 844: unavailable and invalid invitation states, no ref links or referrer claims, no QR matrix, six disabled public share controls, aggregate-only member counts, no activity rows, no application prefill from ref, and zero document overflow.

## Integration/QA lane

INTEGRATION_QA is now an explicit third coordination participant. Before merging or beginning overlapping work, both CLAUDE_PRIMARY and CODEX_UI must read docs/agent-coordination/status/INTEGRATION_QA.md and the latest versioned INTEGRATION_QA handoff. Versioned P1 findings block merge until addressed and re-reviewed.

The current integration handoff also routes the exact PR #11, #12, and #15 blockers to Claude without changing any backend, admin, auth, or Supabase source.

## Production blocker

INTEGRATION_QA independently rechecked https://xeniostechnology.com/research at 2026-07-18 15:42 CDT. Production still returned HTTP 503 with body "The research section is not configured." PR #13 does not fix or claim to fix that live gate.

## Merge note

Do not merge PR #13 until INTEGRATION_QA re-reviews b33f9a74f653a8c8ee2b0131a310c3480374106d and the final coordination head. Leave the existing route-ownership, project-state, and CLAUDE_PRIMARY-status conflicts for integration after backend fixes and merge-order review.
