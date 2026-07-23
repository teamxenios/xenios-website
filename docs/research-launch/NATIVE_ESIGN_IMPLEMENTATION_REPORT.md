# Native embedded e-signature: implementation report

Branch: `feature/native-embedded-esign` (off `65c9cc5`, the release candidate).
Head: `9e98eec`. Status: complete on the feature branch. **Not merged, not
deployed, no production flag enabled, no production SQL run, no secret created.**

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

- Full suite: **2923 passed / 124 files** (0 failures, 0 skips).
- Typecheck (`npm run check`): **0 errors**. Build (`npm run build`): **success**.
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
- Reusing the OpenSign archive record shape means a native archive-row write
  that fails is non-fatal (the signing-request row carries the refs and hashes;
  the document endpoints read both). Documented, not a data-loss path.

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
  closed and the activation flow falls back to the existing native
  `AgreementSignCard` path; no code rollback needed.
- The SQL migration only widened a check constraint; it stores no data of its
  own and leaves existing rows intact. If a full revert is ever required, narrow
  the mode check back to the five prior modes only after confirming no row uses
  a native mode (query `research_fm_esign_requests` for `mode in
  ('esign_document','esign_packet')`).
- Revert the two feature commits to remove the code.

## Verdict

CODE READY on the feature branch, subject to review and CI. Production readiness
depends on the private bucket, the flag, and the manual QA, all Samuel's. No
merge, deploy, production SQL, or secret creation was performed.
