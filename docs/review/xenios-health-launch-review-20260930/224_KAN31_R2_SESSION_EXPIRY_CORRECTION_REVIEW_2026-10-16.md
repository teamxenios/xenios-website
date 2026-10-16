# KAN-31 R2 session-expiry correction: changed lines only

**ACCEPTED at source scope.** Correction `56a48627` (tree `f678e525`, parent `0b9be5f5`) resolves Doc 223 condition 1
without weakening any authority check.

- **Files.** `contracts.mjs` 11,962 B, `60bb5aed…`; `hosted-browser.UNAPPLIED.mjs` 25,175 B, `82157a9a…`.
- **Unchanged.** The workflow, `verify-tools` and the application `8efa9a9e`.
- **What this is not.** Not publication, configuration, deploy or run authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only diff against Doc 223's R2 files, with the
finding checked against E33 source; no execution; no agents.

## The finding is correct

- **The durable session store returns no expiry.** On staging, `SupabasePrivateAccessSessionRepository.resolve`
  deliberately returns `expiresAtEpochMs: null`, because its liveness check is a boolean RPC and the migration
  forbids the table read (`private-access-session-repository.ts` 510–522).
- **So the session response omits it.** `GET /session` therefore omits `expiresAt` (`private-access-routes.ts`
  829–832), and the accepted R2 assertion would always have failed.
- **The unlock response does carry an expiry.** A successful unlock returns `{ok:true, expiresAt}`, taken from the
  actual issued session (lines 679–682).

## The correction is narrow and sound

- **Server liveness is still required at every check.** `assertLiveAnonymous` still requires a fresh `GET /session`
  returning `200` with `authenticated:true`, and now **also** requires `openAccess:true`.
- **Safety bounds, which never authorize on their own.** The checks also require:
  - the actual unlock response's `expiresAt` to be present and in the future (captured at bootstrap, where an absent
    or past value fails `ACTUAL_UNLOCK_EXPIRY_REQUIRED`);
  - the HttpOnly, Secure, SameSite Strict cookie's expiry to be in the future.
- **An `expiresAt` that is present is still validated.** If the server ever includes it, it must be a string in the
  future.
- **Evidence records each value separately.** It records the server-reported value, or null, the unlock expiry and the
  cookie expiry, together with `expiryBoundsAuthorize:false`.
- **Vectors.** Authored vectors cover:
  - a `401`;
  - `authenticated:false`;
  - `openAccess:false`;
  - a past or null server expiry;
  - missing bounds;
  - a past unlock expiry;
  - a past cookie expiry;
  - both positive shapes.
- **Nothing else changed.** All other R2 logic, limits and the five post-checks are unchanged.

## Still separate

- publication of R2 plus this correction, and the workflow PR with CI;
- the approved staging deploy of the `8efa9a9e` build, with the 4-hour `OPEN_ACCESS` window including verified
  closure;
- my final manifest check against the same SHA-256;
- one run, then the SQL check, staff read-back and production.

The Doc 223 notes still apply: the claim is behavioral only, and the 401 "Sign in" copy fix remains separate.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | R2 session-expiry correction (56a48627 / f678e525; contracts 60bb5aed, hosted-browser 82157a9a) | reviewer 6abf1edf | ACCEPTED: finding confirmed (durable repository returns null expiry, GET /session omits expiresAt; unlock response carries actual expiresAt); every check still requires fresh server 200 authenticated:true and now openAccess:true, plus future unlock-response expiry and future HttpOnly/Secure/Strict cookie expiry as non-authorizing bounds; server expiresAt validated if present; vectors cover all failure shapes; nothing else changed | next: publish, approved staging deploy with <=4 h window, final manifest check, one run | doc 224.`
