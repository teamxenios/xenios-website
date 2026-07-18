# CODEX_UI Status

**Updated:** 2026-07-18T16:23:08-05:00
**Mode:** local Codex desktop project with direct filesystem access
**Repository:** teamxenios/xenios-website
**Working directory:** C:\Users\sboad\Downloads\xenios-website-codex-ui
**Remote:** https://github.com/teamxenios/xenios-website.git
**Base branch:** main
**Base SHA:** df8e4c53fc676b2b413fa509518e73ac06194a7e
**Working branch:** codex/research-ui-content
**UI-002 implementation:** b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6
**Contract-reconciliation commit:** 970d153d2499f6838c75471a487f58687fe0fc52
**Fail-closed correction commit:** b33f9a74f653a8c8ee2b0131a310c3480374106d
**Draft PR:** #13 into main
**State:** integration corrections implemented; INTEGRATION_QA re-review requested; do not merge yet

## Local visibility

Codex is operating locally and can read both this worktree and Claude's physical checkout at C:\Users\sboad\Downloads\xenios-website. It cannot see content that exists only in Claude's hidden conversation. No Claude-owned backend, auth, admin, or Supabase source was changed by the PR #13 correction.

## Current UI contract

- Invitation routes fail closed. A normalized URL code is not authenticity.
- With the server validation endpoint and flags disabled, valid-looking and malformed codes render unavailable or invalid, attach no ref value, and make no referrer claim.
- The application ignores an untrusted ref query value.
- Production referral presentation exposes PR #12's aggregate-only dashboard boundary: visits, applications, qualified, credit available, and credit pending.
- Production renders no invitation identifiers, individual dates, applicant identity, person-level statuses, QR, or enabled sharing.
- Give $10, Get $15 and all qualification/reward terms are proposed and configurable while flags are off.
- Optional samples require development mode plus preview=1 and are visibly labeled non-production. They remain aggregate-only and keep codes, credits, QR, and sharing disabled.
- PR #12 retains ownership of shared/server referral contracts. The PR #13 adapter is client presentation code only.

## Validation

- npm test: 2 files and 18 tests passed.
- npm run build: passed; main JS remains 715.25 kB and retains the existing Vite chunk warning.
- npm run check: only the pre-existing server/storage.ts(48,40): TS7006 remains.
- Focused browser QA at 390 x 844: valid-looking invitation unavailable; malformed invitation invalid; no ref links; no member-invited claim; no QR matrix; no enabled share actions; aggregate production metrics 0/0/0/Unavailable; development preview 8/3/1/Unavailable; no person-level rows; application with ref query has no referral input or prefill; zero document overflow.

## Coordination requirements

- Before CODEX_UI starts an overlapping lane or approves a merge, read docs/agent-coordination/status/INTEGRATION_QA.md and the latest versioned INTEGRATION_QA handoff.
- Versioned P1 findings from INTEGRATION_QA block merge until addressed and re-reviewed.
- Claude should review the aggregate adapter against the final PR #12 shared contract after its backend blockers are fixed.
- Integration should reconcile the known coordination-document conflicts only after backend fixes and merge order are known.

## Production status

INTEGRATION_QA independently rechecked https://xeniostechnology.com/research at 2026-07-18 15:42 CDT. It returned HTTP 503 with body "The research section is not configured." PR #13 has not been deployed and does not claim the live Research gate is fixed.
