# Referral V1 local browser evidence harness

This is a reproduction guide, not an acceptance result. Run-specific evidence is written to `browser-<suffix>/browser-results.json`. Do not claim browser verification until that report exists and its source/bundle fingerprints are checked.

## Runtime and boundary

- Run the repository's existing production client bundle with `scripts/referral-v1/preview.ts`.
- Preview uses the actual Referral V1 controllers and disposable PostgreSQL. Auth/provider and approved-applicant data are explicitly local synthetic fixtures.
- Start a fresh preview/database and headless Chromium profile for each of 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320 CSS-pixel widths.
- The browser uses the repository's strict CDP origin boundary and closed proxy. Only `http://127.0.0.1:5238` is permitted. The preview receives a minimal environment without inherited provider credentials.
- No core API response is mocked or fulfilled in the browser. Native-share and clipboard capability branches are explicitly simulated in-browser. These checks prove rendered interaction/feedback, not OS share-sheet delivery or system-clipboard contents; they do not overwrite the user's clipboard.
- The harness does not bypass or unregister service workers. Persona switching clears only synthetic identity storage and cookies, not service-worker/cache state.
- The whole runtime source tree and the entire built public bundle are fingerprinted before and after the matrix. Any change fails acceptance.
- Chromium process exit, temporary-profile removal and graceful preview/database shutdown must be confirmed; cleanup uncertainty cannot be recorded as a pass.

Do not run this concurrently with the full regression suite on the 16 GB host. The integration lead confirms suite completion and build readiness first.

## Run

From the repository root, using the pinned Node 20.19.0 binary:

```powershell
& 'C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64\node.exe' --test scripts/referral-v1/browser-qa.test.mjs
& 'C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64\node.exe' scripts/referral-v1/browser-qa.mjs --only-320 --output-suffix=smoke
& 'C:\Users\sboad\.codex\toolchains\node-v20.19.0-win-x64\node.exe' scripts/referral-v1/browser-qa.mjs --output-suffix=final-candidate
```

Never reuse a completed output suffix: retain failed attempts as diagnostic evidence. A smoke-only result does not cover the nine-width matrix.

## Asserted journeys

1. Owner signs in through the canonical form; creates Health, Care and private Research links through the real API; copies/shares via the declared browser-capability shims; sees copy failure; confirms revocation. A second Health link remains active for the explicit pathway-choice check.
2. Invalid, revoked and seeded-expired invitations provide safe recovery without capture. Care and Research invitations render contextual, noindex, support-accessible pages. Capture occurs only after Continue; a retained referral does not replace the incoming destination. Choosing to browse without confirming a referral performs no capture.
3. The captured visitor cookie survives member sign-in and safe return, including the sign-in/reset links. The harness checks the actual observed redirect and does not replace a broken link with a correct URL. An ordinary member has no link-issuance access and receives an admin denial without lifecycle rows. Actual local recovery uses a separate synthetic visitor/account and requires fresh password sign-in. No real recovery email is sent.
4. A synthetic approved applicant claims an account, preserves the safe destination in its sign-in link, and remains activation-gated after sign-in. The referral binds through the actual member probe, without granting active membership.
5. Admin signs in and sees the actual link, touch, binding and audit records, including current availability. Initial and final database telemetry must show new rows, not merely seeded examples. Per-persona database reads must show no binding during recovery or immediately after claim/reset, then exactly one binding to the expected UI-created link after fresh normal sign-in. Only after binding, a separate explicit local IPC action inserts synthetic draft-order/request fixtures; their admin visibility is tested without claiming request submission, conversion or independently verified order-level attribution.
6. Full-page screenshots require quiet-through-paint network, settled fonts, stable geometry and exact image coverage. New flow controls are checked for 44-pixel targets and horizontal overflow.

Missing claim or recovery fixtures are recorded as `not_run`; they never produce a full pass. No screenshot or result proves live deployment, real customer behavior, payment, clinical eligibility, earned commission, email delivery or a complete accessibility audit.
