# KAN-31 Doc 209 correction: option 2, the behavior-only B identity basis

**Decision. Samuel selected option 2 in chat, and the original reviewer accepts it.** This amends Doc 209's correction
point 2. No new endpoint and no account-context link are required.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Basis.** The decision rests on a read-only E33 source survey. E33 has no existing anonymous-refusing endpoint that
  returns the identity the request-intent owner uses.
  - `member/me` returns a first name and status but no stable ID.
  - `account/context` returns the account-login user, which is not the member and Early Access customer owner.
  - `early-access/session` returns only a boolean.
- **Recorded.** At 02:28Z. Not execution or authority.

## Required in the revised `hosted-browser.UNAPPLIED.mjs`

1. **B's recovery.** `b-recover` accepts **only** HTTP 200 with a body of exactly `{receipt: null}`. The 401/403
   acceptance stays for `anonymous-recover` only.
2. **A's sign-in at the start.** At the start, A's context passes an existing anonymous-refusing E33 authentication
   check. For example, `GET /api/research/member/me` returns 200 with `ok: true`. Record only status and outcome,
   never identity values.
3. **B's sign-in around each attempt.** Immediately **before and after** each B recovery attempt, B's context passes the
   same authentication check. Any failure fails the run.
4. **Distinctness comes from behavior.** Within the same case and under the same key, A recovers the native receipt
   while an authenticated B gets `{receipt: null}`. Record both outcomes together.
5. **Focused regression checks.** These run in source-only unit form, with nothing hosted:
   - a B 401 or 403 is refused as evidence;
   - a B 200 with any receipt, or with extra keys, is refused;
   - a failed B authentication check before or after an attempt fails the run;
   - an anonymous 401/403 is still accepted.

## Claim wording (add to CLAIM and the records)

"Owner A/B distinctness is behavioral: authenticated B is refused A's receipt under A's key while A recovers it. No
server identity value is compared."

**Unchanged.** All other Doc 208 and Doc 209 conditions and the reserved prerequisites. Re-review covers the changed
lines and revised SHA only. NOT LIVE.
