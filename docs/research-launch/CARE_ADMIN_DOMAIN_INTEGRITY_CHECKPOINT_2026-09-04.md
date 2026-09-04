# Care admin domain integrity — checkpoint (2026-09-04)

Task `CARE-ADMIN-DOMAIN-INTEGRITY-20260904` (P0). Session
`claude-care-admin-domain-integrity-20260904` (Claude Fable 5.1), branch
`claude/care-admin-domain-integrity-20260904`, base
`2d0d7477321ddbbd92dba31a79e2f42bb25d888b` (records head above the live runtime
`db5a2d447114c1e8a14185a9865ded50ee3f1ac6`). Founder directive of 2026-09-04:
continue coding locally; GitHub Actions is externally blocked by account billing and
is recorded as such, not as a code failure. Nothing here was deployed, merged,
migrated, or changed in any environment.

## 1. Problem closed

Care access requests are persisted in `loi_submissions`, so until now a Care request:

1. appeared in the dedicated Care queue **and** in the generic Early Interest / LOI
   admin list, CSV export and analytics; and
2. could receive a legacy LOI status (`Reviewing`, `Followed up`, `Signed`) through
   the generic `PATCH /api/admin/loi/:id/status`, which then surfaced as a foreign
   status inside the Care queue.

Two competing administrative workflows over one record. The dedicated Care queue is
now the sole operational projection and the sole status writer for Care requests.

## 2. Design: a Care-domain boundary, not an edit to the protected core

`server/routes.ts` and `server/supabase-store.ts` are protected core-site paths
(`docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`, `protectedPaths.globs`; a change
is a gate violation). The fix therefore composes from the Care write zone:

| Piece | File | What it does |
| --- | --- | --- |
| One canonical classifier | `server/care/manual-access-classifier.ts` | `isCareManualAccessOperationsRow`, the four strong markers, the parser. Leaf module: type-only store import plus shared Care constants. Consumed by the projection (`manual-access-admin.ts`, which re-exports it), the public writer (`manual-access.ts`, which now stamps the same constants) and the boundary. The old copies were deleted. |
| Boundary | `server/care/loi-boundary.ts` | Prefix middleware (`app.use`, never a second route) on `/api/admin/loi`, `/api/admin/export`, `/api/admin/analytics`, behind the same canonical `requireSupabaseAdmin`. GET/HEAD list → generic rows only. `PATCH …/:id/status` → 404 `{success:false,message:"Not found"}` for a Care row **before any write**, otherwise defers to the generic writer; fails closed (500, no write) if it cannot classify. `?type=loi` export → generic rows with joined notes, byte-identical CSV. Analytics → Care rows subtracted from `loiTotal` and daily `loi`. |
| Seam | `server/care/index.ts` | One import block, one option (`loiBoundaryDependencies`), one registration call. Mounted by `server/index.ts` before `registerRoutes`, so it runs first. Seam hash re-pinned with a chained note (`7f48fd74… → 6aaa6586…`). |

No migration. No hardcoded ids. No client change (the generic Admin page is a thin
projection of the server responses; the Care queue keeps its unknown-status fallback
as a safety net).

## 3. Proofs (all local, on this worktree)

| Proof | Test |
| --- | --- |
| Generic LOI still listed; strongly marked and malformed Care rows excluded; both still in the Care queue | `loi-boundary.test.ts`, `manual-access-admin.test.ts` |
| CSV export excludes Care rows and their notes; byte-identical to the real generic export of the generic rows alone (headers included) | `loi-boundary-parity.test.ts` (real `routes.ts` behind the real boundary and the real guard) |
| Analytics exclude Care rows from total and daily counts; never negative; waitlist/bookings untouched | `loi-boundary.test.ts` |
| Generic PATCH refuses a Care row with zero mutation, generic handler never reached; generic row still written through `routes.ts`; unknown id keeps generic semantics | `loi-boundary.test.ts`, `loi-boundary-parity.test.ts` |
| Refusal survives `/STATUS` casing and every uuid spelling Postgres normalises (adversarial-review P1s, fixed) | both files |
| HEAD answered by the boundary (content length reflects generic rows only) | `loi-boundary.test.ts` |
| Unauthenticated and non-admin callers refused by the canonical guard before any read | `loi-boundary-parity.test.ts` (401 / 403) |
| Dedicated Care PATCH still performs an authorized operational transition; unrelated LOI cannot be modified through the Care API | `manual-access-admin.test.ts` |
| Public Care submission contract unchanged | `manual-access.test.ts` |
| No raw JSON / IP / UTM / referrer / clinical sentinels in Care admin responses; no PII in boundary logs | `manual-access-admin.test.ts`, `clinical-route-coverage.test.ts`, `loi-boundary.test.ts` |
| Removing the classifier, the registration, the mount order, or adding a route registration breaks a test | `loi-boundary-wiring.test.ts` |
| Protected files untouched; seam hash verified; route census unchanged (405 call sites / 414 routes) | `core-site-protection.test.ts`, `release-control-plane.test.ts` |

Adversarial review (three independent read-only lenses over the uncommitted diff):
correctness not refuted (P3 notes: extra table read per generic PATCH, benign
analytics snapshot race, optional guard hardening — the hardening was applied);
drift/protection not refuted (lease path set corrected, records updated);
security refuted on two P1 bypasses (case-insensitive routing, uuid normalisation),
both fixed with regression tests in the same slice.

## 4. Gates

| Gate | Result |
| --- | --- |
| Focused (classifier, boundary, wiring, parity, manual-access, admin, admin-wiring, clinical coverage, core-site) | 9 files / 149 tests PASS |
| Release control plane (records + census) | 51 passed / 1 skipped; census 405/414 unchanged |
| TypeScript (`npm run check`) | 0 errors |
| Production build (`node script/build.mjs`, Node 20.19.0) | PASS |
| Full suite | see §5 |
| Browser QA | not applicable to this slice: no client file changed; the generic Admin page and the Care queue render the same components over a smaller server list |

## 5. Full suite and a production finding

The full suite is red in exactly two pre-existing files that this slice does not
touch: `server/research/early-access/cart/cart-shelf-agreement.test.ts` and
`server/research/early-access/cart/supplier-authority.test.ts` ("the shelf is
selling nothing, so these tests prove nothing"). They fail identically on the
untouched base worktree. Cause: `server/research/early-access/release/founder-supply-seed.ts`
pins `RAW_PEPTIDES_EXPIRES_AT = 2026-09-03T23:30:00Z` (30 days from the founder's
2026-08-04 supply confirmation); the shelf tests load the real catalogue at the wall
clock and the seeded confirmations have lapsed. The last green full suite ran minutes
before that instant.

The same seed was run once against production by
`scripts/initialize-supplier-confirmations.ts`, and
`server/research/early-access/ops/supplier-availability.ts` documents that lapsed
confirmations make every unit fail closed to held. **Inference: since
2026-09-03T23:30Z the Research Early Access storefront offers 0 purchasable units.**
Not directly observed (the catalog needs an authenticated read). Remediation is a new
supplier confirmation, a supplier fact only the founder can state, written to
production data; neither is authorized; nothing was changed. Recorded as
`EARLY_ACCESS_SUPPLIER_CONFIRMATIONS_EXPIRED_20260903` in
`CURRENT_PRODUCTION_STATE.json`. Two further files (`pgcrypto-qualification`,
`preview-harness.guard`) timed out under concurrent load and pass in isolation.

## 6. Records

Task re-leased to the actual path set; `CARE_ROWS_VISIBLE_IN_GENERIC_LOI_LIST` kept
open for production truth with a `candidateFix` pointer; packet follow-up bullet
updated; seam re-pinned; exact-SHA handoff written by the continuity CLI at commit.

## 7. Next

Phase 2 per the founder's sequencing: the full-website UX foundation
(`FULL-UX-FOUNDATION-AND-REFERRAL-V1-20260904`) beginning with the journey matrix
and route inventory, then canonical sign-in with `returnTo`, account-home next
action, and referral V1 over the existing partner authority (which also carries the
Strategic Partner Launch V1 attribution core). Not deployed; PR #306 stays open.
