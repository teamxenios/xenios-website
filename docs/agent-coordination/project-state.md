# Xenios Research Project State

**Updated:** 2026-07-18T15:50:14-05:00
**Repository:** `teamxenios/xenios-website`
**Primary deployment:** existing xenios website and Render service
**Research route family:** `/research`

## Git state

- PR #8 is merged into `main` at `138e3238`.
- PR #9 merged into `main` at `df8e4c53fc676b2b413fa509518e73ac06194a7e` on 2026-07-18.
- Claude's merged implementation head was `f9c44807fa3aa70021f27654a31c8dd8aa32a725`.
- Claude's physical checkout is `C:\Users\sboad\Downloads\xenios-website`; it was clean when Codex last inspected it.
- Codex works in `C:\Users\sboad\Downloads\xenios-website-codex-ui` on `codex/research-ui-content`.
- UI-002 implementation is published at `b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6`.
- The Codex branch merged the current `origin/main` at `7856966a782d55aef9b1b0f9a1ac570c19c0cb5a`.
- Codex reconciled explanatory copy and aggregate dashboard labels with Claude's unmerged `shared/research/referral-types.ts` contract at `970d153d2499f6838c75471a487f58687fe0fc52`.
- PR #10 closed automatically when its deleted feature base disappeared.
- PR #13 is an open draft from `codex/research-ui-content` into `main`.

## Current milestone

UI-002 is implemented, validated, pushed, and awaiting Claude and Samuel review. No deployment or regulated public launch was performed.

## Product boundary

- Research is a private member acquisition, activation, monetization, retention, referral, and trust system.
- The current public presentation remains behind the existing password gate and `noindex` until infrastructure and publication approvals are complete.
- Give $10, Get $15 is presented only after independent approval, $50 activation, and verification.
- Preview identifiers never call an API and are marked as UI preview data.
- Member-referral production UI remains empty and disabled until authenticated contracts exist.
- No referrer may receive applicant identity, application content, health information, approval reasoning, or decline reasoning.

## Open infrastructure work

Claude retains ownership of authentication, membership state, payments, onboarding, private Blueprint processing, referral issuance and validation, attribution, qualification, reward ledger, expiration, fraud controls, admin, analytics, consent persistence, retention, and privacy requests.

## Known validation state

- Tests: 16 of 16 pass.
- Build: passes.
- Typecheck: pre-existing `server/storage.ts(48,40): TS7006` only.
- Browser: zero final console warnings/errors and zero overflow at tested viewports.
- Main bundle: existing greater-than-500 kB warning remains.
- Production: `https://xeniostechnology.com/research` independently returned HTTP 503 with `The research section is not configured.` at 2026-07-18 15:42 CDT. No UI-002 deployment occurred, and the live gate remains an external configuration blocker.
