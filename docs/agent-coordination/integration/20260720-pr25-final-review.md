# PR #25 Final Review (disposition 4, 2026-07-20)

Reviewer: CLAUDE_PRIMARY (merge gate).

## Verdict: READY

Reviewed head: `7ddd1e6d2bf7fbfdc14f176c140520e6f4c6f464`

The instruction pinned f48bda0 as "the corrected head", but the branch moved
before this review ran, and f48bda0 was NOT fully corrected (disposition 3's
three items were absent there; my CHANGES REQUIRED for that SHA stands).
Approving a non-head SHA would recreate the exact stale-head failure this
gate exists to prevent, so the verdict applies to the actual head, which is
additive on f48bda0 and contains precisely the outstanding corrections plus
further hardening. f48bda0 is NOT approved.

## Disposition 3 items: all delivered, stronger than asked

1. The recovery classifier now mirrors upstream GoTrue's own
   Session.IsRecovery rule: ANY recovery marker (otp/magiclink/recovery) in
   the amr wins, even in a mixed array, AND second-factor-only arrays are
   limited-purpose. [otp, mfa/totp] is denied (the MFA-laundering vector is
   closed), [otp, password] is denied (correct: that combination cannot occur
   legitimately, since GoTrue appends amr only at session creation and MFA
   verification), [password] and [password, totp] are allowed. The upstream
   citation (sessions.go/factor.go at commit 971f7c1e) matches this gate's
   own independent GoTrue source research exactly.
2. The trust-model comment and status doc document the rule and residuals.
3. The stale no-amr test is renamed, and a NEW test pins the mixed-AMR
   laundering matrix.

## The additional client hardening (all verified sound)

- Surgical recovery-session removal in supabaseBrowser: exact-token match or
  AMR-classified removal, storage-key parity with supabase-js's own default
  (no orphaned admin/member sessions), targeted scope=local revoke with
  keepalive; a concurrent newer normal session survives (pinned by a race
  test).
- A history-API document boundary: any SPA transition crossing into or out
  of /research (or any path bearing a recovery hash) becomes a full document
  navigation, because an already-loaded pixel cannot be unloaded. This
  closes the SPA-entry residual from disposition 3's info note.
- RecoveryChrome: the reset page loses even the gateway link and policy
  footer; case/encoded/trailing-slash URL variants now mount the recovery
  page instead of falling into the shared password gate.
- Abandonment cleanup now covers hard navigation and tab close (pagehide),
  idempotent, with a synchronous token capture + synchronous storage clear
  before the first await.
- Success-path change (deliberate): the explicit client global sign-out is
  replaced by a targeted revoke of only the recovery session; invalidation
  of OTHER sessions after a password change rests on GoTrue's server-side
  updateUser behavior (LogoutAllExceptMe), which this gate's own upstream
  research verified. Side benefit: a member signing out on one device no
  longer kills every device.

## Independent validation (my runs)

- Tests: 175/175 (14 files). Typecheck: clean. Build: green.
- Production boot smoke: clean log; homepage 200, no redirect; reset page
  no-store/no-referrer/noindex; forgot-password credential-free through its
  narrow wall exemption; catalog walled.
- Node caveat: validated on Node 24.14.1 (this machine), not the stated
  20.19.0; the repo has been validated on this runtime throughout.
- Flags: delta touches no flag defaults. No SQL changed. No secrets.

## Non-blocking residuals (recorded; none merge-blocking)

Low: other-session invalidation now server-behavior-reliant (verified
upstream, not in reviewed code); clearPersistedRecoverySession aborts its
key scan on the first malformed stored value (per-key try/catch would be
more robust); hash-only mutations bypass the history boundary (self-inflicted
edge, not attacker-reachable); empty-amr arrays classify as normal (matches
the documented absent-amr residual; practically unreachable). Info: a stale
header comment in ResetPassword; future first-factor methods (passkey/
anonymous) would classify as recovery-grade until added to the allowlist;
minor test-coverage gaps noted for the account-email lane's backlog.

## Merge conditions

READY at exactly 7ddd1e6d2bf7fbfdc14f176c140520e6f4c6f464. Per Samuel's
process: the second reviewer confirms the same SHA, Samuel reviews the
exact head, marks ready, merges; then Render deploy confirmation, Resend +
Supabase recovery-redirect configuration, the pending billing migration
(ledger row 9) before RESEARCH_MEMBERSHIP_BILLING_ENABLED ever flips, and
the controlled account/email production test. This gate does not merge.
