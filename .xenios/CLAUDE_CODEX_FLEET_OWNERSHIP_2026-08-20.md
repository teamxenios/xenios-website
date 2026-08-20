# Claude + Codex Fleet Ownership — 2026-08-20 (authoritative)

Lead / sole integration, release, production owner: **claude-fable-desktop**
(Session 1), worktree `C:/xenios-wt/general-platform`, branch
`xenios/launch-integration-20260819`.

- **CODEX_RESUME_SHA: `7b16a2e06dfc227f5bc748b14480c9d072e566de`**
  Full suite GREEN on this exact SHA: 659 test files, 9,758 tests, 0 failures.
- PRODUCTION SHA: `a66434d980c909303d3595382e5df77342fbc127` (LIVE, Release A).
- ROLLBACK SHA: `458e7284c12cfbd95bd91371afb88cb8a6201454` (flags off FIRST).

## Activity finding that determined these assignments

Every Claude lane worktree was inspected on 2026-08-20. **No Claude writer is
active.** All nine lane worktrees still hold exactly the dirty work they held at
the 2026-08-19 pause (last file writes 11:45–16:55 on 2026-08-19), no lane
branch has moved, and no worker has pushed since the fleet resume was dispatched
13.5 hours ago. The Claude lanes are therefore **reserved-but-dormant**: their
uncommitted work is preserved and untouched, but they are not producing.

Consequence, per the founder's rule ("assign Codex only to unowned lanes; if a
Claude lane already owns the code, that Codex session becomes QA/review"):
ownership here is decided by **where uncommitted Claude work physically sits**,
not by the dormant reservation. Six Codex lanes are genuine writers; two become
independent QA because a paused worktree holds uncommitted implementation in
exactly their files.

## Codex fleet

| # | Lane | Role | Branch (from resume SHA) | Worktree |
|---|------|------|--------------------------|----------|
| 1 | EA one-code gate / access | **WRITER** | `codex/ea-one-code-gate-20260820` | `C:/xenios-wt/codex1-ea-gate` |
| 2 | 426-row retail catalog | **WRITER** | `codex/retail-catalog-426-20260820` | `C:/xenios-wt/codex2-retail-catalog` |
| 3 | Order + qty100 + affiliate | **QA / validator** | `codex/order-affiliate-qa-20260820` | `C:/xenios-wt/codex3-order-qa` |
| 4 | Customer + admin order emails | **WRITER** | `codex/order-emails-20260820` | `C:/xenios-wt/codex4-order-emails` |
| 5 | Quote / payment / canonical order | **QA / validator** | `codex/quote-payment-qa-20260820` | `C:/xenios-wt/codex5-payment-qa` |
| 6 | Admin + fulfillment + tracking | **WRITER** (LIVE EA dispatch lane only) | `codex/admin-fulfillment-ops-20260820` | `C:/xenios-wt/codex6-admin-ops` |
| 7 | Composed E2E + mobile + security | **WRITER** (independent QA) | `codex/e2e-security-20260820` | `C:/xenios-wt/codex7-e2e-security` |
| 8 | Full-vision + release auditor | **WRITER** (advisory artifacts) | `codex/full-vision-auditor-20260820` | `C:/xenios-wt/codex8-vision-auditor` |

Why 3 and 5 are QA, not writers:

- **Codex 3**: `C:/xenios-wt/assisted-order-flow` holds 717 uncommitted lines in
  `client/src/research/assisted-order/{AssistedOrderPage,wizard-state,api,AssistedOrderConfirmationPage}`,
  and `C:/tmp/xenios-lane4-affiliate` holds five uncommitted affiliate modules
  plus three SQL candidates. A second writer there produces conflicts the lead
  would have to discard.
- **Codex 5**: `C:/xenios-wt/canonical-order` holds the uncommitted
  `server/research/orders/**` + `shared/research/orders/**` scaffold.

Codex 6 is a writer *only* over the LIVE EA dispatch lane; the undeployed
`server/research/fulfillment/**` engine is dirty in `C:/xenios-wt/lane-fulfillment-tracking`
and is forbidden to it.

## Lead-retained work (not delegated to either fleet)

- **Quantity 100 across the stack** — `shared/research/early-access-quantity.ts`
  (50→100), the assisted-order authority default
  (`server/research/assisted-order/production-catalog.ts`, currently `null` =
  unbounded), and an M66-successor migration candidate re-pinning the durable
  cart band to 1..100. Taken by the lead because it is small, exactly mapped,
  spans two fleets' lanes, and is founder-P0. Codex 3 writes the conformance
  tests that must agree with it.
- The narrow EA wall exemption (already verified present and pinned by 67 tests).
- Every production mutation: env, flags, pricing, migrations, deploys.

## Paused-Claude-lane protection (both fleets)

These worktrees hold uncommitted work that must never be discarded or duplicated:

`C:/xenios-wt/assisted-order-flow` (wizard), `C:/tmp/xenios-lane4-affiliate`
(affiliate attribution), `C:/xenios-wt/canonical-order` (orders scaffold),
`C:/xenios-wt/lane-fulfillment-tracking` (fulfillment engine),
`C:/xenios-wt/storefront` (storefront modules),
`C:/xenios-wt/lane5-partner-portal` (partner portal UI).

HAZARD: `C:/xenios-wt/s9-conversion-qa` has a lead-seam shim in `server/index.ts`
**and two deleted production migration files** in its working tree. Nothing from
that worktree may be committed without lead review; the deletions must never
reach a branch.

## Role-swap rule

First mover writes. If a dormant Claude lane wakes and its Codex counterpart has
already pushed proven work, the Claude session becomes the reviewer for that lane
(and vice versa). The lead adjudicates; no path ever has two writers.

## Phase order (both fleets)

PHASE 0 Early Access complete → PHASE 1 Buy Now on a readiness-verified subset →
PHASE 2 full affiliate platform → PHASE 3 organizations, supplier/lab, admin
convergence, customer history, notifications → PHASE 4 Care → PHASE 5 AI
companion, analytics, integrations, observability, backup/DR.

Every phase preserves the working previous phase:
EXPAND → MIGRATE → DARK DEPLOY (off) → SMOKE LIVE → ENABLE → SMOKE NEW → RECORD ROLLBACK.
