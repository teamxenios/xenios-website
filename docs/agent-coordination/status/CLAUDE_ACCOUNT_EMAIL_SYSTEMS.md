# CLAUDE_ACCOUNT_EMAIL_SYSTEMS status

- Timestamp: 2026-07-19 (rebased)
- Role: account, authentication, email, membership-state, access-control,
  notification, and operational reliability for xenios research.
- Branch: claude/research-account-email-systems (worktree
  xenios-research-account-email-systems), REBASED onto origin/main 468466f
  (PR #23 + #24 merged). Draft PR #25 targets main directly; NOT stacked.
- Claim: ACCOUNT-EMAIL-SYSTEMS-001 (claims/active/).

## Rebase onto 468466f (2026-07-19)

Conflicts resolved exactly as the canon required:

- client/src/research/section.tsx: main's PR #23 gateway route table taken
  wholesale (minimal gateway, RequireMember member website, activation route,
  legacy redirects); PR #25 adds ONLY the /research/reset-password route in
  the pre-member flows (recovery must work without member auth). SignIn kept
  main's redirect flow (active -> /research/member, else -> /research/activate)
  plus the forgot-password link.
- server/research/members.ts: main's member-auth architecture preserved
  (guards live in member-auth.ts, re-exported); PR #25's claim handler
  (purpose-scoped token, approval expiry, orphan cleanup, stranded heal,
  concurrent tolerance, billing_state on active-claim, claim-success email)
  and the forgot-password route integrated on top.
- Guard unification (NO duplicate requireActiveMember): member-auth.ts now
  owns the single requireActiveMember with the PR #25 status matrix
  (active -> pass; pending_activation -> 403 activation_required; past_due ->
  403 billing_past_due; paused/cancelled/closed denied; billing_state
  enforced when RESEARCH_MEMBERSHIP_BILLING_ENABLED=true, missing state =
  verified-legacy). Main's catalog/orders keep using it; guards.ts re-exports
  it and registers /api/research/member/catalog. requireMember in
  member-auth.ts gained the auth_user_id-first resolution (email fallback).
- Preserved from main: the reward-promotion tick in server/index.ts, the
  bearer-bypass wall, all of PR #23's access-architecture tests (passing
  against the unified guard).

Validation after rebase: typecheck clean, build green, and a 4-agent targeted
flow audit re-traced the 15 lifecycle flows on the rebased tree: 12 pass;
3 findings, dispositioned:

1. FIXED — checkout was latently dead since the gateway merge: the client's
   submitOrder sent no Authorization header while /api/research/orders now
   requires an active member. Latent only because both commerce flags are
   off. submitOrder now attaches the member's Supabase JWT (mirroring
   loadCatalog); ResetPassword's request mode does the same so a
   recovery-session visitor without the review cookie still reaches the
   endpoint.
2. DOCUMENTED + PINNED BY TEST — the merged wall's bearer-presence bypass on
   /member/* means "Authorization: Bearer junk" reaches
   /member/forgot-password (and /member/claim) without the review cookie.
   Both endpoints self-defend (signed token / generic responses + rate
   limits, no data exposure). A new composed-stack test mounts the real wall
   with the member routes and pins all three paths (no credential -> 401;
   cookie -> generic; junk bearer -> generic, no recovery email for unknown
   addresses).
3. KNOWN GAP (inherited, Codex handoff) — member sign-out clears the Supabase
   session but nothing calls POST /api/research/logout, so the 12h xr_access
   review cookie survives on a shared machine; the client `logout` context
   function has zero callers. Listed in the Codex UI handoff.

Final: 118 tests passing across 8 files.

## Ground truth at join (2026-07-19, audited against origin/main 8b94410)

- Tests on main: 75 passing across 7 files; build green; one pre-existing
  typecheck error (server/storage.ts:48 implicit-any tx) which blocked
  `npm run check` — fixed in this branch.
- PR #23 (research-fraud-integration @ f0c4559, CLAUDE_PRIMARY) is OPEN and
  carries the gateway architecture: minimal /research gateway, requireMember
  on catalog/orders, member-JWT bypass of the shared password. This branch
  deliberately does NOT duplicate any of it and avoids its conflict surface
  (no file named member-auth.ts; no edits to the wall middleware or the
  catalog/orders handlers in server/research/index.ts).

## Defects found by the join audit and FIXED in this branch

1. Admin alerts never reached the configured admins:
   sendInternalApplicationAlert hardcoded team@xeniostechnology.com and
   ignored the outbox job's recipient; N configured admins produced N
   duplicate emails to team@. Now delivers to job.recipient (default
   samuel@xeniostechnology.com).
2. Resend SDK failures were recorded as sent: the SDK reports API rejections
   via the error field WITHOUT throwing; send() now inspects it, and
   provider_message_id is captured on success.
3. Account claim could permanently brick an email address: createUser then
   member-insert with no rollback. Now: compensating deleteUser on insert
   failure, self-healing retry when the auth user exists without a member row
   (password reset via the proven claim token + member-row completion), and
   concurrent-duplicate tolerance.
4. Tokens were single-purpose-less: one 90-day token served status, resubmit,
   AND account claim. Now v2 purpose-scoped tokens (status 90d /
   account_claim 14d) with domain-separated MACs (also separated from the
   gate-cookie MAC, closing the shared-key protocol-confusion hazard).
   Legacy tokens are honored until they expire (no minting after this).
5. No member password reset existed. Now: POST
   /api/research/member/forgot-password (generic response, rate-limited,
   silent per-email cooldown) + /research/reset-password page.
6. Resubmissions were silent: no applicant confirmation, no admin alert.
   Both now enqueue (applicant_resubmitted + admin_resubmitted).
7. Outbox black holes: rows stranded in `processing` after a crash were
   unrecoverable, and failed_permanent rows could never be resent. Now:
   stale-processing reclaim (15 min), admin list endpoint
   (GET /api/admin/research/outbox, metadata only, no payloads), per-message
   requeue (POST /api/admin/research/outbox/:id/retry, audited via an
   attempts row), permanent failures alert the admins through the outbox
   (loop-guarded), and a test-email endpoint restricted to configured admin
   addresses (POST /api/admin/research/test-email).
8. Member resolution was email-keyed. requireMember now resolves
   auth_user_id first (email fallback), and claim-time approval expiry is
   enforced.
9. No active-member guard existed anywhere. New server/research/guards.ts:
   requireActiveMember (pending_activation -> activation_required; past_due ->
   billing recovery; paused/cancelled/closed -> denied; billing_state
   consulted when RESEARCH_MEMBERSHIP_BILLING_ENABLED=true) + the first
   member-scoped catalog endpoint GET /api/research/member/catalog.
10. Membership/billing model: shared MEMBER_STATUSES and
    MEMBER_BILLING_STATES types + drafted migration
    supabase/research-member-billing.sql (PENDING, NOT run; code tolerates
    absence). Canonical sender: RESEARCH_EMAIL_FROM /
    RESEARCH_EMAIL_REPLY_TO env (default research@xeniostechnology.com only
    when no FROM_EMAIL is configured); REPLY_TO_EMAIL now actually honored.

## Tests

101 passing across 7 files (was 75). New coverage: purpose-scoped claim
(status token cannot claim; legacy window; expired approval), orphan cleanup +
stranded-claim healing + concurrent duplicate, forgot-password (enumeration
safety, cooldown), requireActiveMember matrix (401/403/200, billing_state),
auth_user_id resolution, outbox stale reclaim, permanent-failure admin alert
(with loop guard), provider-id capture, per-recipient admin alerts, token
purpose minting, admin outbox list/requeue/test-email.

## Flags: unchanged

RESEARCH_PUBLIC, RESEARCH_INDEXABLE, RESEARCH_REFERRALS_ENABLED,
RESEARCH_MEMBERSHIP_BILLING_ENABLED all remain false. No production flag was
touched. No SQL was run.

## Adversarial review round (2026-07-19, pre-PR)

A 4-lens multi-agent review (correctness / security / PR #23 compatibility /
test fidelity) produced 25 findings; 16 survived adversarial verification and
were fixed or documented before the PR: billing_state is now written on
activation and active-claim (schema-tolerant, so pre-migration deploys stay
safe), legacy queued approval rows mint claim-capable tokens (template-keyed
fallback), resubmission and failure-alert event keys are time-bucketed,
the requeue endpoint refuses fresh processing rows (duplicate-send race),
claim-token TTL tracks RESEARCH_APPROVAL_EXPIRY_DAYS (NaN-guarded),
forgot-password sends fire-and-forget (timing enumeration), activation retry
is idempotent after a partial failure. Deploy notes surfaced by the review:

- The gate-cookie MAC domain label INVALIDATES all live xr_access sessions at
  deploy: reviewers re-enter the shared password once. Intended.
- Pre-#23, the emailed password-recovery link lands behind the shared-password
  page for a visitor without a live xr_access cookie (identical to the
  existing sign-in flow's constraint). PR #23's bearer-bypass architecture is
  the resolution; noted for the rebase.

## Fresh-browser password recovery (founder decision, 2026-07-19)

Members recover their password from a fresh browser WITHOUT the shared review
password. Research stays private; the bypass is a narrow, explicit allowlist:

- Server wall: OPEN_RECOVERY_PATHS = exactly /api/research/member/forgot-password
  (server/research/index.ts). No credential required there; every other route
  keeps its wall or member guard (composed-stack tests pin catalog, member/me,
  member/catalog, orders, policies all still 401 without credentials, and a
  recovery-session JWT with no membership reaches no catalog/member/admin
  surface). The endpoint never sets a cookie, stays enumeration-safe and
  rate-limited, and sends Cache-Control: no-store + Referrer-Policy:
  no-referrer.
- Page: /research/reset-password renders OUTSIDE the client password gate in
  MinimalChrome (layout.tsx RECOVERY_PATH exception) — email + Send reset
  link + Member Login + Support only; no catalog, no member navigation, no
  application data. researchPageGate stamps no-store / no-referrer /
  noindex,nofollow on that path.
- Recovery-mode architecture (fixes the confirmed HIGH defect where client
  initialization consumed the recovery hash before the route mounted): the
  PROVIDER captures the marker synchronously on first render — before any
  getSupabaseBrowser() call — via shared/research/recovery.ts
  (captureRecoveryMarker: hash check + sessionStorage persistence), also
  subscribes to PASSWORD_RECOVERY at provider level, and holds
  recovery: none|pending|link_error in context until ResetPassword consumes
  it (clearRecovery). The page itself never reads window.location.hash.
  Expired/invalid links land in request mode with an explanatory error;
  success signs out and redirects to /research/sign-in.
- Note on recovery sessions: a Supabase recovery session is a real session
  for that user; the wall bypass exposes only forgot-password, and member
  content still requires the member guards (an active member's recovery
  session passing requireActiveMember is normal member auth, not the bypass).

Email fixes in the same pass (independent-review lows): a crash-looping
dispatch now walks the attempt ladder on reclaim (crashed attempt counts;
failed_permanent at the cap, with the admin alert) instead of reclaiming
forever, and a send counts as sent ONLY on an explicit success signal
(boolean true or ok:true) — unknown object shapes are failures.

Validation: 136 tests across 9 files (new: shared/research/recovery.test.ts
state machine, fresh-browser wall-allowlist suite, crash-ladder + explicit-
success outbox tests). Production boot smoke: bundle boots, fail-closed 503
without config; with the gate configured, the reset page serves 200 + all
three sensitive-flow headers to a credential-less browser, catalog 401s, and
forgot-password passes the wall to the handler.

## Combined recovery-security correction pass (2026-07-19, blockers 1-3)

Founder-confirmed merge blockers from the independent reviews, all fixed on
this branch (no scope broadening, flags untouched, no SQL):

1. TRACKING ISOLATION: third-party tracking (Meta Pixel) never initializes
   under /research/* nor while a recovery hash is present anywhere, and
   track() is suppressed on the Research surface even when the pixel loaded
   on a marketing page (SPA navigation). The guard reuses the canonical
   isRecoveryHash helper and only READS the hash. client/src/lib/tracking.ts;
   jsdom tests in tracking.test.ts (no script node, no fbq, no PageView, no
   URL/hash in emitted events, positive control on /).
2. CLIENT RECOVERY ISOLATION: while recovery is pending the provider loads
   NO member state and NO catalog and never force-opens the gate
   (core.tsx); abandoning /research/reset-password signs the recovery
   session out and clears the marker (idempotent, completion-guarded so it
   cannot race a later normal sign-in); successful reset uses the canonical
   signOutMember, clears recovery, and redirects to /research/sign-in — a
   fresh password sign-in is required for any member access.
   recovery-isolation.test.tsx (jsdom + real provider/page components).
3. SERVER RECOVERY-PURPOSE AUTHORIZATION: centralized
   denyRecoveryPurposeSession in member-auth.ts, enforced in requireMember
   (therefore every member/catalog/orders/referrals/billing surface) AND in
   requireSupabaseAdmin (every admin surface incl. outbox and test-email).
   Trust model: Supabase signs the session's Authentication Method
   References into the access token's amr claim (SDK evidence:
   @supabase/auth-js types — AMRMethods list, JwtPayload.amr as AMREntry[]
   or RFC-8176 string[]); recovery links verify via the OTP path, password
   sign-ins carry "password". After auth.getUser() proves the token
   authentic, a session whose amr contains NO full-purpose method
   (password/oauth/sso/mfa/web3/...) is limited-purpose and receives 403
   code "recovery_session" — even for an active member or ADMIN_EMAIL.
   Client state, headers, query params, and route names are never trusted.
   Residual risk (documented): tokens with NO amr claim are treated as
   normal sessions (legacy tolerance; members only authenticate by password
   in this product, and the client-side sign-out closes the loop).

### Re-review round (2026-07-19): two independent reviewer fleets on the
correction head both returned CHANGES_REQUIRED on ONE axis only — third-party
tracking — with server authorization, client lifecycle, and every recovery
scenario READY. Both converged on the same tracking gaps, now fixed:

- CASE-INSENSITIVE ROUTING BYPASS: wouter's matcher is case-insensitive
  (regexparam compiles with the 'i' flag), so /Research/... renders the
  research SPA while the case-SENSITIVE guards missed it — tracking could
  load and the server dropped noindex + the recovery-page security headers on
  those URLs. trackingBlockedHere and researchPageGate now lowercase the path
  before comparison; the root homepage is unaffected. Tests: case-variant
  tracking no-op, case-variant page-gate headers.
- BOOT-TIME TOCTOU: initTracking checked the guard, then awaited /api/config,
  then injected with no re-check; an in-app SPA navigation into /research
  during that await (realistic on a cold backend) could inject the pixel
  while physically on /research. The guard is now re-evaluated after the
  await, immediately before injection. Test: navigation-during-await no-op.
  (Recovery tokens were never exposed by this race — a recovery hash is on
  the initial URL and caught by the synchronous pre-await guard.)

Validation: 153 tests across 11 files (jsdom infra added as a devDependency;
vitest now includes client tests with per-file jsdom environments). New
adversarial coverage: recovery session of an ACTIVE member denied on
catalog/member/orders/referrals; recovery session with Samuel's ADMIN_EMAIL
denied on every admin endpoint; pending/approved-unpaid denied; RFC-8176
string amr honored; ordinary password member AND admin still allowed;
tracking + client-isolation suites above. Typecheck clean, build green,
production boot smoke green (root invariant, reset-page headers, wall
exception, catalog/member/admin all closed without credentials).

## Founder-directed final correction (CODEX, 2026-07-20)

This section supersedes the correction details and validation count above for
the next exact-head review. Starting head:
`f48bda0befa35a9cb0abfe5dd1cb1d2b0d3e5026`.

- Provider evidence: the installed `@supabase/auth-js` declares JWT `amr` as
  `AMREntry[] | string[]` and emits `PASSWORD_RECOVERY`. The current official
  Supabase Auth server implementation (`internal/models/sessions.go` and
  `internal/models/factor.go`, inspected at commit
  `971f7c1e372f7d36844ddbcdce9004d252c70095`) defines a session as recovery
  when **any** AMR entry parses as `otp`, `magiclink`, or `recovery`.
- Server trust model: `auth.getUser(token)` first verifies the Supabase bearer.
  Only then does the shared member/admin guard inspect the provider-signed JWT
  AMR. Any recovery marker wins even in a mixed array, so adding password or
  MFA cannot launder a recovery credential. An AMR containing only an
  additional factor is limited as well. Browser state, routes, query params,
  and invented request headers are never trusted. Legacy tokens with no AMR
  remain the documented compatibility residual and require the production
  project not to strip the standard claim.
- Admin coverage: one Samuel-email recovery bearer is now exercised against
  every registered Research admin route (application decisions/activation,
  outbox operations, test email, system status, and referral-fraud routes).
  Every response is `403 recovery_session` before handler data can load.
- Tracking boundary: Research and marketing are separate document lifetimes.
  A History API transition that crosses `/research` or a recovery hash performs
  a full navigation before the URL can be exposed to an already-running Meta
  runtime. Direct Research/recovery loads continue to block initialization and
  every tracking event. Removing a script tag is not treated as isolation.
- Recovery cleanup: the provider token is captured synchronously without
  mutating or persisting the hash. Abandonment removes only a recovery-purpose
  Supabase storage record and revokes that exact session with local scope and
  `keepalive`; it never uses default/global sign-out. Repeated cleanup is
  idempotent, and exact-token comparison cannot erase a newer normal session.
  A very-fast `pagehide` before async config/session lookup is covered.
- Recovery chrome: decoded/case-folded plain, trailing-slash, case, and encoded
  reset paths all bypass the shared password gate and render a static brand,
  reset controls, Member Login, and Support only. No gateway, policy, catalog,
  product, application, or member navigation is present.
- Successful reset: password update is followed by local recovery-session
  cleanup and `/research/sign-in`; a fresh normal sign-in is mandatory.
- Validation at this point: 175 tests across 14 files, focused adversarial
  suites green, typecheck green, production build green, and production boot
  smoke green. The smoke used local dummy gate values only: `/` 200;
  credential-free reset 200 with `no-store`, `no-referrer`, and `noindex`;
  forgot-password reached its narrow handler and returned the expected graceful
  provider-unconfigured 503; catalog/member 401; admin 503 fail-closed.
  Browser QA confirmed no Meta runtime and only the permitted recovery chrome.
- Flags stayed false. No SQL, deployment, secrets, production provider calls,
  emails, billing, referrals, or merge actions were performed.

## Known gaps left open (deliberately out of this PR)

- No approval-expiry sweep (expiry IS now enforced at claim time).
- Billing/Stripe (Phase 5), referral promoteHeldRewards scheduler, member
  sign-out UI beyond the #23 member chrome, DB-backed admin roles + MFA
  (requireSupabaseAdmin single-email model untouched — do not weaken it
  before the role system exists), Supabase auth email templates/SMTP and
  redirect allowlist (Samuel's checklist).
- (DONE 2026-07-19) The post-#23 rebase: auth_user_id resolution ported to
  member-auth.ts, section.tsx/SignIn.tsx reconciled, catalog behind the
  unified requireActiveMember. See the rebase section above.

## Needs from Samuel (production actions; see the PR description checklist)

1. Review and merge draft PR #25 (PR #23 is already in; #25 is rebased on it).
2. Run supabase/research-member-billing.sql (before any billing enablement).
3. Resend: verify xeniostechnology.com domain (SPF/DKIM), set
   RESEARCH_EMAIL_FROM + RESEARCH_EMAIL_REPLY_TO on Render.
4. Supabase Auth: allowlist https://xeniostechnology.com/research/reset-password
   as a redirect URL; review auth email templates.
5. After deploy: POST /api/admin/research/test-email to prove delivery, then
   the controlled end-to-end applicant test.
