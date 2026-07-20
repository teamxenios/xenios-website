# xenios research: project state

Updated: 2026-07-19 by CLAUDE_INTEGRATION_COORDINATOR.
See integration/RELEASE_BOARD.md for the full release train and
file-claims.md for one-owner-per-file assignments.

## Current gate (2026-07-19)

- origin/main = 468466f (PRs #22, #23, #24 merged: fraud controls, canonical
  /research gateway architecture, requireActiveMember on catalog/orders,
  reward-promotion tick, Tailwind restore).
- PR #25 (account/email/recovery hardening) is OPEN, draft, MERGEABLE at head
  f48bda0, independently reviewed **READY**. It is the Phase-0 blocker: no
  downstream session starts until Samuel reviews the exact head and merges
  (the author does not merge). PR #13 is closed/superseded.
- Everything below the account/email lane branches from the POST-#25
  origin/main. Building against 468466f now would stack on or diverge from
  #25 — forbidden. All production flags stay false through code merge.

---

## Historical (pre-#25)

Updated: 2026-07-18 by CLAUDE_PRIMARY

Canonical spec: XENIOS_RESEARCH_CANONICAL_V3 (Samuel's V3 whole-thread prompt).
Source-of-truth order: Samuel's newest instruction > V3 > decisions/accepted/ >
AGENTS.md > current repository architecture and tests > main-site design system.

## Merged and live in main

- PR #8: native /research section (gate, catalog server-side only, cart, orders API, pages).
- PR #9: membership-first public pages + application system + privacy hardening.
  - 12-status application state machine, server-enforced, append-only event audit.
  - Privacy: duplicate submissions generic and indistinguishable; status tokens travel
    only by email to the address on file; resubmission requires the signed token;
    rate-limited resend-link; RESEARCH_SESSION_SECRET required in production
    (fail-closed), never derived from the access password; tokens kept out of URLs,
    logs, analytics; Referrer-Policy: no-referrer.
  - Tests: vitest + supertest, `npm run test` (12 passing at merge).

## Open PRs

- PR #11 (research-admin-queue): admin review queue UI, the Research tab in /admin.
  Awaiting Samuel's review. UI only.

## In progress (this branch: research-referral-foundation)

- V3 section 83 "Then" item 7: referral identity + attribution + reward/ledger
  foundation, ALL behind feature flags defaulting to false (V3 section 84).
  Backend only; public referral UI is CODEX_UI's lane per section 81.2.

## Known blockers

- LIVE ISSUE: production /research returns the fail-closed 503. One of
  RESEARCH_ACCESS_PASSWORD / RESEARCH_SESSION_SECRET is not reaching the Render
  service. Samuel must verify both env keys on the xenios-website service.
- Stripe keys absent: Phase 5 activation not started (per Samuel's standing
  instruction and section 83; approved applicants see the branded pending state).
- Supabase DDL is run by Samuel in the SQL Editor: supabase/research-membership.sql
  is run; supabase/research-referrals.sql is pending.

## Environment quick reference

Required in production: RESEARCH_ACCESS_PASSWORD and RESEARCH_SESSION_SECRET
(research is private by canonical decision: RESEARCH_PUBLIC and
RESEARCH_INDEXABLE stay false). Membership economics: $50 one-time activation
plus $25 recurring monthly membership, no annual membership; the activation
path is gated by RESEARCH_MEMBERSHIP_BILLING_ENABLED (default false; while
false no member activates and no referral qualifies). Referral flags (all
default false): RESEARCH_REFERRALS_ENABLED, RESEARCH_APPLICANT_INVITES_ENABLED,
RESEARCH_MEMBER_CREDITS_ENABLED, RESEARCH_AMBASSADORS_ENABLED,
RESEARCH_REFERRAL_SOCIAL_CARDS_ENABLED.
