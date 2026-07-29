# UX Sentinel latest report

Sentinel session: independent continuous UX and reliability reviewer (read-only, evidence-first).
Directive date: 2026-07-29. Report generated: 2026-07-29T23:25Z. Corrected: 2026-07-29T23:47Z.

## FOUNDER CLARIFICATION 2026-07-29T23:4xZ (supersedes the first reading of directive 1)

Samuel clarified: the four entry links (Apply for Membership, Member Login, Partner/Affiliate
Login, Admin Login) belong on the /research home page, NOT the main home page. Research is a
hidden destination: the main xeniostechnology.com marketing site must contain NO hyperlink to
/research at all. Consequences: SEN-0001 is RETRACTED (the main home page having no login links
is correct); new SEN-0007 (the main site currently links /research from header, footer, and full
site menu on every page) and SEN-0008 (/research itself exposes none of the four entries pre-gate
and only 2 of 4 post-gate) are the operative P1 findings. Do NOT implement the retracted
SEN-0001 recommendation.

## Baseline

| Field | Value |
| --- | --- |
| Current origin/main SHA | `517c2191cfaef2d76d7ceeea27648be311bae2d1` (PR #142 merge, 2026-07-29 17:29 -0500) |
| Production origin | `https://xeniostechnology.com` (HTTP 200) |
| Production health | `status: Xenios API is running`, `supabaseConfigured: true`, `adminConfigured: true`, `turnstileConfigured: false`, `commerceEnabled: false` |
| Production deployed SHA | Not exposed by the health endpoint. Uptime at 23:19Z was 2981s, a restart near 22:30Z, minutes after the 517c219 merge, consistent with an auto-deploy of current main. Render evidence needed for exact identity (release leader owns Render). |
| Checked-in audited baseline | `b729c8ee1a357e0af95fe50a05989b2f662f7270` per docs/coordination/CURRENT_PRODUCTION_STATE.md (2026-07-27, stale relative to main) |
| Release leader and lease | NO new-generation Fable 5 leader lease found. Newest activity anywhere on the remote is the 517c219 merge itself. docs/coordination/FILE_OWNERSHIP.json still reflects the prior Website 1-6 lanes (generated 2026-07-29T07:03Z). The Sentinel is not claiming or competing for the lease. |
| Sentinel branch | `sentinel/ux-reliability-continuous`, isolated worktree, artifacts only, no shared code touched |
| Test accounts | None available to the Sentinel. The Sentinel never handles passwords. Signed-in coverage requires the leader's approved fixture strategy or founder-run sessions. |

## Route and role inventory (first pass)

| Surface | Routes declared | Source |
| --- | --- | --- |
| Public marketing (top level) | 28 plus redirects | client/src/App.tsx |
| Research access lane | 9 | ACCESS_ROUTES manifest |
| Research member lane | 33 | MEMBER_ROUTES manifest |
| Research partner lane | 17 | PARTNER_ROUTES manifest |
| Research admin lane | 35 | ADMIN_ROUTES manifest |
| Care | 6 route groups plus root | client/src/App.tsx |
| Clinical | 0 (no route exists) | client/src/App.tsx |

Roles identified: visitor, applicant, member (active, pending activation), partner personas (owner, administrator, staff, seller, sub-affiliate, multi-org), supplier personas (Mitch: supplier admin, supplier operator, lab operator, operations admin), Samuel admin, care and clinical roles (not yet implemented).

## Founder-directive check results (production, unauthenticated, desktop 1280)

| Directive | Result |
| --- | --- |
| 1 (clarified). /research exposes the four entries; the main site never links /research | DOUBLE FAIL. Main site links /research from header nav, footer, and full site menu on every page (SEN-0007). /research pre-gate shows zero of the four entries; post-gate Gateway shows 2 of 4, missing Partner/Affiliate Login and Admin Login (SEN-0008). Main home page correctly has no login links (SEN-0001 retracted). |
| 2. /research has no Research Catalog CTA | PASS at current SHA. Production /research is a review password gate with no catalog control. Code level: Gateway.tsx renders only apply, sign-in, privacy, terms, support, with an explicit "No navigation, no catalog" design comment. Playwright assertion not yet added (needs leader file lease). |
| 3. Catalog access via authenticated member workspace | PARTIAL. MEMBER_ROUTES declares products, supplements, cart, checkout, orders. Signed-in verification pending test-account strategy. |
| 4. Care is a complete live production surface | FAIL against the 2026-07-29 directive. /care renders a deliberate, well-built "pending" page: all six modules NOT YET AVAILABLE, fail-closed, honest emergency boundary. Not a broken page; a globally disabled surface. Finding SEN-0003, routed to leader workstream 6. |
| 5. Clinical is a complete live production surface | FAIL. /clinical does not exist (404) and no clinical route is registered in the router. Finding SEN-0004, routed to leader workstream 6. |
| 6. All valid source rows represented in Product Control | PARTIAL PASS on main: 911 brand rows (Momentous 76, Pure Encapsulations 413, Life Extension 384, Superpower 38) in shared/research/catalog/brand-catalog.ts; peptide catalog merged (45 products: 15 workbook, 27 expansion, 3 regulatory hold); NutriDyn present in supplement-catalog.ts. The 70 peptide variant reconciliation and the production UI representation are next-loop checks. |
| 7. Offered products have pricing and a real transaction route | FAIL against the 2026-07-29 directive. All 911 rows resolve to DISPLAY_ONLY, derived from offer-readiness (no approved member amount, no supplier item code). buildProduct throws at module load if any row resolves to a purchase mode. Production health reports commerceEnabled false. Zero transaction routes exist. Finding SEN-0005, routed to leader workstream 5. |
| 11. Samuel signs in directly at /admin/research | PARTIAL PASS. The route is reachable and renders a working admin sign-in form ("The same account signs in to the /admin dashboard"). Actual credential verification stays with Samuel; the Sentinel never enters passwords. |

## Findings summary (details in UX_SENTINEL_FINDINGS.csv)

| ID | Sev | Summary |
| --- | --- | --- |
| SEN-0001 | retracted | Misfiled first reading of directive 1. The main home page having no login links is correct. Superseded by SEN-0007 and SEN-0008. |
| SEN-0002 | P1 | /research/apply and /research/partners sit behind the review password gate while /research/sign-in is open; the gate boundary is inconsistent and the application journey is blocked at step 1. Resolve together with SEN-0008 (where the four entries sit relative to the gate is one design decision). |
| SEN-0007 | P1 | The main marketing site discloses the hidden /research area on every page: header nav, footer, and full-site-menu links. Founder directive says zero links to /research on the main site. |
| SEN-0008 | P1 | /research itself exposes none of the four required entries pre-gate, and only Apply plus Member sign-in (2 of 4) post-gate; Partner/Affiliate Login and Admin Login are missing entirely. |
| SEN-0003 | P1 (directive gap) | Care globally disabled; all six modules NOT YET AVAILABLE. Deliberate and well-executed, but fails the 2026-07-29 directive that Care be a live surface. |
| SEN-0004 | P1 (directive gap) | No clinical surface exists at all: no route, no page, 404. |
| SEN-0005 | P1 (directive gap) | Commerce is off end to end: commerceEnabled false, 911/911 rows DISPLAY_ONLY, purchase mode structurally blocked by a build-time guard, zero transaction routes. |
| SEN-0006 | P2 | turnstileConfigured false in production: public forms (waitlist, application when reachable, sign-in) run without the configured bot protection. |

## Notes for the release leader

1. No leader lease is claimed as of 23:25Z. When the orchestrator session claims it, this Sentinel will read the lease record and route findings to the ownership matrix it publishes.
2. SEN-0007 is the highest-leverage quick win: remove the Research entries from the shared header, footer, and full site menu (label and href deletions in the shared layout). SEN-0008 needs one deliberate design decision: where the four entries sit relative to the review gate on /research, then add the missing Partner/Affiliate and Admin entries.
3. SEN-0003/0004/0005 are the deliberate baseline the 2026-07-29 founder directive orders changed. Provenance to preserve while changing them: the offer-readiness guard encodes supplier documentation gaps (873 rows NEEDS_SUPPLIER_DOCUMENTATION) and prior counsel gates. Per the directive, missing dependencies become narrow per-row controls plus founder decision records, not global shutdown.
4. The Sentinel needs from the leader: the approved test-account and fixture strategy, Render deployment identity access or a relayed SHA, and a file lease if the leader wants the Sentinel to add the /research catalog-CTA Playwright assertion.

## Continuous loop status

Next sweep (already queued): mobile viewports (320/375/768) for home and gateway, remaining public marketing routes, 404 and redirect behavior, accessibility first pass on home and sign-in, /admin root behavior, security negative probes (signed-out API rejections), peptide 70-variant reconciliation, and production console/network error sweep per route.
