# Handoff to CODEX_UI: the /research gateway architecture (canonical)

From CLAUDE_PRIMARY, 2026-07-18. This supersedes any earlier direction that
treated /research as a marketing or catalog page.

## What changed (already implemented on the integration branch, PR #22)

/research is now a MINIMAL PRIVATE GATEWAY: wordmark, "Private membership"
eyebrow, "Xenios Research" headline, one sentence, Apply for Membership +
Member Login, and Privacy/Terms/Support footer links. One viewport, no
navigation, no catalog, no sections. client/src/research/pages/Gateway.tsx.

Route flow (client/src/research/section.tsx):

- /research                      the gateway (bare chrome)
- /research/apply                application (minimal chrome)
- /research/sign-in              member login
- /research/application/status   applicant status (alias of /apply/status,
                                 which emailed links still use)
- /research/activate             approved-member activation only
- /research/policies/:policy     readable behind the shared password
- /research/member + /research/products(/peptides|supplements|quantum) +
  /systems /guides /orders /subscriptions /referrals /profile
                                 the private member website (RequireMember)
- legacy content paths redirect into the member area

Access architecture (server, do not weaken):

- the shared password cookie unlocks the gateway + application flows ONLY
- /api/research/catalog and /orders now require the member JWT
  (requireMember); the password cookie does NOT unlock them
- an authenticated member bypasses the shared password on exactly the
  member-authed endpoints (server/research/index.ts MEMBER_AUTHED_PREFIXES)
- tests: server/research/access-architecture.test.ts

## What this means for PR #13

- Rebase onto main after PR #22 merges. section.tsx and layout.tsx changed
  substantially; take the integration branch's versions and re-add your pages
  INSIDE the member area (RequireMember) or the pre-member flows as fits.
- Referral UI belongs at /research/referrals behind RequireMember. A compact
  placeholder page exists (pages/MemberArea.tsx ReferralsPage); replace or
  extend it. The dashboard API contract is unchanged
  (/api/research/member/referrals, aggregates only).
- Do NOT add content sections, catalog previews, or navigation to /research
  (the gateway). Definition of done for that page is one viewport.
- Pricing copy everywhere: $50 one-time activation PLUS $25 monthly
  membership, no annual plan. The old "no recurring charge" language is gone;
  do not reintroduce it.
- Known repo quirk: the Tailwind build drops most spacing utilities (mt-*,
  px-*, gap-*, sm:*). Use inline styles or the design-system classes
  (container-x, section-y, card) for structural spacing until the pipeline
  fix lands.

## Flags (unchanged)

RESEARCH_PUBLIC=false, RESEARCH_INDEXABLE=false, RESEARCH_REFERRALS_ENABLED=false,
RESEARCH_MEMBERSHIP_BILLING_ENABLED=false. The homepage stays at the root
domain; never redirect / to /research.
