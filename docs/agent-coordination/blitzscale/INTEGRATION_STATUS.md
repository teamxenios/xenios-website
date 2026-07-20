# Integration status

Coordinator: PowerShell (Supreme Graph Controller). Integration branch
`integration/xenios-research-supreme-blitz` off origin/main **f7d6e8c**
(post-#25, post-#27). No feature branch merged into main yet (review gate).

## Lane heads under review (2026-07-20)

| PR | Lane | Head | Base merge-base | Tests | check | build | verdict |
|---|---|---|---|---|---|---|---|
| #32 | full frontend (71 routes) | 2e5e399 | 87150f4 (STALE — pre-#27) | 189/189 (18 files) incl. route-parity | clean | green | needs rebase; deep review running |
| #31 | commerce/distribution | 9ff7896 | main | 353/353 (22 files) | clean | green | runtime completeness TBD; do NOT mark ready |
| #30 | paperwork (159 docs) | a257179 | (pending review) | — | — | — | queued |
| #29 | product/Guide content | 800b160 | (pending review) | — | — | — | queued |

## Verified this pass

- PR #32 route-parity: `routes-parity.test.ts` asserts every
  `ALL_MANIFEST_ROUTES` entry is registered in section.tsx/adminx-section.tsx
  and passes → the 71-route claim is machine-verified, not just asserted.
- PR #32 fixtures: `lib/fixtures.ts` hard-guards fixtures off in production
  (`import.meta.env.PROD` ⇒ `fixturesAllowed()` false; `assertFixturesAllowed`
  throws; `devFixture` returns null), with `fixtures.test.ts` proving it →
  production fixtures cannot activate.
- PR #31 commerce: 353 tests green, typecheck clean, build green at 9ff7896.

## Blockers (see RELEASE_BLOCKERS.md)

1. PR #32 base is 87150f4 (pre-#27); its diff vs current main shows the #27
   coordination docs as deletions. MUST rebase onto f7d6e8c before merge or it
   reverts PR #27. Not a data loss (stale-base artifact).
2. PR #31 runtime completeness pending — do not mark ready.

## Next

Fold deep-review findings (workflow) into VISUAL_QA + RELEASE_BLOCKERS; freeze
each backend lane's route payloads as its first contract commit lands; then
integrate reviewed heads in the order in INTEGRATION_PLAN.md.
