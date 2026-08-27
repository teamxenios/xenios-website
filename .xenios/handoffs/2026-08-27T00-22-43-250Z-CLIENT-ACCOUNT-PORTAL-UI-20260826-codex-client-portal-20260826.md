# Client account portal UI handoff

## Scope delivered

- Six personal-account routes under `/research/account`, each mounted through
  the existing member guard.
- Fail-closed authenticated customer-account API client and explicit
  loading/denied/error/ready states.
- Overview, Research/Care orders, manual membership billing, ten-stage Care
  timeline, authenticated document actions, and account support views.
- Config-driven demand collection with the shared activation vocabulary and
  non-orderable exact-variant placeholders.
- Counts-only admin import dry-run summary with staff attribution kept out of
  customer projections.
- Synthetic local review harness and the PNG packet in this directory.

## Verification

- 25 focused UI tests passed: portal views, API/privacy policy, date handling,
  catalog activation behavior, and admin dry-run projection.
- 47 route/shared/backend checkpoint tests passed.
- `npm run check` passed.
- `npm run build` passed. The existing `AdminResearchHome` mixed static/dynamic
  import warning remains unchanged.
- Browser review passed at 1440, 1024, 768, 430, 390, 375, 360, and 320 CSS
  pixels. All nine surfaces also passed at 320 CSS pixels and at the 640 CSS-
  pixel equivalent of 200% zoom, with no page overflow, clipped surfaces, or
  button-style controls below 44 pixels.

## Controlled integration order

1. Merge the completed Claude/Fable backend branch at
   `42a318303ff4dc522eceeadf1cb6f9fa8e634137` into a release-authorized
   integration branch.
2. Merge this Codex UI branch. It already includes the shared checkpoint
   `cb5a14c4174ae60adc16c0b20d0ae83c3e44e43b` as merge ancestry, so Git should
   recognize the common contracts and fixtures.
3. Follow the protected server-composition instructions in Claude's exact-SHA
   handoff; do not mount or deploy directly from either lane.
4. Before release, adjudicate the global Research review gate, post-sign-in
   `/research/account/*` return allowlist, account-family chrome, and the
   authorized document-download endpoint. The current client handles missing
   or unavailable data honestly, but these integration seams are intentionally
   outside this leased UI lane.
5. Replace review-only demand statuses with the audited activation overlay from
   the Claude gap report, then run the full suite and end-to-end member flows.

No production deploy, database application, invitation, support send, catalog
activation, or real customer data operation was performed.
