# Website 1 Acceleration Board

Updated: 2026-07-25 after Release Train 0 production deployment

- Production SHA: `68ee5d612df7d0452091ff0dfd2062d433943066`
- Production deployment: `dep-d9ilv150kf9s73bmj44g`
- Website 1 release branch: `feature/research-live-assessment-and-plan-intake`
- Release Train 0: deployed and verified at the signed-out boundary; externally gated
- Release train in progress: 1 — Products and diagnostics
- Next merge candidate: corrected Products/Diagnostics integration, then Care foundation, then Operations slices 3A/3B/3C

| ID | Release train | Blocker | Severity | Exact owner | Exact branch | Exact files | Correction | Test | Dependency | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A-01 | 0 | Production lacks Assessment v2 columns, constraints, RPC, and audit table | Blocker | Website 2 | integration branch | `supabase/research-assessment-v2.sql` | Apply only the reviewed migration after final head merge | `node scripts/assessment-v2-dryrun.mjs`; production catalog verification | Frozen Website 1 head | Completed in production | Preserve migration ledger and invariants |
| A-02 | 0 | XR-MEM-012 has no counsel-approved published immutable content | External blocker | Legal owner + Website 2 | N/A | `server/research/agreements.ts`; Render environment | Publish approved content/hash/effective date and set `RESEARCH_HEALTH_DATA_ENABLED=true` | Assessment routes stay 503 and create no rows until both gates pass | Counsel approval | Blocked by external input |
| A-03 | 0 | Reviewer page needs shared admin route/navigation wiring | High | Website 2 | integration branch | `client/src/research/adminx-section.tsx`; `client/src/research/lib/routes.ts`; admin navigation | Register `BlueprintReview` at an authorized admin route and add one restrained nav entry | Route-parity and admin authorization browser test | Frozen Website 1 head | Completed in production | Preserve the authorized route and restrained nav entry |
| A-04 | 0 | Final desktop/375/320 authenticated screenshots | High | Website 6 | deployed SHA `68ee5d6` | Browser matrix | Capture populated, conflict/error, review queue, and privacy withdrawal states | Keyboard, zoom, overflow, a11y | Authorized production member/admin sessions | Externally gated | Run after XR-MEM-012 approval with authorized personas; fabricate no account or record |
| C-01 | 2 | Care PR #46 migration lifecycle and visual drift | High | Website 5 | PR #46 branch | Care migration and UI files | Active-row partial uniqueness; loading/error/retry; Xenios tokens | Care focused tests and browser matrix | Assessment release | Assigned |
| P-01 | 1 | PR #47 lacks canonical persistence/private Storage/RLS and gateway wiring | Blocker | Website 3 + Website 2 integration | PR #47 branch | Product domain migration/provider + shared registrar | Reuse canonical lots/quality docs; wire authorized routes | RLS, Storage, bearer gateway, browser matrix | Assessment release | Assigned |
| O-01 | 3A–3C | PR #48 has 16 route gaps, parallel schema, and in-memory repositories | Blocker | Website 4 | PR #48/slices | Partner routes, operations repositories, migration | Slice and implement/capability-gate every enabled surface | Route parity, RLS, provider-disabled tests | Trains 0–2 | Assigned |

## Migration queue

| Domain | File | Idempotent | RLS/grants | Dry run | Apply owner | Verification |
|---|---|---|---|---|---|---|
| Assessment v2 | `supabase/research-assessment-v2.sql` | Yes; reapplied in PostgreSQL 16 | Forced RLS for health/audit tables; service role audit SELECT/INSERT only | 28/28 | Applied by Website 2 | Verified columns, three invariant indexes, forced RLS, zero browser grants, singular service-role RPC grant, zero duplicate/live workflow rows |

## Release sequence

1. Release corrected Products/Diagnostics production integration.
2. Release corrected Care foundation.
3. Release Operations slices 3A/3B/3C.
4. When approved XR-MEM-012 content and the explicit flag exist, verify the active-member Assessment and reviewer persistence flows.
5. Begin the separate five-wave trust/evidence branch only after the first Products/Diagnostics release is live.

## Completed release history

### Release Train 0 — Assessment and trainer-plan intake

- Approved head: `534e8ab6895f67fba1b3cb83ca7ad4017d09036a`
- Feature merge: PR #52, merge SHA `9dad933d37cbd84430487c77f6ea421e7ff2cf75`
- Shared wiring merge: PR #54, production SHA `68ee5d612df7d0452091ff0dfd2062d433943066`
- Production migration: `release_train_0_research_assessment_v2`, applied and verified with no live row-count changes
- Render: `dep-d9ilv150kf9s73bmj44g`, Live
- Smoke: `/api/health` 200; signed-out Assessment and Blueprint review APIs return 401; desktop/375/320 have no overflow; focus is visible; no new serious Render errors
- Remaining external gate: approved, published, effective, hash-valid XR-MEM-012 and an authorized member/admin session for persistence smoke
- Production status: `PARTIALLY LIVE`
