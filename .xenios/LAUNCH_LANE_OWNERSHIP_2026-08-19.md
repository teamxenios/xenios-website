# Launch fleet ownership registry — 2026-08-19 (LEAD: claude-fable-desktop)

INTEGRATION BASE every session MUST branch from:
`xenios/launch-integration-20260819` @ `026141ec53a6686313cba795aec30eb7b9ab76b7` (pushed).
An older base silently re-creates work already merged. Verify with
`git merge-base --is-ancestor 026141ec... HEAD` before your first commit.

ONE integrator: claude-fable-desktop merges everything; ONLY the lead edits
`server/index.ts`, `server/research/index.ts`, `server/research/early-access/register.ts`,
`client/src/App.tsx`, `client/src/research/section.tsx`, `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`,
`docs/coordination/**`, `supabase/migrations/**`, `.xenios/**` (state files;
sessions append their own handoffs/messages only). New SQL goes under
`supabase/candidates/` with precheck/postcheck; production stays founder-gated.

## ALREADY MERGED at 026141e — do not rebuild

- Phase Zero wiring RC (legal port, pricing viewer) + regression suites.
- Quote engine FOUNDATION: `server/research/assisted-order/quote/**` +
  `shared/research/assisted-order/quote-contract.ts` (issue/accept/decline/
  supersede/withdraw, unmounted).
- Launch matrix + founder price book artifacts (`docs/research-launch/`).
- Affiliate spine (Gen 2): capture doors (`/api/r/:code`, `/api/referral/capture`),
  signed `xr_aff` cookie, program config seed, assisted-order attribution,
  accrual bridge, portal mount (flag-gated), `/research?ref=` client hook.
- Card-level CTA + six-action vocabulary (`shared/research/launch/customer-action.ts`),
  Buy Now handoff wiring, returnTo product-detail pattern, direct-commerce
  selection seam (flag-gated).
- EA cart attribution port + settlement referrals + commission-hold path +
  cart order history (all fail-closed until founder SQL/env).
- EA fulfillment admin UI (`/admin/research/early-access/fulfillment`),
  cockpit tiles, tracking notifier, settled-queue + exceptions routes.

## Session ownership (non-overlapping; collisions resolved here)

| # | Session | Owns | COLLISION NOTES |
|---|---|---|---|
| 1 | LEAD (claude-fable-desktop) | seams above, merges, release, gates, RC SHA | — |
| 2 | Public storefront | `client/src/research/pages/**` EXCEPT `pages/adminx/**` and `pages/partners/**`; gateway/access-hub UI; NOT master-offerings components | adminx = Session 1-merged Lane E; partners pages = Session 5; catalog cards/detail = merged Lane A — EXTEND, don't recreate; section.tsx route additions via handoff to lead |
| 3 | Assisted-order customer flow | `client/src/research/assisted-order/**`; assisted-order focused client tests | server assisted-order files: quote/** free to EXTEND; service/http/ports carry Lane B attribution — additive only, coordinate via handoff |
| 4 | Affiliate attribution core | `server/research/partners/**` (EXTEND the merged spine), partners negative tests | Capture/cookie/accrual/portal EXIST at 026141e — remaining scope: EA customer-bind grant-writer seam handoff, deeper negative controls, attribution polish. Do NOT re-implement |
| 5 | Affiliate portal UI | `client/src/research/pages/partners/**`, `client/src/research/adapters/partner.ts` | Server portal routes exist + mount flag-gated; UI reads only |
| 6 | Request→quote→payment ops | `server/research/assisted-order/quote/**` (EXTEND the merged foundation), quote admin/customer UI under `client/src/research/assisted-order/quote/**`, payment-state projections | Quote engine exists — extend with HTTP descriptors + UI + status-machine evidence wiring; EA payment lane files belong to merged Lane C — read-only |
| 7 | Canonical order + history | `server/research/early-access/orders/**` (EXTEND merged cart history), customer order UI `client/src/research/pages/member/**` | member-order-history.ts already extended by Lane C — build on 026141e |
| 8 | Fulfillment + tracking | `server/research/fulfillment/**`, `shared/research/fulfillment/**`, supplier UI | Engine's migrations 42/43 are NOT deployed — code may advance; the LIVE launch fulfillment path is the EA dispatch lane (merged Lane E) — do not divert it |
| 9 | Mobile E2E | `e2e/**`, browser-test infra; isolated client fixes in files not owned above | Seam defects → handoff table to lead |
| 10 | Security/release QA | read-only + isolated test files under `server/**/*.security.test.ts` naming | Coordinate heavyweight runs with lead; report in PASS/FAIL/KNOWN/ENV/BLOCKED classes |

## Handoff protocol

Exact-SHA handoffs into `.xenios/handoffs/`; message the lead via
`.xenios/messages/`. The lead cherry-picks/merges proven P0 commits
continuously — do not wait for your whole lane to finish before handing off a
coherent slice. Branch naming: `lane/s<N>-<short-name>`.
