# Frontend / backend integration matrix

PR #32 frontend route → required backend API → owning lane → status →
disabled-state → integration test. LIVE = endpoint in merged main; PENDING =
backend lane must build to the frozen contract (API_CONTRACTS.md).

| Frontend route | Backend API | Owner | API status | Disabled-state | Integration test |
|---|---|---|---|---|---|
| /research (gateway) | GET /api/research/me, POST /access | main | LIVE | gate 503 fail-closed | route smoke |
| /research/apply | POST /api/research/applications | main | LIVE | 503 unconfigured | apply e2e |
| /research/application-status | GET /applications/status | main | LIVE | 401 no token | status token test |
| /research/sign-in | Supabase auth + GET /member/me | main | LIVE | 401 | signin test |
| /research/reset-password | POST /member/forgot-password | main | LIVE (wall-allowlisted) | generic 200 | recovery regression |
| /research/member | GET /member/me | main | LIVE | 403 pending/recovery | member-state matrix |
| /research/member/assessment | GET /assessment, POST /responses | Website 2 (G3) | PENDING | capability-disabled | contract test on publish |
| /research/member/blueprint | GET /blueprint, /plans/* | Website 2 (G4) | PENDING | capability-disabled | " |
| /research/member/tracker | GET/POST /tracker, /media | Website 2 (G5) | PENDING | capability-disabled (private storage off) | " |
| /research/member/products | GET /api/research/(member/)catalog, /products | Website 3 (G6) | catalog LIVE (active); products PENDING | requireActiveMember 403 | member-state matrix |
| /research/member/guides | GET /guides, /guides/:slug | Website 3 (G6) | PENDING | capability-disabled | " |
| /research/partners/dashboard | GET /partners, /commissions | Website 3 (G8) | PENDING (referral ledger in main) | payouts flag false | " |
| /admin/research | /api/admin/research/* | main + Website 2 (G10) | LIVE (queue/outbox/system-status) | requireSupabaseAdmin 401/403 | admin-state matrix |

## Contract-compatibility gate

As each PENDING backend lane pushes its first contract commit, the coordinator
pulls it into the integration worktree and verifies the frontend's expected
request/response shape matches (freeze in API_CONTRACTS.md, then a small
integration test). Frontend must render the disabled/pending state (never a
fabricated success) until its backend API is LIVE — verified by PR #32's
capability-honest states + fixture-off production guard.
