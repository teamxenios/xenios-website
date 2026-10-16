# KAN-31 private A/B session exporter: narrow source review

**ACCEPTED at source scope,** with operational conditions. No defect blocks installation validation or private use
under Doc468.

- **What this is not.** Not installation, launch, authentication or upload authority beyond Samuel's Doc468
  approval.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Method.** Read-only: Git objects at Core `96c9137c` (tree `4a2e86c7`, parent `7806b7eb`) and E33 client source;
  no execution; no agents.

## Identity

The four files match Root's Doc468 bindings exactly:

| File | Size | Hash |
|---|---|---|
| `APPROVAL_SCOPE.md` | 6,297 B | `ba6eba6e…` |
| `private-session.UNAPPLIED.mjs` | 6,266 B | `1c679345…` |
| `package.json` | 143 B | `6159a038…` |
| `package-lock.json` | 651 B | `695392e1…` |

## What conforms

- **Supply chain.** Only `playwright-core` 1.61.1. The lock pins the official tarball with the same SHA-512 integrity
  accepted in Doc 213. It is installed with `npm ci --ignore-scripts`, and the official Chromium installer targets
  the private browsers path. The runtime is pinned to Node v20.19.0.
- **Guards before anything runs.**
  - Windows only, Node v20.19.0, no `DEBUG`, `PWDEBUG` or `NODE_OPTIONS`.
  - It needs the explicit operator-ready variable and the exact private `PLAYWRIGHT_BROWSERS_PATH`.
  - The real path must equal the fixed private root.
  - The ACL must be protected, with only Samuel's SID and SYSTEM, and only allow entries.
- **Capture.**
  - A free-memory floor of at least 2,048 MiB. State and metadata files are created exclusively and never
    overwritten.
  - A 5-minute bound, browser version 149.0.7827.55, a fresh context with no downloads, and the staging origin plus
    the staging Supabase project only, with any other request failing the capture.
  - The operator alone signs in and unlocks, and nothing is submitted.
  - Cookies and origins must be limited to those two hosts and must not be empty. The state is at most 48,000 B,
    within GitHub's 48 KB secret limit.
  - The metadata binds the SHA-256 of the exact bytes and a 15-minute window, and states that it is no independent
    identity proof.
- **Upload.**
  - It re-checks the role, origin, hash and expiry.
  - The exact bytes go through **stdin** to `gh secret set <name> --env staging --repo teamxenios/xenios-website
    --app actions`, never as arguments, and output is discarded.
  - It has a 30 s bound and no retry. Errors are generic, and no state or identity is printed.
- **Consumer fit.** The accepted hosted browser reads each secret as the `storageState` JSON for Playwright 1.61.1,
  including `indexedDB`. It binds `principalEvidence.stateSha256` to SHA-256 of the exact secret string; uploading
  identical bytes with no trailing newline keeps that equality intact.
- **Off-origin checks on staging.** No third-party loads appear on the staging journey: the staging `metaPixelId` and
  `turnstileSiteKey` are both null, research paths block tracking, and `index.html` only *links* elsewhere. The route
  lock therefore should not trip on normal pages.

## Operational conditions (not defects)

1. **Login must stay on staging and Supabase.** If member login needs any other host, such as OAuth or a captcha, the
   capture fails closed. Because no retry is authorized, confirm the login path before starting.
2. **Token timing for the hosted run.** The browser Supabase client uses `autoRefreshToken: true`
   (`supabaseBrowser.ts` 104–105). The accepted hosted browser allows **only** the staging origin. A refresh call to
   `supabase.co` during the run would fail it with `OFF_ORIGIN_TRAFFIC`, and a changed bearer would fail it with
   `MEMBER_CREDENTIAL_CHANGED`.
   - Both are fail-closed.
   - Capture, upload, manifest and proof assembly, and dispatch must all happen while the member access token still
     has comfortable remaining lifetime (about an hour by default), with the 10-minute run budget inside it.
   - I did not flag this in Docs 209 and 211, and record it here.
3. **The 15-minute window.** The metadata window and the 5-minute provider-proof limit mean the A/B preparation and
   the hosted dispatch should be one continuous, pre-approved sequence.
4. **Cleanup.** Samuel cleans up local state; Root deletes both GitHub secrets after the attempt or expiry. Uploading
   is not a pass, and the hosted run's live member checks and behavioral A/B proof remain required.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | private A/B session exporter (Core 96c9137c; APPROVAL_SCOPE ba6eba6e, private-session 1c679345, package 6159a038, lock 695392e1 = Doc468 bindings) | reviewer 6abf1edf | ACCEPTED at source scope: playwright-core 1.61.1 locked (same SRI as Doc 213), ignore-scripts, pinned Node, protected 2-entry ACL, 2048 MiB floor, exclusive create, 5 min bound, staging + staging-Supabase only, cookie/origin checks, <=48,000 B, hashed metadata with 15 min window, stdin-only gh secret set to the two names in env staging, no retry/no output; consumer-compatible storageState and hash binding. Conditions: login must not leave staging/Supabase (fail closed, no retry); hosted run must occur well within member token lifetime (autoRefreshToken refresh to supabase.co would hit OFF_ORIGIN_TRAFFIC / MEMBER_CREDENTIAL_CHANGED); run preparation and dispatch as one continuous approved sequence; cleanup per scope | doc 219.`

Not installation, execution, credential, upload, deployment, approval or production consent; not human approval.
