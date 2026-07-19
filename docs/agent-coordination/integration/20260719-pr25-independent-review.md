# PR #25 Independent Review

Reviewer: CLAUDE_PRIMARY (integration-review mode, per Samuel's instruction).
Date: 2026-07-19. Method: merge-simulation checkout of the rebased head, my own
build gates (never the author's reported numbers), five parallel review agents
(routes, members/auth, email/outbox, password recovery, cross-cutting
regression), and adversarial verification of every high/medium finding.

## Verdict

- Reviewed head SHA: `ef0c7c1e341c4d74da6254da4df367f75b80756d`
- Merge simulation: the head is a TRUE REBASE (origin/main `468466f` is an
  ancestor), so the head itself is the integrated result. GitHub agrees:
  mergeable, state clean.
- Conflicts remaining: none.
- Tests: **118/118 passing** (run by me on the head; main has 82).
- Typecheck: **fully clean** (the PR also fixes the long-standing storage.ts
  implicit-any, so `npm run check` now exits with zero errors).
- Build: green (`vite` + server bundle). Production boot smoke: clean log,
  homepage 200 with no redirect, admin/member endpoints fail closed.
- Recommendation: **CHANGES REQUIRED** — one confirmed high-severity
  functional defect in the PR's own headline feature (below). Everything else
  is merge-ready quality.

## Checklist results (all five areas)

Every item on Samuel's checklist PASSES with file:line evidence (full agent
output retained in the session transcript). Highlights:

- Routes: /research still renders the one-viewport Gateway, Apply + Member
  Login visible, catalog loads only with a member token, reset-password is
  registered pre-member with minimal chrome, status/activate routes intact,
  no stale pre-gateway behavior, no root redirect.
- Members: auth_user_id-first resolution (email only as legacy fallback);
  pending members 403 via the single requireActiveMember in member-auth.ts
  (guards.ts is a pure re-export plus a member-route catalog alias using the
  same guard); claim compensates a failed member insert by deleting the auth
  user AND self-heals a previously stranded account on retry; claim accepts
  only purpose-scoped `account_claim` tokens; approval expiry enforced at
  claim; billing_state denies only when RESEARCH_MEMBERSHIP_BILLING_ENABLED
  is true and tolerates the un-run migration; no referral logic removed
  (identity issuance, dashboard, invite validation, qualification all intact).
- Email/outbox: admin alerts loop adminRecipients() (default
  samuel@xeniostechnology.com); sender/reply-to env-driven
  (RESEARCH_EMAIL_FROM/REPLY_TO); a Resend error can never mark a row sent;
  stale processing rows reclaim after 15 minutes; failed_permanent is
  admin-retryable via a compare-and-swap; test-email is admin-only AND
  refuses recipients outside adminRecipients() (no open relay); PII log
  suppression covers all new admin routes; no token/password/body logging.
- Recovery: enumeration-safe (identical generic 200 for every outcome,
  fire-and-forget send), rate limited, redirect fixed server-side, the
  new-password write applies only to the recovery session's own user.
- Regression: promotion tick present exactly once and flag-gated; one outbox
  worker (re-entry guarded); one requireActiveMember; no stale gateway code;
  no root redirect; .env.example adds only the two sender addresses (no flag
  flips); MIGRATIONS.md row 9 correctly PENDING.

## Security findings

- CONFIRMED HIGH (functional, not exploit): **valid recovery links land on
  the wrong form.** For the normal forgot-password persona (fresh browser or
  expired 12-hour gate cookie clicking the emailed link), the provider's
  first getSupabaseBrowser() call consumes the recovery hash: auth-js clears
  `window.location.hash` and emits PASSWORD_RECOVERY once via setTimeout(0)
  while ResetPassword is still unmounted (the layout renders the password
  gate until the member session opens it). By the time ResetPassword mounts,
  the one-shot event is gone and the hash fallback reads an empty hash, so a
  visitor holding a VALID recovery session is shown the "request a reset
  link" form; requesting another link loops identically. Two independent
  agents traced the chain end to end (ResetPassword.tsx:26-47,
  layout.tsx:233-241, core.tsx:148-227, auth-js GoTrueClient.js:380-387 and
  :3247) and the adversarial verifier could not refute it. Fix direction:
  capture the recovery marker synchronously before any Supabase client
  initialization (stash location.hash at App/module load), or subscribe to
  PASSWORD_RECOVERY at the provider level and pass the flag through context.
- CONFIRMED MEDIUM (product decision): in default private mode, a signed-out
  member on a fresh browser cannot reach the reset-REQUEST form (client
  PasswordPage wall + server cookie wall both block it; the PR's own test
  pins the server behavior as intended). Combined with the high finding, the
  fresh-browser member currently has NO self-serve recovery leg. Options:
  exempt /research/reset-password (page + endpoint) from the shared wall, or
  accept until RESEARCH_PUBLIC launch and document support as the fallback.
- LOW: any junk `Bearer` header bypasses the shared-password wall on the
  /member, /catalog, /orders prefixes (a #23 design carried forward);
  endpoints self-guard so impact is nil today, but every future route under
  those prefixes MUST self-guard — worth a comment in index.ts.
- LOW: the gate-cookie MAC comment overclaims. A gate cookie is, byte for
  byte, a valid LEGACY token for the literal application id "cookie"
  (HMAC("cookie.<exp>") satisfies the 3-part branch). Unexploitable (no
  application has id "cookie") and the legacy branch dies with the 90-day
  grandfather window, but the "can never collide" comment should be softened.
- LOW: legacy 3-part tokens stay claim-capable for up to 90 days
  (deliberate, documented, bounded by claimable-status + approval expiry).
- LOW: the stranded-claim self-heal scans at most 1000 auth users; beyond
  that the bricked-account scenario returns. Fine at pilot scale; revisit
  before 1000 members.

## Email findings

- LOW: a dispatch that crashes or hangs forever loops
  claim -> stale-reclaim -> retry without ever incrementing attempt_count,
  so it never reaches failed_permanent (alert fatigue risk, not data loss).
- LOW: the dispatch success check treats any object lacking `ok:false` as
  sent; today's senders all return a typed SendResult, but a future sender
  returning a raw Resend response would be miscounted. Tighten to
  `result === true || (result as any)?.ok === true`.

## Account findings

- LOW: billing_state column-missing detection matches
  /billing_state|column|schema/i on the error message — broad enough to
  swallow unrelated schema errors as "pre-migration". Acceptable until the
  migration runs; remove the fallback after it does.
- LOW: recover mode does not distinguish non-member Supabase users (they can
  only change their own password; cosmetic).
- LOW: recovery-link error hashes (expired/used links) are silently ignored
  on arrival; the "link expired" message exists only on submit.
- LOW: storage.ts loosened the waitlist transaction callback to `tx: any`
  (this is also what cleared the old tsc error); a typed parameter would
  restore schema checking.

## Deploy notes (carried from the PR, verified)

- The gate-cookie MAC domain change logs every current review-password
  holder out ONCE on deploy (fail-closed, intended).
- supabase/research-member-billing.sql is PENDING and must be run before
  RESEARCH_MEMBERSHIP_BILLING_ENABLED is ever set true; code tolerates
  either order.
- No flags change; nothing activates on merge.

## Recommendation

**CHANGES REQUIRED** before merge: fix the confirmed high (recovery links
must land on the set-new-password form for the fresh-browser persona), and
make an explicit call on the medium (exempt the reset-request leg from the
shared wall, or document support-mediated recovery for the private phase).
The lows can ride follow-ups. After those two: ready. After merge: the
approval-expiry sweep is the next isolated backend task (CLAUDE_PRIMARY's
lane, deliberately deferred so it would not touch PR #25 files), then Codex
rebases #13.
