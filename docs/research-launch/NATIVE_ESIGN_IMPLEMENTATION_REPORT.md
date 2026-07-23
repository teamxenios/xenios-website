# Native embedded e-signature: implementation report

Branch: `feature/native-embedded-esign-main`, based directly on current `main`.
The branch contains only the native e-signature implementation (its diff against
`main` is the native files, not any prior PR history). The exact final commit SHA
is supplied in the draft pull request and the final handoff, not embedded here.
Status: complete on the feature branch. **Not merged, not deployed, no production
flag enabled, no production SQL run, no secret created, no Render or production
Supabase change.**

## Primary outcome (met)

A Xenios Research member reviews and signs every required membership agreement
WITHOUT leaving the activation page: no new browser tab, no redirect to
OpenSign, no OpenSign account, no OpenSign API token, no MongoDB, no iframe, no
second website, no second Render service, no external e-signature subscription.
OpenSign was used only as an architectural reference; no AGPL source was copied.

## Architecture

The native path reuses the existing Xenios agreement engine as the source of
legal truth and adds only the signing interface, PDF evidence, certificate, and
private archival. Signing execution is native, built on permissively licensed
libraries.

- The member signs in the embedded UI. The authenticated POST to
  `/api/research/activation/esign/native/sign` IS the completion. There is no
  remote session, no signing URL, and no webhook.
- The server records the LEGAL signature through the existing
  `SignatureService` (every guard), generates the signed PDF + completion
  certificate, hashes both, stores them in the existing private bucket, and
  writes the durable signing-request + archive records the document centers
  read. The native signature satisfies the SAME activation gate as before.

### Completion state machine (not claimed fully atomic)

A native signing request moves through an explicit state machine:
`preparing` -> `evidence_stored` -> `completed`, or -> `failed_cleanup_required`
on a commit failure. ONLY `completed` may satisfy the activation gate, appear as
signed in the member interface, appear in the document center, or produce a
member or admin download URL. This is enforced in code: the member and admin
document views and the download route all gate on the completed state (native
requests require `nativeCompletionState === "completed"`), and the activation
gate reads the legal `SignatureRecord`, which is inserted only at the completion
step.

The order per signing request:

1. every legal guard in `SignatureService` (never duplicated or weakened),
2. signed-PDF generation,
3. completion-certificate generation,
4. both private uploads,
5. the request is persisted as `evidence_stored` (a durable, NON-activating
   recoverable record: the signed PDF is uploaded but no legal signature yet),
6. the legal `SignatureRecord` is inserted (the commit point),
7. the request is transitioned `evidence_stored -> completed`, binding the
   version, hashes, refs, and the signature id, and the archive projection is
   written.

Steps 2-5 run inside a `SignatureService.sign(..., { beforeCommit })` hook, so
the signature (step 6) is inserted only after they succeed; if any of them
fails, the signature is never inserted and the agreement stays unsigned. A
failure at step 6 (the final signature insert) leaves the request in
`evidence_stored` with no signature, then marks it `failed_cleanup_required` so
the uploaded objects can be swept; the agreement is unsigned, activation is
blocked, the request is never presented as completed, no download URL is issued,
and no archive entry exists (the archive is written only at step 7). A retry
reuses the evidence and converges to exactly one completed signature and request.

HONESTY ABOUT ATOMICITY. The legal `SignatureRecord` (step 6) and the request
completion transition (step 7) are two writes across two stores (the signatures
table and the esign-requests table); they are NOT performed in one PostgreSQL
transaction or Supabase RPC, so this flow is NOT described as fully atomic. What
the state machine guarantees is that no NON-completed state is ever presented as
completed, and that a failure before or at the signature commit leaves no
completed state. If the completion transition (step 7) fails after the signature
commits, the request stays `evidence_stored` and is reconciled to `completed` on
the next call (the replay path detects the existing signature and finalizes the
request) or by a sweeper; the agreement is legally signed either way. Making
steps 6 and 7 a single transaction would require a Supabase RPC over both tables
and is the documented path to a fully atomic claim.

Idempotency: the signing-request id is derived deterministically from
(member, idempotency key), so a retry upserts the same row rather than orphaning
a new one; the signature's own (member, version) uniqueness admits exactly one
signature; and a concurrent same-key racer is reconciled to the winner's row.
An idempotency key is bound to its document version: reusing it for a different
document returns a 409 conflict, never a replay of the first document.

Orphan cleanup: on a signature-commit failure the request is marked
`failed_cleanup_required`; the uploaded signed-PDF and certificate objects are
durably marked for cleanup by that state (a sweeper deletes objects for requests
stuck in it), and a retry reuses the same deterministic storage paths so it
overwrites rather than multiplies.

### Feature-flag fallback

The activation status (`GET /api/research/activation/status`) reports
`embeddedEsignEnabled`, computed from `RESEARCH_ESIGN_ENABLED`. The agreements
page reads it and renders the embedded signer when true or the existing
`AgreementSignCard` (native clickwrap) path when false, decided from the fetched
status BEFORE any signing attempt. A rollback of the flag takes effect on the
next status load; already-signed agreements stay readable in either path.

### Drawn-signature validation and request limits

The drawn signature is a trimmed-canvas PNG. The server validates it: strict
base64, real PNG magic bytes, a decoded-size cap (1 MB), and image-dimension
bounds (2000x1000); a malformed, non-PNG, or oversized payload is refused with a
precise 400 (`signature_invalid` / `signature_too_large` / `signature_dimensions`)
and the payload is never logged. The JSON body limit is set explicitly to 2 MB
(server/index.ts), which admits the permitted payload with headroom while still
rejecting a genuinely oversized request with 413.

## Files changed

New (server):
- `server/research/membership-activation/esign/pdf.ts` (+ `.test.ts`) —
  `XeniosPdfGenerator` (pdf-lib): the signed agreement PDF and the completion
  certificate. Pure over inputs; no env, no network, no secret.
- `server/research/membership-activation/esign/native.ts` (+ `.test.ts`) —
  `NativeEsignService.completeNativeSignature`.

Changed (server):
- `server/research/membership-activation/esign/contracts.ts` — additive:
  `esign_document` / `esign_packet` modes (opensign_* kept), `isNativeMode`,
  `XENIOS_NATIVE_PROVIDER`, native signature-evidence + input types, and the
  injected `PdfGenerator` seam.
- `server/research/membership-activation/production-deps.ts` — constructs the
  native service, wires the PDF generator, adds `esign.nativeSign` and the
  member-scoped `esign.documentDownloadUrl`, and enables the native path by
  `RESEARCH_ESIGN_ENABLED` alone.
- `server/research/membership-activation/routes.ts` (+ `.test.ts`) — the two
  native routes and their wire validation.

New / changed (SQL):
- `supabase/research-fm-esign.sql` — the mode check now includes the native
  modes (fresh installs).
- `supabase/research-fm-esign-native.sql` — additive migration for an
  already-applied database: widens the `mode` check constraint to the native
  modes. No destructive DDL, safe to rerun, RLS unchanged.

New / changed (client):
- `client/src/research/pages/member/EmbeddedAgreementSigner.tsx` (+ `.test.tsx`)
  — the embedded signer.
- `client/src/research/adapters/esign.ts` — `signNativeAgreement`,
  `getMemberEsignDownloadUrl`.
- `client/src/research/pages/ActivationPage.tsx` — the agreements step routes
  through the embedded signer (the existing `AgreementSignCard` kept as a
  fallback).
- `client/src/research/pages/member/DocumentCenter.tsx` (+ `.test.tsx`) — per
  request "Download signed PDF" / "Download certificate" via short-lived member
  URLs; the raw storage path is never rendered.

## Dependencies added (with licenses)

| Package | License | Where | Why |
| --- | --- | --- | --- |
| `pdf-lib` @1.17.1 | MIT | server | signed-PDF + certificate generation |
| `react-signature-canvas` @1.0.7 | Apache-2.0 | client | drawn signature canvas |
| `@types/react-signature-canvas` | MIT | dev | types for the above |

No OpenSign source was vendored. No AGPL code is in the repository.

## SQL migration order

For a database that already ran the founding-membership bundle (e.g. the
staging project): run `supabase/research-fm-esign-native.sql` once (idempotent).
For a fresh database: the founding-membership bundle plus
`supabase/research-fm-esign-native.sql`; the base `research-fm-esign.sql` already
carries the native modes, and the additive migration is then a no-op
re-statement. No new table is required: the native path reuses
`research_fm_esign_requests` (mode `esign_document`, provider `xenios_native`)
and `research_fm_esign_archive`.

## Feature flags

- `RESEARCH_ESIGN_ENABLED` (default `false`) — enables the e-signature surface.
  The native path is enabled by this flag ALONE; it needs no OpenSign
  credential, so it runs independently of the OpenSign provider. With the flag
  off, every native endpoint fails closed (`capability_disabled`), and while
  founding activation itself is off the routes are byte-silent (stateGate).
- `RESEARCH_ESIGN_PROVIDER` selects the OpenSign provider path; it does not gate
  the native path.

## Required environment variables

- `RESEARCH_ESIGN_ENABLED=true` to turn the surface on.
- `RESEARCH_ESIGN_BUCKET` (a PRIVATE Supabase Storage bucket, dashboard-created)
  to store native signed PDFs + certificates. In dev/test the in-memory media
  provider is used, so no bucket is needed to build or test.
- No OpenSign variables are needed for the native path.

## Tests and results

- Full suite: **2942 passed / 124 files** (0 failures, 0 skips).
- Typecheck (`npm run check`): **0 errors**. Build (`npm run build`): **success**.
- Dependency license check: pdf-lib (MIT), react-signature-canvas (Apache-2.0),
  and their transitive deps are all permissive; no GPL/AGPL anywhere.
- Secret scan of the diff vs `main`: clean; the native modules read no env, make
  no network call, and reference no OpenSign credential.
- Atomic-completion coverage (this correction): PDF-generation failure,
  certificate-generation failure, signed-PDF storage failure, certificate
  storage failure, request-record failure, and the FINAL SignatureRecord insert
  failure each leave the agreement unsigned; the final-insert-failure test also
  proves the request is not completed, is marked `failed_cleanup_required`, is
  not listed, and is not downloadable, that a retry converges to exactly one
  completed signature and request, and that the gate reads the committed
  signature (not merely uploaded evidence).
- New coverage against the 16 required scenarios:
  1. typed signature completes without leaving the flow (native service +
     routes) — yes.
  2. drawn signature completes (native service + client) — yes.
  3. refused when the document is not published — yes.
  4. refused when `fullDocumentShown` is false — yes.
  5. refused when `affirmativeConsent` is false — yes (service + route).
  6. arbitration refused without its separate acknowledgment — yes.
  7. release/waiver refused without its separate acknowledgment — yes.
  8. another member cannot access the signed PDF (ownership) — yes (route:
     member B gets 404).
  9. duplicate submission replays, no second record — yes.
  10. PDF and certificate hashes are persisted — yes.
  11. a signed agreement appears in the document endpoint / center — yes
      (server documents endpoint + client DocumentCenter test).
  12. activation does not advance until all required agreements are complete —
      yes (route: partial vs full).
  13. no OpenSign API credential is required — yes (native runs with the
      OpenSign provider Disabled and no OPENSIGN env).
  14. no external network call in the native provider — yes (structural:
      native.ts + pdf.ts read no env, import no http/fetch; the OpenSign session
      is never called during a native sign).
  15. `RESEARCH_ESIGN_ENABLED=false` still fails closed — yes.
  16. the native provider is enabled independently through configuration — yes.
- Client: 7 embedded-signer tests + document-center download; nothing prechecked
  on mount; capability_disabled shows an honest state.

## Security and privacy findings

- No secret, service-role key, access token, encryption key, Supabase URL, or
  payment identifier appears in any generated PDF, certificate, log, API
  response, or client bundle. `native.ts` and `pdf.ts` read no `process.env`,
  make no network call, and reference no OpenSign env (verified by scan).
- Identity is always the authenticated member context; the member id is never
  read from a request body, query, or route parameter.
- IP and user agent are stored only as SHA-256 hashes (via the existing
  signature engine), and the certificate states this plainly.
- Downloads are short-lived signed URLs after authorization; a member can reach
  only their OWN documents (absent and not-yours return the same 404, so
  ownership is not probeable); no permanent public URL; no public bucket.
- Append-only signature records, idempotency, immutable content hashes,
  published-document-only signing, electronic-record-consent-first, and the two
  separate acknowledgments are all preserved (the native path reuses the engine
  that enforces them). No admin-on-behalf signing path exists. Activation never
  advances on client state or navigation, only on the persisted signature and
  the server response.

## Known risks

- The signed PDF renders the exact published agreement text; if a published
  document contains characters outside the PDF font's WinAnsi range, the
  generator sanitizes them to safe equivalents (it never throws). Review the
  rendered PDF of each real agreement during QA.
- `RESEARCH_ESIGN_BUCKET` must be created PRIVATE before enabling the flag in
  any real environment; the in-memory provider is dev/test only.
- The native archive row is a post-signature recoverable projection: it is
  written only after the signature has committed (so an archive-write failure
  cannot leave an activation-satisfying signature without evidence), and the
  signing-request row already carries the refs and hashes. A failed archive
  write is therefore non-fatal and recoverable, not a data-loss path.

## Manual QA instructions

1. On a scratch/staging deploy, set `RESEARCH_ESIGN_ENABLED=true`, create a
   private `RESEARCH_ESIGN_BUCKET`, and run `research-fm-esign-native.sql`.
2. As an approved test member, open `/research/member/activation` and reach the
   agreements step. Confirm the full contract renders in-page, "Agreement N of
   M" progress is shown, and nothing is prechecked.
3. Type a legal name and a typed signature; sign and continue. Confirm the
   success state and advance to the next agreement.
4. On another agreement, draw a signature; confirm it submits.
5. For arbitration and the release/waiver, confirm the separate acknowledgment
   is required.
6. Complete all agreements; confirm the activation gate advances.
7. In the Document Center, download the signed PDF and the certificate; confirm
   they open and contain the agreement text, version, hashes, and the signature.
8. Sign in as a different member; confirm you cannot download the first member's
   document.

## Production rollout sequence (Samuel-executed; do not run from here)

1. Merge the branch only after review (this report does NOT merge it).
2. Apply `research-fm-esign-native.sql` to the target database.
3. Create the private `RESEARCH_ESIGN_BUCKET`.
4. Set `RESEARCH_ESIGN_ENABLED=true` in the deployment environment.
5. Run the manual QA above against the deploy before announcing.

## Rollback sequence

- Set `RESEARCH_ESIGN_ENABLED=false`: the native endpoints immediately fail
  closed AND the activation status reports `embeddedEsignEnabled: false`, so the
  agreements page renders the existing native `AgreementSignCard` clickwrap path
  on the next load, with no failed signing attempt required. Already-signed
  agreements remain readable. No code rollback is needed for the flag rollback.
- The SQL migration only widened a check constraint; it stores no data of its
  own and leaves existing rows intact. It does NOT need to be reverted to
  disable the feature (the flag does that). If a full schema revert is ever
  required, narrow the mode check back to the five prior modes only after
  confirming no row uses a native mode (query `research_fm_esign_requests` for
  `mode in ('esign_document','esign_packet')`); this is optional and unrelated
  to turning the feature off.
- To remove the code, revert the feature commits on the branch (nothing has been
  merged to `main`).

## Verdict

CODE READY on the feature branch, subject to review and CI. Production readiness
depends on the private bucket, the flag, and the manual QA, all Samuel's. No
merge, deploy, production SQL, or secret creation was performed.
