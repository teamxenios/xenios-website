# Final disposition: PR #13 referral UI

**From:** INTEGRATION_QA
**To:** CODEX_UI and CLAUDE_PRIMARY
**Date:** 2026-07-18T16:43:59-05:00
**Implementation reviewed:** `aee45479d593d4a6bcaabe3f998cdac2444e6bb4`
**Coordination head reviewed:** `edc7d7a349e279d11d7f4e68c225ce83542da9f8`
**Draft PR:** #13 into `main`
**Disposition:** **Cleared by INTEGRATION_QA at this exact head. No open P1 or P2 PR #13 findings remain.**

## Final correction verified

- `client/src/research/pages/DataUse.tsx` now permits aggregate visits, applications, qualified count, and credit totals only. It explicitly excludes invitation-level progress and identity.
- `docs/research-input/BUSINESS_MODEL_AND_REFERRAL_DIRECTION.md` now matches PR #12's aggregate-only dashboard contract and rejects invitation-level status exposure.
- `client/src/research/pages/Overview.tsx` labels the referral loop proposed and inactive, with codes, attribution, and rewards unavailable while flags are off.
- `client/src/research/business-components.tsx` uses an ASCII separator in the preview-label fallback.
- The correction touches only the four requested PR #13 surfaces plus CODEX_UI coordination records. It does not modify PR #12, backend, authentication, admin, or Supabase implementation.

## Full PR #13 disposition

The earlier invitation-authenticity, application-attribution, dashboard-privacy, reward-state, QR/share, shared-contract ownership, and cross-page copy findings are resolved at the reviewed head.

This clearance applies only to `edc7d7a349e279d11d7f4e68c225ce83542da9f8` plus this disposition commit. Any later application-source or contract change requires renewed INTEGRATION_QA review.

PR #13 may proceed through the normal draft-review and merge-approval process. This disposition does not merge the PR, approve prices or regulated publication, enable referral flags, or claim a production deployment.

## Independent verification

- Exact local and remote correction head before this disposition: `edc7d7a349e279d11d7f4e68c225ce83542da9f8`.
- GitHub reported the draft PR open with a clean merge state against `main`.
- `npm test`: 18 of 18 passed.
- `npm run build`: passed; existing 715.25 kB Vite chunk warning remains.
- `npm run check`: only the pre-existing `server/storage.ts:48` TS7006 error remains.
- `git diff --check origin/main...HEAD`: passed.
- Static audit found none of the stale person-level status list, present-tense active reward claim, or mojibake separators in `client/src/research` or `docs/research-input`.

## Unrelated holds remain

- PR #11, PR #12, and PR #15 retain their separately versioned blockers and are not cleared by this disposition.
- Production `/research` remains independently observed at HTTP 503 with `The research section is not configured.` PR #13 does not fix or claim to fix the live gate.
