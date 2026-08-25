# Hollywood Hino public microsite release

- Production URL: https://xeniostechnology.com/hino/
- Candidate SHA: `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`
- Render deploy: live from the exact candidate SHA on 2026-08-25
- Scope: isolated static microsite under `client/public/hino/**`; existing Xenios SPA, API, build, package, and server runtime files unchanged
- Pages: 14 canonical Hino pages plus 2 compatibility aliases
- Media: requested profile image is the first/hero image, five supplied non-Getty assets are present, and the Getty-marked image is excluded
- Catalog: 127 supplied research entries at retail reference pricing; 126 priced and BAM15 marked price pending; wholesale/internal economics excluded
- Video: all three supplied YouTube videos use click-to-load `youtube-nocookie.com` embeds
- Contact: local-only inquiry preview; no external form submission is enabled
- Indexing: public and shareable, with `noindex, nofollow` retained pending final rights/copy/legal approval

## Verification

- Focused tests: 40 passed
- Release control plane: 35 passed, 1 skipped
- TypeScript: passed
- Production build: passed
- Route uniqueness: passed (396 registrations across 387 call sites)
- Core-site protection verifier: passed against the deployed production base
- Live health: `/api/health` HTTP 200
- Live routes/assets: all canonical Hino routes, aliases, and five assets HTTP 200; `/hino` redirects to `/hino/`
- Live catalog DOM: 127 rows and BAM15 price pending
- Live media DOM: three privacy-gated players; first opens the expected `youtube-nocookie.com` embed
- Live desktop/mobile browser QA: passed with no Hino console warnings/errors and no horizontal overflow
- Existing `/` and `/research` smoke checks: HTTP 200 and no Hino layout injection
- Render error logs since deployment start: none

## Rollback point

Previous live SHA: `df16b3639fbe49f39aee744d0823d01474580026`.
