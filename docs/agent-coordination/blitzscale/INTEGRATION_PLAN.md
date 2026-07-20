# Integration plan

Integration branch (created once reviewed lane heads exist):
`integration/xenios-research-supreme-blitz`, off origin/main @ 87150f4.

## Merge order (semantic, never blanket ours/theirs)

1. shared additive contracts (shared/research/*) — coordinator-frozen.
2. Website 2 member-platform backend (application/agreements/profile/assessment/
   blueprint/plans/documents/tracker/questions/telegram/member-admin).
3. Website 3 commerce/content/distribution backend (products/guides/inventory/
   commerce/fulfillment/referrals/affiliates/commissions) + content seeds.
4. paperwork + content docs.
5. Website frontend (client/src/research/**).
6. coordination documents.

After each lane integration: run targeted tests → commit → record lane head →
update STATUS.md. Shared-file conflicts (server/index.ts route registration,
shared type barrels, App.tsx, section/layout/core) are resolved by the
coordinator per the single-owner rule; a lane requests a change via handoff.

## Continuous review (do not wait for the end)

Each pushed milestone is fetched, its base checked (>= 87150f4), changed paths
checked against file-claims, targeted tests run, handoff read, disabled-provider
behavior verified, and a founder-decision test confirmed — then ACCEPT or an
exact repair prompt is returned. Contract incompatibilities surface early.

## Non-negotiable

Do not rewrite or weaken PR #25's merged auth/recovery/outbox/member-access.
All production flags false through code merge. No SQL run by any agent (Samuel
runs migrations from the drafted, ledgered files). No secrets in code/PRs/logs.
