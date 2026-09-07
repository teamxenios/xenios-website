# RESOURCE HUB V1 (SLICE 1) — EXACT-SHA HANDOFF

Task `RECRUITER-RESOURCE-HUB-V1-20260906` · session `fable-recruiter-resource-hub-20260906`
· branch `fable/recruiter-resource-hub-20260906` · base integration head `096d70c`.

**PRODUCTION WAS NOT MUTATED.** No deployment, no migration apply, no env change, no
customer message, no Care/partner/payment fact. The candidate migration is NOT applied.

## Commits

- Code: `f6276fc9dfb70cf194f8a1594ecb8c5b56de3821` — Resource Hub V1 (contract, server, partner doors, admin doors,
  client pages, tests, candidate migration, seam re-pin, census re-pin, design record).
- Code follow-up: `a31d40fd90d843b0f3fe7e6f7a0791133b25ec4f` — scan judges PDF structure, not printed
  text (the adversarial review's reproduced false-positive).
- Code follow-up: `b28a3e3cd809724fd70b2ec3006db6e36c76b253` — scan inflates only object streams
  (measured on 494 real PDFs: 483 accepted, 11 policy refusals). **This is the handoff SHA.**
- Continuity: the commit carrying this handoff and the session/task records (one after the handoff SHA).

## What is done (Slice 1 acceptance, founder brief 2026-09-06)

- Admin uploads a real PDF (raw `application/pdf` body + base64url-JSON metadata header;
  judged by bytes: magic, size ≤ 15 MiB, no active content, safe filename; rejected uploads
  write nothing), assigns audience (`all_partners` or a `PartnerRole`) and usage policy
  (`external_share` / `private` / `training` / `draft`), sends the exact version through
  request review → approve (reason recorded) → publish; withdraw with reason; new versions
  supersede; a `draft`-policy version can never be published.
- A signed-in partner in the audience lists (`GET /api/research/partner/resources`, now
  `ResourceLibraryResponse`) and downloads (`GET …/resources/:resourceId/download`, new,
  same `withPartner` resolution) through the server; entitlement is re-read at delivery
  and every attempt is recorded (delivered / denied / failed). Disallowed roles, suspended
  or terminated partners, unpublished/withdrawn/draft-policy versions: 404 `not_found`
  (never 403), empty library. No storage key, signed storage URL, admin identity, review
  reason or title ever leaves the server; V1 renders no share action.
- The partner Resources page no longer claims everything listed is cleared for sharing;
  admin page `/admin/research/resource-hub` (nav "Content & partners → Resource Hub").
- Production composition is dark until BOTH the candidate migration
  `supabase/candidates/20260906120000_research_resource_library.sql` is applied and
  `RESEARCH_RESOURCE_HUB_ENABLED=true` is set (while dark: admin list empty, item reads 404,
  every write or byte read 503 `resource_hub_unavailable`; partner library empty, exactly
  today's behaviour).

## Hardening from the adversarial review (7 lenses, refuters + reproducers)

- P1 confirmed: over Postgres the delivery ledger FK rejected the unknown-resource denial
  row, turning a uniform 404 into a 503 existence oracle. Fixed: no ledger row for an
  unknown resource; denial rows best-effort; a completed delivery still requires its row;
  non-uuid ids short-circuit to not-found without a query on partner and admin doors.
- P2: publish/withdraw were multi-write and non-atomic. Fixed: single store operations
  backed by two row-locked SQL functions in the candidate migration; a published-but-
  not-current version converges on re-publish (repair path).
- P2: version-number race → typed 409 conflict, never 503; the orphaned object can never be served.
- P2/P3: active-content scan now decodes #xx name escapes, inflates FlateDecode OBJECT
  streams (/ObjStm, the only stream kind parsed as dictionaries) within bounds and scans
  inside, refuses encrypted files and uninflatable object streams, names the marker found,
  blanks string literals before matching (printed text is not structure), and refuses
  /OpenAction only with an action dictionary or indirect reference. Measured on the 494
  PDFs in the founder's Downloads: 483 accepted, 11 refused for stated policy reasons
  (embedded files, JavaScript, encryption, unjudgeable /OpenAction reference, filename
  rule); 12/12 synthetic controls (8 negative, 4 benign positive) hold —
  `scanner-real-pdfs.json` in the evidence folder (names, sizes, verdicts only).
  First-line filter, not a sandbox (documented).
- P3: idempotency key bound to one file (same key + different bytes/name → 409); admin page
  mints a new key when any field or the file changes; keeps the key across network errors
  and 503s.
- P2/P3 client honesty: no second "Approve content" after approval; quarantine copy and
  always-zero quarantine count removed (withdrawn count instead); 403 download copy fixed.
- P1 confirmed: the preview harness sat under server/ where the route census scans; moved
  to scripts/preview-resource-hub.ts (like preview-account-portal.ts).
- Both stores apply exactly MUTABLE_VERSION_FIELDS on a patch (parity).

## Gates and pins moved (each deliberate, each documented)

- `server/research/index.ts` (protected Research seam): +3 imports, +1 registration line;
  `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` re-pinned
  `729a778132ba…` → `3b604fadd7db…` with a journal entry (byte-preserving text patch).
- Route census `server/release-control-plane.test.ts`: 418/427 → 424/433 (+5 admin literal
  doors, +1 partner delivery door).
- `server/research/partners/portal-routes.test.ts`: PARTNER_PORTAL_PATHS 16 → 17; resources
  payload key `assets` → `resources`.
- `client/src/research/ui/admin-shell.test.tsx`: 7 groups unchanged, links 29 → 30.
- No dependency added; no other protected file touched; no test deleted or skipped.

## Verification

- `npx tsc --noEmit -p tsconfig.json`: clean. `npm run build`: clean.
- Focused vitest (16 files): resource-hub (service, admin-routes, supabase-store, production),
  partner portal routes (+8 hub tests) and portal service, research walls / frontdoor /
  capabilities / account-access wall, core-site protection, release control plane (census),
  client Resources, ResourceHubAdmin, admin-shell, routes-parity — 518 passed, 1 skipped (at b28a3e3c).
- API proof on the local preview harness (real admin guard via GoTrue-shaped stub, real
  partner registrar, re-run against the handoff SHA on 2026-09-07): 56/56, including six scanner
  negatives (hex-escaped name, script in a compressed object stream, encryption, embedded file,
  launch action, indirect /OpenAction) and three benign positives —
  `C:\Users\sboad\projects\xenios-qa-evidence-resource-hub-20260906\api-proof-journal.json`.
- Browser: interactive journey (sign-in → library → download 200; admin sign-in → request
  review → approve → publish → admin preview 200; rep on admin page → forbidden; affiliate /
  suspended / no-partner states) — `browser-journey-journal.md`; nine-width headless sweep
  (re-run against the handoff SHA) 45/45 captures, zero horizontal overflow, zero console
  errors on hub pages — `screens/*.png`, `width-sweep-journal.json`.
- Adversarial review workflow (7 lenses × 2 refuters + 1 reproducer per finding; 64 agents,
  two runs because of session limits): 18 candidate findings. Confirmed and fixed before the
  handoff SHA: P1 ledger/404-vs-503 oracle, P1 preview harness inside the route census, P3
  scanner false positives (reproduced on real LibreOffice files). Fixed on the finders' word
  without a completed independent verification (their verifiers hit the session limit; B is
  asked to look): non-atomic publish/withdraw, version-number race, store patch parity,
  #xx-escape / compressed-stream bypass, idempotency replay with different bytes, client key
  retention and double-approve, quarantine copy, 403 copy, manifest wording. Refuted by
  verification: none of the confirmed ones; the refuters' own scan repro files were removed.

## Needs from A (integrator, sole `.xenios` writer)

- Record the task/session lease for `RECRUITER-RESOURCE-HUB-V1-20260906` (my `.xenios`
  edits on this branch are the proposal; take them or replace them).
- Acceptance review of the seam re-pin and census pin; merge decision is A's.
- When promoting the candidate migration: add its row to `supabase/MIGRATIONS.md` and
  `MIGRATION_DAG.json`; production apply + `RESEARCH_RESOURCE_HUB_ENABLED=true` are two
  separate founder-approved production changes.
- Observations for the partner shell / sign-in (P3, not hub): sub-nav first item clipped at
  ≤414 px; `returnTo` after sign-in landed on `/research/account` in the harness.

## Next (Slice 2, not started)

Recruiter capability without purchase: needs a role/CHECK decision (recruiter is NOT a
`PartnerRole`; distribution contract forbids recursive downlines and recruiting compensation),
a `research_partner_sourcing` table via a new `PartnerOperationInput` action, candidates,
recruitment source links that never write attribution tables, direct assignments, admin
review. Then Slice 3 kits/sharing, 4 follow-ups, 5 reviewed content intake (22 candidates
need source bytes; never auto-publish), 6 integrated release + ten-page as-built report.

## Cleanup

Preview harness process stopped; headless Chromium stopped; scratch files outside the
checkout; evidence outside the checkout.
