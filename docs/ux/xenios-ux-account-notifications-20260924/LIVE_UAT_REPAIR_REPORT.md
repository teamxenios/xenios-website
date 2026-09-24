# Xenios live-UAT application and status repair

Date: 2026-09-24

Reconciled runtime base: `6d9ec3cb615f0c48102e74974e777c07e7039eba`

Production base: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`

Production mutation: none

## Repair disposition

- The formal Research membership application remains closed until its exact Terms and Privacy documents are approved. The page performs no write and makes no submission claim.
- The closed application page now offers six supported routes: Sign in, Order for Research, Start Care, Business or organization, Partner program, and Support.
- Product-oriented membership calls to action now prefer the supported Research ordering route and disclose that formal membership applications are closed.
- A status-page visit with no token is a neutral secure-link request flow. It does not render an invalid-token error.
- A malformed, expired, or server-rejected token renders explicit invalid-or-expired-link guidance and the same secure-link request form.
- Secure-link requests retain the generic enumeration-safe response: `If an application exists for that email, a secure status link has been requested.`
- The valid-token application status and approved-account claim flows remain unchanged and covered by regression tests.
- The optional Research access-interest intake was not implemented. No new submission authority, notification path, database state, email configuration, or credential was introduced.

## Verification

- Focused live-UAT suite: 8 files, 150 tests passed.
- Focused release-control suite: 8 files passed; 172 tests passed, 1 skipped, including core-site protection and release-control-plane coverage.
- Full release suite, serialized with a 120-second test timeout: 971 files passed, 6 skipped; 18,036 tests passed, 85 skipped; zero failures.
- TypeScript: passed.
- Production build: passed with only existing Vite mixed-import and chunk-size warnings.
- Browser UAT at 390 x 844: closed application alternatives, Research order navigation, Sign in navigation, neutral no-token status request, and malformed-token recovery passed.
- Desktop browser UAT at 1280 x 900: closed-state layout and alternatives passed.
- Valid-token behavior was verified with the existing synthetic test fixtures; no production application or token was created.
- `git diff --check`: passed.

The exact runtime SHA and tree are recorded in the pushed successor handoff. That handoff-only successor is not the runtime deployment SHA.
