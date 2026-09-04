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

Local verification at the task checkpoint:

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

Full nine-width browser acceptance belongs to the successor integrated referral
build, not this document alone. Production mutated: **NO**.
