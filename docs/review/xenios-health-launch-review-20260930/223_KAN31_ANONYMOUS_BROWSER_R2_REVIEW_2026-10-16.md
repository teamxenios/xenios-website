# KAN-31 anonymous-browser R2 (public login-free Quick Order test): narrow review

**ACCEPTED at source scope.** R2 at commit `0b9be5f5` (tree `b46de2ed`, parent `1dcf0758`) correctly re-targets the
accepted hosted harness to the Doc 222 login-free Quick Order.

- **What it now uses.** Two fresh anonymous browsers and one sessionless browser. No member login, password, stored
  state or GitHub credential secrets.
- **What it keeps.** Every accepted Doc 208, 211 and 220 safeguard.
- **What this is not.** Not publication, configuration, deploy or run authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5.
- **Delivery.** Samuel's Ollie brief named the commit, so I read it directly; the composer draft was not needed.
- **Method.** Read-only diffs against the accepted `050b0409` harness and the published workflow `e219745f`, with
  every endpoint assumption checked against application `8efa9a9e`. No execution; no agents.

## Identity

| File | Size | Hash | Note |
|---|---|---|---|
| `REVIEW_PACKET.json` | 6,821 B | `231c5b7e…` | |
| `contracts.mjs` | 10,973 B | `2545153e…` | |
| `hosted-browser.UNAPPLIED.mjs` | 24,655 B | `51453bd6…` | |
| `verify-tools.UNAPPLIED.mjs` | 2,262 B | `85ee0855…` | byte-identical to the accepted file |
| `workflow.UNAPPLIED.yml` | 10,538 B | `7cbe7ccb…` | |

## Checks

- **Contexts.**
  - A and B start with **zero cookies**, and the sessionless context C never visits the wizard.
  - Every request must carry **no `Authorization`** header.
  - The A and B server cookie handles must differ, and each handle must stay unchanged throughout. They are compared
    in memory only and never emitted.
- **Public bootstrap.**
  - Each of A and B navigates directly to the Quick Order URL and waits for the UI's own **automatic** `POST /unlock`
    with body exactly `{}`. Exactly one is allowed per context, only during `public-bootstrap`, and the total must be
    2.
  - The page must have no password field and no member-login link. The session endpoint must report
    `authenticated:true` and `openAccess:true`. The test never sends a password.
- **Agreement.**
  - It reads `GET /agreements`, which returns `{ok, required, accepted}` (`agreement-routes.ts` 289–291), and
    requires exactly the pair `early_access_terms` v1.
  - At most one UI acceptance per context, using the real test IDs `early-access-agreement-checkbox` and
    `early-access-agreement-submit`. The accept body is exactly `{kind, version}`, as the client builds it in
    `earlyAccessAgreement.ts`.
  - The durable `accepted:true` must be re-read afterwards.
- **Session liveness.** The endpoint returns `{authenticated, openAccess, expiresAt}` (`private-access-routes.ts`
  829–832). The cookie must be `__Host-XeniosPrivateEarlyAccess` with HttpOnly, Secure, SameSite Strict and path `/`,
  which matches `private-access-cookie-session.ts` 242.
- **The three cases.**
  - Cases are allocated A, A, B. Each case reads the catalog and config through the cookie session and derives the
    fixture by the frozen rule. The catalog and config hashes must be stable across cases, and each `plan.json` is
    written **before** any request POST.
  - The exact synthetic contacts are kept, along with the pre-forward freeze, the fingerprint, and lost-response
    abort only after an upstream `200`.
  - Contact validation and acknowledgments are checked before submit.
- **The five post-case checks are mandatory.**
  - same-key replay returns the same receipt;
  - a changed detail returns `409` with no new row;
  - the owner recovers its receipt;
  - the **other live anonymous session** gets exactly `200 {receipt:null}`, with its session proven live before and
    after;
  - **sessionless** recovery gets `401` or `403`, with no receipt.

  These match E33's server: a different session hash means a different owner, and a sessionless viewer has no
  capabilities, so the owner check refuses with `401`.
- **Unchanged limits.** The mutation allow-list now also permits `/unlock` and `/agreements/accept`, under the scope
  and count limits above. Everything else is unchanged: 400 requests, 40 POSTs, 8 in flight, no redirects or retries,
  full accounting, the pinned toolchain, the 2,048 MiB floor and 1-day retention.
- **Workflow.**
  - The only differences from the published `e219745f` are: removal of both storage-state secrets and their file
    handling and cleanup, the proposal path, a description string, and `unset GH_TOKEN` before the browser runs.
  - The artifact pins, input transport and mode-restore logic are unchanged.
- **Manifest admission.** It requires the exact staging origin, service and project. It also requires a
  `publicModeWindow` that is current and covers the manifest expiry, with `maxUnlockPosts` and `maxAgreementPosts` of
  2 and a provider-proof window reference. The provider proof must be no more than 5 minutes old.

## Conditions and notes

1. **`expiresAt` can be missing.** The session endpoint omits `expiresAt` when the store reports no expiry
   (`private-access-routes.ts` 830–831), and `assertLiveAnonymous` then fails closed. Confirm from source or provider
   configuration that staging sessions carry an expiry before spending the single run.
2. **Behavioral claim only.** Isolation is shown by behavior between two server sessions. No underlying identity or
   private pair is proved, and the claim says so.
3. **Customer copy, outside R2.** `request-intent-api.ts` line 17 tells a customer who hits a `401` to "Sign in
   through the existing account". On the login-free page that copy is wrong. It is a small Core copy fix, not blocking
   for R2.
4. **Still separate.**
   - Publishing R2 to GitHub, and replacing the published workflow through an isolated PR and CI.
   - The staging deploy of the Doc 222 build (staging still serves `e33c12a9`).
   - The approved `OPEN_ACCESS=true` window of at most 4 hours including verified closure, starting at that deploy.
   - The populated manifest, checked by me against the same SHA-256.
   - One run; then Doc455 SQL, staff read-back and production.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | anonymous-browser R2 (0b9be5f5 / b46de2ed; contracts 2545153e, hosted-browser 51453bd6, workflow 7cbe7ccb, verify-tools 85ee0855 unchanged; packet 231c5b7e) | reviewer 6abf1edf | ACCEPTED at source scope: fresh zero-cookie A/B + sessionless C, no Authorization/password/member/storage-state; exactly one automatic empty unlock per context (total 2) and at most one canonical agreement accept, verified against E33 endpoints, test IDs, cookie attributes and response shapes; live anonymous session before/after; 3 cases A,A,B with plan frozen pre-POST; all 5 post-checks incl. other-session exact 200 receipt:null and sessionless 401/403; limits and pins unchanged; workflow only drops state secrets, changes path, unsets GH_TOKEN. Notes: missing session expiresAt fails closed, confirm before run; behavioral isolation only; fix 401 Sign-in copy separately | next: publish R2 + workflow PR, staging deploy of 8efa9a9e build with approved <=4 h OPEN_ACCESS window, final manifest check, one run | doc 223.`
