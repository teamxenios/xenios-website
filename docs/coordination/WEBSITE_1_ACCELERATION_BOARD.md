# Website 1 Acceleration Board

Updated: 2026-07-25

- Production SHA: `48cb57250c1ec54fe8714e59fa1071a9eb27f867`
- Production deployment: `dep-d9ikcs3eo5us73cuaob0`
- Website 1 branch: `feature/research-live-assessment-and-plan-intake`
- Release train in progress: 0 — Assessment and trainer-plan intake
- Next merge candidate after Assessment: PR #46, then PR #47, then PR #48 slices 3A/3B/3C

| ID | Release train | Blocker | Severity | Exact owner | Exact branch | Exact files | Correction | Test | Dependency | Status | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A-01 | 0 | Production lacks Assessment v2 columns, constraints, RPC, and audit table | Blocker | Website 2 | integration branch | `supabase/research-assessment-v2.sql` | Apply only the reviewed migration after final head merge | `node scripts/assessment-v2-dryrun.mjs`; production catalog verification | Frozen Website 1 head | Ready for Website 2 |
| A-02 | 0 | XR-MEM-012 has no counsel-approved published immutable content | External blocker | Legal owner + Website 2 | N/A | `server/research/agreements.ts`; Render environment | Publish approved content/hash/effective date and set `RESEARCH_HEALTH_DATA_ENABLED=true` | Assessment routes stay 503 and create no rows until both gates pass | Counsel approval | Blocked by external input |
| A-03 | 0 | Reviewer page needs shared admin route/navigation wiring | High | Website 2 | integration branch | `client/src/research/adminx-section.tsx`; `client/src/research/lib/routes.ts`; admin navigation | Register `BlueprintReview` at an authorized admin route and add one restrained nav entry | Route-parity and admin authorization browser test | Frozen Website 1 head | Handoff required |
| A-04 | 0 | Final desktop/375/320 authenticated screenshots | High | Website 6 | final candidate SHA | Browser matrix | Capture pending, populated, conflict/error, review queue, and privacy withdrawal states | Keyboard, zoom, overflow, a11y | Website 2 route wiring | Pending |
| C-01 | 2 | Care PR #46 migration lifecycle and visual drift | High | Website 5 | PR #46 branch | Care migration and UI files | Active-row partial uniqueness; loading/error/retry; Xenios tokens | Care focused tests and browser matrix | Assessment release | Assigned |
| P-01 | 1 | PR #47 lacks canonical persistence/private Storage/RLS and gateway wiring | Blocker | Website 3 + Website 2 integration | PR #47 branch | Product domain migration/provider + shared registrar | Reuse canonical lots/quality docs; wire authorized routes | RLS, Storage, bearer gateway, browser matrix | Assessment release | Assigned |
| O-01 | 3A–3C | PR #48 has 16 route gaps, parallel schema, and in-memory repositories | Blocker | Website 4 | PR #48/slices | Partner routes, operations repositories, migration | Slice and implement/capability-gate every enabled surface | Route parity, RLS, provider-disabled tests | Trains 0–2 | Assigned |

## Migration queue

| Domain | File | Idempotent | RLS/grants | Dry run | Apply owner | Verification |
|---|---|---|---|---|---|---|
| Assessment v2 | `supabase/research-assessment-v2.sql` | Yes; reapplied in PostgreSQL 16 | Forced RLS for health/audit tables; service role audit SELECT/INSERT only | 28/28 | Website 2 | Columns, constraints, partial unique indexes, RPC grant, zero duplicate Blueprints/active plan drafts |

## Release sequence

1. Freeze Website 1 Assessment head and hand it to Website 2.
2. Website 2 integrates the reviewer route, applies the reviewed migration, and deploys with health collection still fail-closed.
3. When approved XR-MEM-012 content and the explicit flag exist, verify the active-member Assessment flow and persistence.
4. Release corrected Care foundation, products/diagnostics, then operations slices.
5. Begin the separate five-wave trust/evidence branch only after Assessment and the first product release are live.
