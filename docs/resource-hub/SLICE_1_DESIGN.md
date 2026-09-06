# Resource Hub V1 (Slice 1) — design record and as-built notes

Task `RECRUITER-RESOURCE-HUB-V1-20260906`, branch `fable/recruiter-resource-hub-20260906`,
base integration head `096d70c` (2026-09-06). Founder brief: "Recruiter Workspace and
Resource Hub" (build brief PDF + master prompt, 2026-09-06). This slice only.

## What Slice 1 delivers

An authorized admin uploads a real PDF, assigns audience and usage policy, reviews the
exact version, publishes it; a signed-in partner in the audience lists, reads and
downloads it through the server; anyone outside the audience cannot list it, learn its
title or count, or fetch bytes; the partner Resources page stops claiming that
everything it lists is cleared for sharing.

## Canonical systems reused (no second authority)

| Need | Reused authority | Where |
| --- | --- | --- |
| Identity, session, partner resolution | member guard → `memberIdOf` → `port.findPartnerForMember` (`withPartner`) | `server/research/partners/portal-routes.ts` |
| Partner-facing envelope | `{ ok, ...payload }` / `{ ok:false, code }` via the portal's `ok`/`deny` helpers | `server/research/partners/portal-routes.ts` |
| Admin authority | injected `requireSupabaseAdmin` (lifecycle-admin pattern); actor read from `req.adminEmail` only | `server/routes.ts`, `server/research/index.ts` |
| Delivery discipline | Document Center rules: storage path never serialized; session required; entitlement re-read at use time; server-streamed bytes; memory / not-configured byte store selection | `server/research/documents.ts` |
| Upload limits | 15 MiB, PDF only, judged by bytes | `server/research/resource-hub/service.ts` |
| Audience vocabulary | `PartnerRole` from the distribution contract (no recruiter role is added) | `shared/research/distribution.ts` |
| Private bucket pattern | proof-bucket privacy migration (converge `public=false` and assert) | `supabase/candidates/20260906120000_research_resource_library.sql` |

## New pieces (as built)

- `shared/research/resource-hub/contract.ts`: usage policies (external_share / private /
  training / draft), version states, audience, DTOs, zod inputs, literal paths, and the
  upload transport helpers (`encodeResourceUploadMetadata` / `decodeResourceUploadMetadata`).
- `server/research/resource-hub/`:
  - `store.ts` — port interface + deterministic in-memory store;
  - `supabase-store.ts` — the same port over the candidate tables (service-role queries,
    every provider error thrown, immutable bytes identity never patched);
  - `bytes-store.ts` — memory / not-configured / Supabase Storage (private bucket
    `research-resource-library`, write-once objects);
  - `service.ts` — byte validation, versioning, review/publish/withdraw transitions,
    audience filtering, delivery with the outcome ledger;
  - `admin-routes.ts` — five literal admin doors behind the injected guard;
  - `production.ts` — flag-gated composition (`RESEARCH_RESOURCE_HUB_ENABLED`), dark by
    default in production, one shared in-memory composition elsewhere;
- `scripts/preview-resource-hub.ts` — PREVIEW ONLY browser harness (refuses `NODE_ENV=production`;
  under `scripts/` like `preview-account-portal.ts`, outside the route scanner's census).
- Partner portal seat (`server/research/partners/portal-routes.ts`): the existing
  `GET /api/research/partner/resources` door now answers the hub library for the resolved
  partner's role and state (`ResourceLibraryResponse`), and one new door
  `GET /api/research/partner/resources/:resourceId/download` streams bytes after the hub
  re-checks entitlement. Both ride the same `withPartner` resolution as every other
  portal door. The legacy `approvedLibrary()` port method is untouched and no longer
  read by the door (documented in `portal-production.ts`).
- Research seam (`server/research/index.ts`): one registration line mounts the admin
  doors behind `requireSupabaseAdmin`; the protected-seam hash is re-pinned with a
  journal entry in `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`.
- Client: `Resources.tsx` rewritten on the shared DTO (usage badges, purpose, audience,
  version, size, Download only when `actions.download`, honest empty / pending / error
  states, "cleared for sharing" copy removed); admin page `/admin/research/resource-hub`
  (upload, version history, request review / approve with reason / publish / withdraw with
  reason, admin preview); nav entry under "Content & partners".
- Migration candidate (NOT applied): `supabase/candidates/20260906120000_research_resource_library.sql`
  — `research_resource_library`, `research_resource_versions`, `research_resource_deliveries`,
  immutability trigger, RLS enabled with no policies (service role only), private bucket.

## Upload transport (changed during the build)

The first design carried the PDF as base64 inside JSON. Production's global JSON body
limit is 2 MB (`server/index.ts`), so that transport would have failed in production for
any real material over ~1.4 MB. The shipped transport is:

- request body = the raw PDF bytes, `Content-Type: application/pdf`, parsed by a
  route-level `express.raw` with the contract's ceiling (the global JSON parser ignores it);
- metadata = one ASCII header `x-xenios-resource-upload` carrying base64url-encoded UTF-8
  JSON (bounded at 4 KiB decoded), validated with the same zod schema on the server —
  the shape Dropbox's content-upload API uses for `Dropbox-API-Arg`;
- the admin guard runs BEFORE the body parser, so an unauthenticated caller cannot make
  the server buffer a file; an over-limit body answers 413 in the hub's own vocabulary.

## Rules encoded

1. Bytes are immutable per version; a new upload is a new version row and a new object key.
2. Publish requires validation ok and a recorded content approval by an admin actor; only
   one published version per resource; the previous one becomes `superseded`.
3. A version labelled "Draft / review required" (usage policy `draft`) can never be
   published; the admin page does not offer the action and the server refuses it (409).
4. `withdrawn` denies ordinary delivery immediately; prior bytes remain auditable.
5. Draft/quarantined/in_review/superseded/withdrawn versions are never listed to partners;
   suspended and terminated partners see an empty library.
6. Listing and delivery apply the same audience check server-side; delivery re-reads the
   published state, policy, and audience at use time and records every attempt
   (`delivered` / `denied` / `failed`) so failures never count as downloads.
7. No response carries a storage key, signed storage URL, admin email, review reason, or
   idempotency key; the download filename is `<resourceId>-v<n>.pdf`, never the title.
8. External sharing is a Slice 3 capability; V1 offers no share action even for
   `external_share`, but records the policy so the label is truthful.
9. A rejected upload (wrong bytes, oversize, active content, bad name, wrong declared type)
   writes no row and no object; uploads are idempotent per key.

## Hardening after the adversarial review (same day)

A seven-lens adversarial review (authorization, leaks, transport, state machine, SQL,
release gates, client) with refuters and reproducers ran over the slice. What it found,
and what changed:

- **Delivery ledger vs unknown ids (P1, confirmed).** Over Postgres the ledger's foreign
  key rejected the denial row for an unknown resource id, turning the uniform 404 into a
  503 existence oracle. Now: no ledger row is written for an unknown resource; denial rows
  are best-effort (a ledger hiccup never changes the answer); a completed delivery still
  requires its row. Non-uuid ids short-circuit to "not found" in the Supabase store
  without a query (`isCanonicalUuid`), on partner and admin doors alike.
- **Non-atomic publish / withdraw (P2).** The three-write publish and two-write withdraw
  became single store operations backed by two SQL functions in the candidate migration
  (`research_resource_hub_publish`, `research_resource_hub_withdraw`, row-locked, service
  role only); the in-memory store applies the same effects together. `publish` on a
  published-but-not-current version converges instead of dead-ending (repair path).
- **Version-number race (P2).** A unique-constraint race on insert is a typed
  `ResourceHubConflict` answered as 409, never a 503. The already written object is keyed
  by the losing version id, so it can never be served; it is orphaned, not published
  (bytes are written before the row on purpose: a row without bytes would be worse).
- **Store parity (P3).** Both stores apply exactly `MUTABLE_VERSION_FIELDS` on a patch.
- **Active-content scan (P2/P3).** The scan now decodes `#xx` name escapes, inflates every
  FlateDecode stream (object streams included) within bounds and scans inside, refuses
  encrypted files and streams it cannot inflate, and names the marker it found. It remains
  a first-line filter, not a sandbox; Slice 5 (reviewed intake) keeps human review.
- **Idempotency key bound to one file (P3).** The same key with different bytes or a
  different filename is refused (409) instead of replaying the earlier version; the admin
  page also mints a new key whenever any form field or the chosen file changes, and keeps
  the key across network failures and 503s so a retry cannot duplicate a version.
- **Admin page honesty (P2/P3).** "Approve content" is offered only while no approval is
  recorded; the copy no longer describes a quarantine the server never produces; the
  summary shows withdrawn versions instead of an always-zero quarantine count; the partner
  download's 403 copy no longer claims a role decision the server does not make.
- **Release gate (P1, confirmed).** The preview harness had been placed under `server/`,
  where the route census scans; it now lives in `scripts/preview-resource-hub.ts`.

## Production activation (not part of this slice)

The composition is dark until both are true, each a separately approved production change:
1. the candidate migration is applied (tables, trigger, RLS, private bucket) and promoted
   into `supabase/MIGRATIONS.md` / `MIGRATION_DAG.json`;
2. `RESEARCH_RESOURCE_HUB_ENABLED=true` is set on the service.
Until then every admin door answers 503 `resource_hub_unavailable` and the partner library
is empty (what production shows today). The partner portal itself stays behind the
existing affiliate-portal mount gate, and the research API wall admits `/partner/*`
reads the way it admits the other sixteen portal doors (public mode or the wall's
existing admission), which this slice does not change.

## Evidence (local preview harness, `scripts/preview-resource-hub.ts`)

- API proof journal: `C:\Users\sboad\projects\xenios-qa-evidence-resource-hub-20260906\api-proof-journal.json`
  (real admin guard through the harness's GoTrue-shaped stub; real partner registrar).
- Nine-width headless sweep (320…1920) of the partner library (rep / suspended / no-partner)
  and the admin hub (admin / forbidden as partner): `…\screens\*.png` + `width-sweep-journal.json`.
- Interactive browser journey (in-app browser): partner sign-in → library → Download
  (`GET …/download` 200, `application/pdf`); admin sign-in → Request review → Approve
  (reason) → Publish → admin preview 200; rep session on the admin page → "Access denied".

## Not in Slice 1

Recruiter capability (Slice 2), kits and external sharing (Slice 3), follow-ups
(Slice 4), content intake of real materials (Slice 5), production migration apply,
deployment, audience grants to real people, notifications, metadata edits of an existing
version (upload a new version instead).
