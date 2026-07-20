# PR #25 Combined Correction Review (disposition 3, 2026-07-19)

Reviewer: CLAUDE_PRIMARY (merge gate). Reviewed head:
`c8b7d753ba7b45faa81503aaa684431938bc0c52` (additive on the previously
reviewed e9e8ca4; origin/main 468466f is an ancestor; GitHub mergeable/clean).
Method: my own gates (150/150 tests, typecheck clean, build green, production
boot smoke clean, new dependency audited: jsdom devDependency only), three
parallel review agents (tracking / client isolation / server authorization),
independent Supabase/GoTrue source research, adversarial verification of every
high/medium finding.

## All three blockers: FIXED and verified

1. TRACKING ISOLATION - fixed. The guard is the first statement in
   initTracking, blocks every /research/* path AND any page bearing a
   recovery hash, reuses the canonical isRecoveryHash, never touches the
   hash, and track() re-checks location at call time so an already-loaded
   pixel emits nothing on research routes. Proven adversarially: the reviewer
   restored the previous head's tracking.ts and re-ran the new tests - 4/5
   FAILED there, all pass at this head. Recovery URLs cannot leak (a recovery
   hash exists only on a fresh page load, where the pixel never initializes).
2. CLIENT RECOVERY ISOLATION - fixed. While recovery is pending the provider
   fetches NO member/me, NO catalog, NO orders (pinned by network-level
   assertions with an instrumented fetch and a valid active-member token);
   the gate never opens from membership; cleanup is idempotent with exactly
   one signOut across completion + unmount; a normal member session outside
   recovery still loads the catalog; the fresh-browser recovery flow itself
   is unbroken.
3. SERVER RECOVERY-PURPOSE AUTHORIZATION - fixed, and the trust model is
   sound. After getUser verification the server decodes the SAME token and
   denies any session whose amr contains no full-purpose method (allowlist:
   password/oauth/sso/mfa/web3). Independently verified against GoTrue
   source: implicit-flow recovery links mint amr "otp" (NOT "recovery" -
   only PKCE records that), refresh does NOT launder amr, updateUser does
   NOT launder amr - so the allowlist inversion is exactly right and robust
   to a future flowType switch. Centralized at both chokepoints (requireMember
   before member lookup; requireSupabaseAdmin before the ADMIN_EMAIL check,
   covering every admin route); grep-verified no third JWT-acceptance path.
   Tests: recovery + ACTIVE member denied everywhere; recovery + ADMIN_EMAIL
   denied on all admin surfaces; pending/approved-unpaid denied; ordinary
   password member and admin still allowed; realistic claim fixtures in both
   AMR shapes.

## The one remaining confirmed finding (medium)

RECOVERY-SESSION LAUNDERING VIA FIRST-TIME MFA ENROLLMENT - confirmed by
finder (empirical probe) and adversarial verifier. GoTrue appends the
verified method to the CURRENT session's amr when an MFA factor is verified,
and enrolling+verifying a new TOTP factor is permitted from an aal1 session
against hosted Supabase's own factors API (the app's Express guards cannot
intercept a separate service). amr [otp, mfa/totp] then passes the classifier.
Bounding context: a recovery link is ALREADY a latent full-takeover credential
(it can set the password and sign in normally), so this grants no privilege
beyond the link's inherent power - but it defeats the PR's stated invariant
("This session is for password reset only") STEALTHILY: no password change,
no other-session logout, no notification. It is acknowledged nowhere (the
only documented residual is the missing-amr tolerance).

## Verdict: CHANGES REQUIRED (minimal, third pass)

Required (small):
1. Compensate in the classifier: deny when the amr's only full-purpose
   entries are mfa/* methods with no first-factor method (password/oauth/
   sso/web3) present. Legitimate sessions are unaffected (password+totp has
   the first factor; a session cannot exist on MFA alone). Roughly three
   lines plus one test (amr [otp, mfa/totp] -> 403 recovery_session).
2. Document this vector in the member-auth trust-model comment and the
   status doc alongside the missing-amr tolerance.
3. Rename or convert the stale pre-correction test (members.test.ts ~734,
   "recovery-jwt" with no amr) so its name stops implying purpose-check
   coverage.

Recorded, not required for merge: hard-navigation abandonment leaves the
recovery session live client-side until expiry (server checks neutralize it
for all APIs; consider a pagehide best-effort signOut later); a stale
recovery marker can over-suppress a subsequent normal sign-in in the same
tab (fails closed, UX-only); admin denial envelope uses ok:false vs the
route's success:false convention; fbevents autoConfig hardening
(fbq('set','autoConfig',false)) for SPA entries into /research; passkey/
magiclink/anonymous sessions classify as recovery-grade (correct fail-closed
today, revisit if those sign-in methods are ever enabled); missing-amr
fail-open stays an accepted, documented residual while sign-in is
password-only.

After this micro-pass: expected READY with no qualifications. Do not merge
at c8b7d75.
