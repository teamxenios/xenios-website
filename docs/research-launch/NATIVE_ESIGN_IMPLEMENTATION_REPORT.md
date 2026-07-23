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

### Completion state machine (atomic: one transaction for the legal commit)

A native signing request moves through an explicit state machine:
`preparing` -> `evidence_stored` -> `completed`, or -> `failed_cleanup_required`
on a commit failure. ONLY `completed` may satisfy the activation gate, appear as
signed in the member interface, appear in the document center, or produce a
member or admin download URL. This is enforced in code: the member and admin
document views and the download route all gate on the completed state (native
requests require `nativeCompletionState === "completed"`), and the activation
gate reads the legal `SignatureRecord`, which is inserted only inside the atomic
completion transaction.

The order per signing request:

1. every legal guard in `SignatureService.prepare()` (never duplicated or
   weakened), which BUILDS the signature record but does NOT insert it,
2. signed-PDF generation,
3. completion-certificate generation,
4. both private uploads,
5. the request is persisted as `evidence_stored` (a durable, NON-activating
   recoverable record: the signed PDF is uploaded but no legal signature yet),
6. THE ATOMIC COMMIT: a single database transaction that (a) re-verifies the
   evidence_stored request (member, exact version, exact idempotency key, refs +
   hashes present), (b) inserts the immutable legal `SignatureRecord`, (c)
   transitions the request `evidence_stored -> completed` binding signed_at,
   completed_at, and the signature id, and (d) upserts the archive projection.

Steps 2-5 run before the commit; the signature is NOT inserted by any of them.
If any of steps 2-5 fails, no signature exists and the agreement stays unsigned.
Step 6 is the ONLY place a native `SignatureRecord` is inserted, and it is done
in ONE transaction together with the request completion and the archive, so all
four effects commit or roll back together. Consequently a native `SignatureRecord`
can NEVER exist unless its matching request is `completed`. A failure of the
commit leaves no signature, the request not completed, the agreement unsigned,
activation blocked, no member or admin download, and no completed archive; the
evidence request is then marked `failed_cleanup_required` so the uploaded objects
can be swept. A retry reuses the evidence and converges to exactly one completed
signature and request.

INDEPENDENT BINDING (step 6a, in the database). The transaction does NOT trust
that the caller aligned the signature payload with the request. Under the row
lock, BEFORE any write, it binds the signature to be inserted to the exact locked
request and refuses with a precise code (writing nothing) if any of these do not
hold: the signature's member equals the acting member (`member_mismatch`); the
signature's `document_version_id` equals both the requested version and the
locked request's version (`signature_version_mismatch`); the signature's
`content_hash` equals the request's source content hash (`signature_hash_mismatch`);
the request is a native (`request_provider_mismatch`) `esign_document`
(`request_mode_mismatch`) request; and the consent flags are exactly true
(`signature_consent_invalid`). This closes a path where a malformed internal call
could have completed request A while inserting a valid signature for a different
published document B. The signature id and `signed_at` are the authoritative
scalar parameters `p_signature_id` / `p_signed_at` (the redundant JSON copies were
removed), so there is a single source for each and no id/timestamp mismatch is
possible. The in-memory commit enforces the identical binding, so the tests
exercise the same semantics.

ATOMICITY. The four database effects of step 6 (verify, insert signature,
complete request, upsert archive) are one transaction. In production this is a
Supabase RPC, `public.research_fm_native_esign_commit`
(`supabase/research-fm-esign-native.sql`): a `plpgsql` `security definer`
function that runs in the caller's transaction, locks the request row `FOR
UPDATE` (so concurrent commits serialize and exactly one performs the
transition), and RAISEs (rolling everything back) on any genuine failure while
returning a structured `{ok:false, code}` with no writes on a verification
failure. In tests and non-Supabase runs an in-memory `NativeCommitFn` provides
the identical all-or-nothing semantics. The signatures table stays append-only
and its published + content-hash trigger and unique (member, version) constraint
still apply inside the transaction (defense in depth). The Supabase Storage
uploads (step 4) remain OUTSIDE the transaction; that is acceptable because
`evidence_stored` is non-activating (an orphaned upload never counts, and is
swept via `failed_cleanup_required`).

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
- `server/research/membership-activation/esign/native-commit.ts`
  (+ `.test.ts`) — the atomic-commit seam: `createSupabaseNativeCommit` (the RPC
  caller) and `createInMemoryNativeCommit` (the identical all-or-nothing
  semantics for tests / non-Supabase), plus `resolveNativeCommit`.

Changed (server):
- `server/research/membership-activation/esign/contracts.ts` — additive:
  `esign_document` / `esign_packet` modes (opensign_* kept), `isNativeMode`,
  `XENIOS_NATIVE_PROVIDER`, native signature-evidence + input types, the injected
  `PdfGenerator` seam, the `NATIVE_COMPLETION_STATES` machine, and the
  `NativeCommitFn` / `NativeCommitInput` / `NativeCommitResult` atomic-commit types.
- `server/research/membership-activation/signatures.ts` — additive `prepare()`
  that runs every legal guard and BUILDS the signature record without inserting
  it, so the native path can insert it inside the atomic commit (`sign()` is a
  thin wrapper over `prepare()`; the clickwrap gate is unchanged).
- `server/research/membership-activation/production-deps.ts` — constructs the
  native service, wires the PDF generator and the atomic commit (Supabase RPC
  when configured, in-memory otherwise, injectable via `resolveEsignNativeCommit`),
  adds `esign.nativeSign` and the member-scoped `esign.documentDownloadUrl`, and
  enables the native path by `RESEARCH_ESIGN_ENABLED` alone.
- `server/research/membership-activation/routes.ts` (+ `.test.ts`) — the two
  native routes and their wire validation.

New / changed (SQL):
- `supabase/research-fm-esign.sql` — the mode check now includes the native
  modes (fresh installs).
- `supabase/research-fm-esign-native.sql` — additive migration for an
  already-applied database: widens the `mode` check constraint to the native
  modes, adds the `native_completion_state` column + check, and adds the atomic
  completion RPC `public.research_fm_native_esign_commit` (`security definer`,
  service-role only, `FOR UPDATE`-serialized, transactional). No destructive DDL,
  safe to rerun, RLS unchanged, no secret in the function or its result.

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

- Full suite: **2966 passed / 125 files** (0 failures, 0 skips).
- Typecheck (`npm run check`): **0 errors**. Build (`npm run build`): **success**.
- Dependency license check: pdf-lib (MIT), react-signature-canvas (Apache-2.0),
  and their transitive deps are all permissive; no GPL/AGPL anywhere.
- Secret scan of the diff vs `main`: clean; the native modules read no env, make
  no network call, and reference no OpenSign credential; the SQL RPC carries no
  secret in its body, parameters, or result.
- Independent-binding coverage: the commit's own binding guards are unit-tested
  (`native-commit.test.ts`): a signature for another document
  (`signature_version_mismatch`), a mismatched content hash
  (`signature_hash_mismatch`), a non-native request (`request_provider_mismatch`),
  a non-`esign_document` request (`request_mode_mismatch`), and unconsented
  flags (`signature_consent_invalid`) each write nothing (no signature for either
  document, no archive, request not completed); the RPC payload omits `id` and
  `signed_at` (asserted); and a route-level binding refusal
  (`signature_version_mismatch`) blocks activation and every download.
- Atomic-commit coverage (this correction). The commit's own guard branches are
  unit-tested (`native-commit.test.ts`: request_missing, member_mismatch,
  version_mismatch, request_not_evidence_stored, evidence_incomplete each write
  nothing; the happy commit lands signature + completed request + one archive;
  idempotent replay; serialized concurrency). The 10 required scenarios:
  1. an RPC/transaction failure inserts no signature (native service + route).
  2. it leaves the request not completed (`failed_cleanup_required`).
  3. activation remains blocked after the failure (route: agreements unsatisfied,
     consent not signed, no `SignatureRecord`).
  4. the member download route refuses it (route: >=400).
  5. the admin download route refuses it (route: >=400).
  6. it is never presented as completed (member docs, admin center) and no
     archive row exists.
  7. a retry after a commit failure completes exactly one signature and one
     request (native service + route).
  8. concurrent retries produce exactly one completed transaction (native
     service + route: one signature, one request, one archive).
  9. no native `SignatureRecord` can satisfy activation unless its matching
     request is completed (invariant asserted over both a success and a failure).
  10. existing clickwrap (AgreementSignCard) signatures still satisfy the gate
      and are not broken by the native-evidence rule.
  The earlier pre-commit failure paths (PDF-generation, certificate-generation,
  signed-PDF storage, certificate storage, request-record) remain covered and
  each leave the agreement unsigned.
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
