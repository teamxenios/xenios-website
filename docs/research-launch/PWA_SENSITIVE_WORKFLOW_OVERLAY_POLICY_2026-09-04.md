# PWA sensitive-workflow overlay policy — local checkpoint

Task: `PWA-SENSITIVE-WORKFLOW-OVERLAY-POLICY-20260904`

Base: `120761df1c446ba217a7a28448de7972fc6400f1`

This separate local task suppresses only the install-promotion UI on sensitive
routes. It does not change the PWA registration, service worker, update lifecycle,
cache/network policy, app provider order, authentication, Care, Research, payment,
or referral authority.

The policy is dynamic rather than initial-load-only. It observes history push,
replace, popstate and hash changes through the existing router location hook. It
fails closed for malformed/ambiguous paths and recovery markers, covers Care,
Health, Research, referral, admin, auth/account recovery, checkout, payment,
billing and security boundaries, and rechecks the live location immediately
before calling the native install prompt.

`beforeinstallprompt` is still always prevented and retained while the current
route is blocked; it can appear when the user later reaches an ordinary public
page. iOS eligibility follows the same render policy. Update-available notices
remain independent and higher priority; no update is applied without the existing
explicit Refresh action.

Local verification at the task and integrated acceptance checkpoints:

- policy coverage: **46/46 PASS** across the new lifecycle policy suite and the
  pre-existing PWA registration suite (`24 + 22` tests);
- combined PWA and core-protection coverage: **82/82 PASS** across three files;
- TypeScript (`npm run check`): **PASS**;
- production build (`npm run build`): **PASS**, including Vite client output
  `assets/index-C2hX27OM.js` and the server bundle;
- protected runtime adjacency: `client/src/pwa/register.ts`,
  `client/src/main.tsx`, and `client/public/sw.js` are byte-unchanged from the
  task base;
- core manifest JSON and the CRLF-normalized source hash lock both verify. The
  locked SHA-256 for `PwaLifecycle.tsx` is
  `9594f39848cde2320df07a4441ea9addd3534c3690fcca9468b9bbbe815b1741`.
- the complete suite at
  `8264ad973b4a6be20b86e35cfd488d21cd0ef404` passed 838/838 files and
  12,620 tests, with 59 environment/fixture skips, 0 failures and a 439.38s
  duration; skips are not counted as passes;
- the final integrated browser matrix at exact source
  `342a2c4fa446d89e796f4aee400661fa360b2378` passed all nine required widths
  in order: 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320;
- all 180 screenshots recorded automated install-overlay absence, while 4,401
  browser requests remained on `http://127.0.0.1:5238`; external requests,
  server outbound attempts, boundary violations, runtime exceptions and harness
  errors were all zero;
- every width ended with actual SQL counts of 8 links/3 touches/3 bindings/15
  events, and all nine browser-profile plus nine preview/database cleanups were
  confirmed;
- the before/after fingerprints matched: source tree
  `7f188571adbe0a641aed843a3b0cc14b7618bee55741d36d8101b15c8c5c0155`
  across 2,094 files and bundle
  `c6d0d5b5e2bc09e7cbbe09e9ff5f4500d00b9ad0d0f6e32262c14a183f77a630`
  across 327 files.

The earlier `74951ef0b05ff40101ffc67823c6c051a56ac45e` diagnostic run passed
the functional journey at seven widths through 375px, then correctly failed
closed because immediate cleanup of that width's owned temporary browser profile
was not confirmed. It did not run 360px or 320px, and its evidence does not
establish a descendant process or other root cause.

The final PII evidence scanner found 0 findings in the browser-results textual
artifact and classified all 180 PNGs. Screenshot pixels remain `MANUAL_PENDING`;
manual visual review covered representative 320px and 1440px captures only, not
the complete image set. Evidence is in
`docs/ux/referral-v1-20260904/browser-final-342a2c4-ninewidth/`. Production
mutated: **NO**.
