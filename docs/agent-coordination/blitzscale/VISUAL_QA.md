# Visual QA

Tool: installed Chrome headless (no new dependency), driving the PR #32
production preview build (`scripts/preview-research.mjs`, throwaway gate creds,
fixtures OFF in prod). Desktop 1280×1600 + mobile 390×844. Safe fixture data
only; no real tokens/emails/member data. 26 shots captured for the 13 target
routes (scratch: .../screenshots/).

## What the screenshots prove (positive evidence)

- `/research` and every private route (member/*, partners/dashboard,
  admin/research) render the shared-password gate ("This area is under
  review"), NOT content — private routes are protected. Clean layout, no
  horizontal overflow at either width.
- `/research/reset-password` renders OUTSIDE the gate in minimal chrome:
  "Reset your password", email + Send reset link + Member Login + Support only
  — no catalog, no member navigation. Matches the PR #25 recovery design; the
  frontend preserved it.

## Limit (honest)

Populated authed pages (member dashboard, assessment, blueprint, tracker,
products, guides, partners dashboard, admin) are NOT visually captured here:
they require passing the shared gate AND a member/admin session + backend data,
which a frontend-only preview in isolation does not stand up (fixtures are
prod-gated off in the preview, and RequireMember needs a real session). This
is an integration-lane task: re-run the screenshot driver in the integration
environment once Website 2/3 backends serve member/me + data (or a dev
fixture-session is available). The driver is reusable (scratch shots.ps1).

## Independent review findings (deep review, heads as reviewed)

PR #32 @ 2e5e399 — 8/8 substantive frontend criteria PASS: 71 routes
machine-verified (routes-parity.test), no broken lazy imports, RequireMember
real auth, admin server-authorization, reset-password isolation, no
third-party tracking under /research (case/encoded/recovery-hash), production
fixture guard, honest capability states (no fabricated success). Repairs:

1. HIGH — no React error boundary anywhere in client/src. A failed lazy chunk
   (stale hash after redeploy, transient blip) throws during render and
   white-screens the WHOLE site (not just /research). Suspense does not catch
   import rejection; the *Boundary components only switch on a prop, they do
   not catch. Fix: wrap the app root (main.tsx) or ResearchRoutes/
   AdminResearchRoutes in a real error boundary with a recoverable fallback
   (ideally retry the import). Owner: Website (frontend lane).
2. LOW — ReferralsUpgrade InvitationCard hardcodes a purple gradient + ~8
   literal hex/rgba colors instead of the design tokens (theming drift).
   Owner: Website.
3. MERGE HYGIENE — PR #32 base is 87150f4 (pre-#27); rebase onto f7d6e8c
   before merge or a squash/replace strategy reverts PR #27's 14 coordination
   docs. A true three-way merge preserves them (PR #32 touches no docs).

PR #31 @ 9ff7896 — 8/9 commerce-correctness criteria PASS (provenance gate,
no unconfirmed-purchasable, order/subscription state machines, verified-payment
required, shipping once $12.95, FEFO/lot/recall, commission no-recruiting/
no-recursive-downline, flags false + no SQL). NOT READY: the runtime is not
wired — 19 new files, modifies zero existing files, touches neither
server/routes.ts nor server/research/index.ts, so the exported entrypoints are
a complete domain model + 349 tests but not a live route surface.
INTEGRITY NOTE: the commerce branch HEAD advanced during review (9ff7896 →
a1200e4 → newer; 9ff7896 no longer an ancestor) — Website 3 is actively
rewriting it. Findings anchor to 9ff7896 as instructed; re-review at the next
declared stable milestone.
