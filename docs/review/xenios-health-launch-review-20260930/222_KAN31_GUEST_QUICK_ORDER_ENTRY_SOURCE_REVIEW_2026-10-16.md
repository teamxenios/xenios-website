# KAN-31 login-free Quick Order guest entry: source review

**ACCEPTED at source scope.** The guest-entry delta `e33c12a9..8efa9a9e` (tree `0c92fdc6`) implements Samuel's
login-free Quick Order on the existing E33 machinery without weakening server ownership.

- **The commits.** `c0506b1` (bootstrap the guest entry), `4882f6c` (route adaptation and CI history inputs) and
  `8efa9a9` (test fixtures and the focused CI step; three files, matching Core's report).
- **What this is not.** Not publication, configuration, deploy or test authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only Git diff of 6 files, with 230 lines added and
11 removed. No server source changed; no execution; no agents.

## What changed

- **The route.** `/research/early-access/order-request` now renders `EarlyAccessRoute` with `requestOnly`
  (`section.tsx`). The old direct `OrderRequestEntry` mount is removed, and the confirmation and status routes are
  unchanged.
- **`requestOnly` mode** (`EarlyAccessRoute.tsx`, about 54 lines).
  - It reuses the route's **existing** canonical session bootstrap. A session-less browser gets one automatic
    `/unlock` only when the server reports `openAccess`. It also reuses the existing expiry and privacy sweep, the
    existing `EarlyAccessAgreementSection` (durable server agreement acceptance), and the existing mixed request form.
    No password field exists in this mode.
  - **States.** When the gate is closed or the session is not authenticated, it shows "not available" and sends
    nothing, with no bypass. An earlier legacy or uncertain attempt blocks with a support message rather than
    duplicating. Contact and submit are enabled only after server agreement acceptance.
  - **Copy.** It is accurate: request for review only, no payment, treatment approval, prescription or shipping
    confirmation. "No account is required", with `noindex`.
  - The conditional return comes after every hook, so React's hook-order rules hold.
- **Server ownership is unchanged.** An anonymous session owner is `sha256(stable(["request-intent-owner","session",
  customerRef, sessionHash]))` (`request-intent/service.ts` 56–58). A different browser session means a different
  owner, so customer B cannot recover customer A's request. Staff read stays behind care permission, and direct
  commerce stays off.
- **Tests.** The focused tests cover:
  - a fresh signed-out browser: one empty-body unlock, no password field, no `Authorization` header and no member
    calls;
  - a closed gate: no password and no unlock;
  - contact enabled only after server agreement acceptance;
  - malformed, legacy or uncertain retained attempts not becoming new requests;
  - expired authority hiding the form.
- **CI.** The CI changes add the focused step before the full suite and full history plus PR head and base inputs for
  the existing core-site protection verifier. They are CI-only.

## Conditions

1. **Login-free needs `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=true`.** With the current staging value `false` (Doc464),
   this page correctly shows "not available" and has no password path. Qualification therefore needs Samuel's exact,
   time-boxed staging `OPEN_ACCESS=true` window, with payment held and synthetic data. A production release needs the
   same value through its own approval.
2. **The browser-test correction must follow the product.** The accepted hosted harness allows only request-intent
   POSTs and member bearers. For two fresh anonymous browsers, it must explicitly allow exactly one `/unlock` and the
   `/agreements/accept` POST per context. It must replace the member `member/me` liveness check with the anonymous
   session check, and keep:
   - the three scenarios;
   - replay;
   - the changed-fact `409`;
   - A recovers while B and an anonymous browser get no receipt;
   - accounting;
   - every other limit.

   That change needs its own narrow review.
3. **Publication.** Through Root's isolated PR with focused-first CI. Then an E33-successor staging deploy under its
   own exact authority, since staging currently serves `e33c12a9`, not this delta.
4. **Still separate.** The Doc455 SQL after receipts, staff read-back, release checks and production.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | login-free Quick Order guest entry (e33c12a9..8efa9a9e: c0506b1, 4882f6c, 8efa9a9; tree 0c92fdc6) | reviewer 6abf1edf | ACCEPTED at source scope: order-request route now EarlyAccessRoute requestOnly reusing canonical anonymous session bootstrap (one empty unlock only under server openAccess), durable agreement acceptance and mixed request form; no password path; closed gate shows unavailable without bypass; legacy/uncertain attempts blocked; accurate pending-review copy; hooks order intact; server ownership unchanged (session-hash owner isolates customers); focused tests and CI step added. Conditions: login-free requires staging/production OPEN_ACCESS=true via exact approvals; hosted test must be corrected for two anonymous contexts (allow one unlock + agreement accept per context, anonymous session liveness) and reviewed; publication + successor staging deploy separate; SQL/staff/release/production separate | doc 222.`
