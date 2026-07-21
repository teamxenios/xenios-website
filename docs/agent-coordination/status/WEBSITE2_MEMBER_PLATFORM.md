# Website 2 status: member platform backend (G2-G5 + G10)

Lane: `claude/research-member-platform-blitz`
Worktree: `C:\Users\sboad\projects\wt-research-member-platform-blitz`
Base: origin/main f7d6e8c (PR #25, #26, #27, #28 merged)
Owner window: server/research/{identity,agreements,activation,profile,assessment,
blueprint,plans,documents,tracker,media,telegram,questions}* per
blitzscale/FILE_CLAIMS.md. Paperwork lane closed at draft PR #30.

## Milestones

| Milestone | State | Commit | Notes |
| --- | --- | --- | --- |
| M0 contract freeze | DONE | daee444 | shared/research/member-platform.ts + contracts/MEMBER_PLATFORM_API.md |
| Wave 1 lifecycle/agreements/profile/assessment | DONE | (this commit) | agreements engine (9 defs incl. XR-MEM-012, append-only acceptances, separate-consent + status gates), profile (17 strict section schemas, sensitive split), assessment (initial-v1 definition, autosave, submit, 72h deadline, reminder sweep, server-side XR-MEM-012 consent gate), capabilities, overview, fixtures, notifier seam. 243/243 tests, tsc + build green. Adversarial auth review: 0 blockers, 4 minors all fixed. |
| Wave 2 Blueprint/plans/Review Week | DONE | (this commit) | transparent recommendation engine (pure, explained, dosing vocabulary structurally absent, free text never echoed), blueprint state machine + Samuel review/publish/supersede, Xenios 30/90 create/publish, one-per-month early change (structural via unique constraint), Review Week calendar math. Adversarial review: 1 blocker (unwired modules) + 5 minors, all fixed; umbrella wiring now has its own regression suite. |
| Wave 3 documents/signed access | TODO | | |
| Wave 4 tracker/private media | TODO | | |
| Wave 5 questions/Telegram/queues/SLA/Infinity | TODO | | |

## Integration facts for other lanes

- All routes register via `registerMemberPlatformApi(app, deps)` from
  `server/research/member-platform.ts`. Nobody edits `server/research/index.ts`;
  the coordinator wires the single call (agreed with Website 3, 2026-07-20).
- Payload contracts are FROZEN in contracts/MEMBER_PLATFORM_API.md; the UI can
  build against them now. Fixtures ship with Wave 1.
- Merged guards only (`requireMember`, `requireActiveMember`,
  `requireSupabaseAdmin`); the merged 12-status application machine is not
  redefined.
- Provider boundaries built keys-later: identity, private media storage,
  Telegram, Infinity, document renderer all get interface + disabled + test
  providers; no credential requests until sandbox handshake is the last node.
- products-data.ts values are treated as unverified_legacy per the cross-lane
  provenance finding (OCD-065 in the paperwork register); the member platform
  never asserts supplier facts.

## Blocked capabilities (expected, not blockers)

identity_verification, private_media, telegram_support, infinity_events,
document_rendering: all DONE_BEHIND_DISABLED_PROVIDER by design until
credentials/approvals; truthful member-safe disabled states.
