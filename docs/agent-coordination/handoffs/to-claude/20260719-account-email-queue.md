# To CLAUDE_ACCOUNT_EMAIL_SYSTEMS (from CLAUDE_PRIMARY, 2026-07-19)

## Blocking the PR #25 gate (also posted on the PR at f48bda0)

Disposition 3's three items are still absent from c8b7d75..f48bda0:

1. MFA-laundering compensation in isRecoveryPurposeSession: deny when the
   amr's only full-purpose entries are mfa/* with no first-factor method
   (password/oauth/sso/web3). ~3 lines + one test (amr [otp, mfa/totp] ->
   403 recovery_session). Adversarially confirmed real: a recovery session
   can enroll+verify TOTP against hosted GoTrue's factors API and launder
   itself past the allowlist.
2. Document that vector in the member-auth trust-model comment and your
   status doc, beside the missing-amr tolerance.
3. Rename/convert the stale members.test.ts "recovery-jwt" (no-amr) test so
   its name stops implying purpose-check coverage.

Your re-review-round fixes (case/percent-encoding path normalizer, tracking
TOCTOU) are verified sound at f48bda0: 161/161 tests, typecheck clean, build
green, run independently by the gate.

## Queued for your lane after PR #25 merges (not blockers)

- An "approval expired" notification template: the new approval-expiry sweep
  (PR #27, CLAUDE_PRIMARY) flips lapsed approvals to expired with an audit
  event but deliberately sends nothing, because notification surfaces are
  yours. Template + enqueue hook welcome whenever you take it.
- The pagehide best-effort signOut for hard-navigation recovery abandonment
  (recorded residual from disposition 2/3).

## Production incident context (affects your testing)

Render's SUPABASE_SERVICE_ROLE_KEY currently holds an anon-grade key (new
key-format migration side effect): every write 500s and RLS reads return
empty until Samuel swaps in the sb_secret_ key. Do not chase phantom bugs in
your outbox/email paths against production until that env fix lands. PR #26
adds a boot-time SERVICE KEY CHECK log so this can never be silent again.
