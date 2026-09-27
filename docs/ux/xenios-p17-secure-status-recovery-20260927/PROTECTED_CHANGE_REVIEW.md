# Protected change review

The owner explicitly authorized the narrow P-17 status page, notification,
server seam and three copy-consistency corrections. Review was performed against
the frozen parent runtime `5dcbc45f49a753bb857b8f6f035e83d212bd9648`.

Protected full-file changes are limited to:

- `client/src/index.css`: scoped status card/timeline presentation.
- `client/src/pages/Home.tsx`: exact approved Care availability sentence.
- `server/static.ts`: `/status` no-store/no-referrer and removal of third-party
  font links from this sensitive document.
- `server/index.ts`: additive mount of the four bounded endpoints before the
  existing Research wall, using the existing rate limiter and outbox.

The manifest records the new LF-normalized hashes and the server seam rationale.
Route census is 453 finite registrations across 444 call sites with zero
duplicates. No protected authority, provider, feature default, commerce flag,
Care write path, account boundary, admin boundary or deployment configuration is
widened. `server/core-site-protection.test.ts` and the release-control tests pass.
