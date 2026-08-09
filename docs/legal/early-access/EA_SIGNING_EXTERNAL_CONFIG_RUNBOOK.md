# Early Access signing: external configuration runbook

Lane: Session 4, legal identity and signing bridge.
Base contract SHA: `bee5cf27af674be3de592b98b00bee0d90cd13a3`.

Nothing in this lane calls a provider, writes a database row, publishes a document or
sends a request. This runbook lists what a human must configure outside the code
before signing can happen, and what must be verified read-only before the cart opens.

## Decide first: native, not OpenSign

The repository has two signing lanes. Use the native one.

- **Native in-page signing** is enabled by `RESEARCH_ESIGN_ENABLED=true` alone. It
  needs no provider account and no credential. It is the lane wired to the shipped UI
  (`EmbeddedAgreementSigner`), it produces the immutable `SignatureRecord` the
  completion check reads, and it records the separate acknowledgment that arbitration
  and the release and waiver require.
- **OpenSign** additionally needs `RESEARCH_ESIGN_PROVIDER=opensign` plus
  `OPENSIGN_BASE_URL`, `OPENSIGN_API_TOKEN` and `OPENSIGN_WEBHOOK_SECRET`. It is
  currently unreachable from the client bundle (no component calls
  `startEsignSession`), every field mapping in the adapter is marked `ASSUMED` pending
  confirmation against OpenSign's published API, and its acceptance record carries no
  acknowledgment evidence, so it cannot satisfy the two separate-acknowledgment
  documents.

`selectSigningMode` encodes this: native wins whenever it is available, and
provider-hosted is used only where native is unavailable and a provider is genuinely
configured. Do not force OpenSign.

## Environment

| Variable | Needed for | Notes |
|---|---|---|
| `RESEARCH_ESIGN_ENABLED` | native signing | `true` exactly. Default `false`, so an unconfigured deployment signs nothing. |
| `RESEARCH_ESIGN_BUCKET` | signed PDF and certificate archive | Private Supabase bucket. The storage seam has no `getPublicUrl`, so a public link cannot be minted through it. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | archive storage | Already present. |
| `RESEARCH_ESIGN_PROVIDER` | OpenSign only | Leave unset for the native path. |
| `OPENSIGN_BASE_URL`, `OPENSIGN_API_TOKEN`, `OPENSIGN_WEBHOOK_SECRET` | OpenSign only | Absent means `DisabledEsignProvider`, which is the safe state. |
| `OPENSIGN_REDIRECT_URL` | OpenSign only | Read straight from the environment today with no validation. Run it through `buildReturnUrl` so a typo or a copied staging value cannot become a destination Xenios sends signers to. |

There is no environment variable for the legal package. That is deliberate: the
package is a founder and counsel designation with a named human and an approval
reference, not a configuration string. See the decision matrix.

## Blocking prerequisites, in order

1. **Designate the package.** A named human records an
   `EarlyAccessPackageDesignation`. Until then every call refuses with
   `designation_missing` and the cart cannot open. See
   `EA_PACKAGE_DECISION_MATRIX.md`, including the four required documents that
   currently have no signing path at all.
2. **Resolve the unsignable documents.** Options are in the decision matrix. Option 1
   (give them registry categories) requires an owner, because
   `server/research/membership-activation/documents.ts` is not owned by any lane in
   this fusion.
3. **Publish the document versions.** `registerLegalPackage` registers to
   `approved_for_publication` and deliberately stops there; `DocumentLifecycle.publish`
   requires `counselReview === "approved"`, a named publisher and a content hash that
   still matches the text. Neither has a production caller at this SHA: there is no
   admin publish route. Until versions are published, every required category reports
   `no_published_version` and the gate correctly refuses everyone.
4. **Create the signer bindings.** The binding write path is deliberately not in this
   lane (the frozen directory is read-only, and creating a binding must not be a side
   effect of visiting a checkout). Needed before any customer signs.
5. **Attest the founder checkout.** `XEC-E1703CC63BBE89E6839E24C1` predates all of
   this. It acquires a binding through `admin_attested` with a named reviewer on the
   record, keeping its existing number, invoice and reference. No new checkout.

## Read-only preflight before the cart opens

Run these and require every one to pass. None of them writes.

- `select count(*) from public.research_fm_document_versions where status = 'published';`
  must equal the number of signable required categories in the designated package.
- For each published version, confirm `counsel_review = 'approved'`, `published_at` is
  set, and `content_hash` matches `sha256(content)`.
- Confirm the partial unique index `research_fm_versions_one_published_per_category`
  exists, so a category cannot have two published versions.
- Confirm the append-only triggers are present on
  `public.research_fm_document_signatures`: `research_fm_signatures_append_only`
  (refuses UPDATE and DELETE) and `research_fm_signature_requires_published` (refuses
  an unpublished version or a hash mismatch).
- Confirm `research_fm_signatures_once unique (member_id, document_version_id)`.
- Confirm `RESEARCH_ESIGN_ENABLED` is `true` and the archive bucket exists and is
  private.
- Run one controlled native signature round trip in a non-production environment and
  confirm a `SignatureRecord` lands with `separateAcknowledgment = true` for
  arbitration, then confirm `standingFor` flips only after that record exists.

If any check fails, keep the cart flag off. The gate fails closed by design, so the
failure mode is a refused sale rather than an unsigned customer, but a customer who
cannot finish is still a customer who cannot finish.

## Findings handed to other lanes

Two weaknesses were found in the existing OpenSign adapter during the audit. Both are
outside this lane's owned files, neither was changed here, and both are gated behind
possession of `OPENSIGN_WEBHOOK_SECRET`. They matter only if OpenSign is ever enabled.

1. **`fetchCompletedFile` sends `OPENSIGN_API_TOKEN` to a URL taken from the webhook
   body**, with no check that the host matches `OPENSIGN_BASE_URL`. That is server-side
   request forgery plus credential exfiltration to a host of the caller's choosing.
   `server/research/product-requests.ts` already implements private-address denial that
   is not applied here.
2. **`externalReference` is minted, echoed and never checked.** Webhook events are
   mapped by `providerDocumentId` alone, so the declared correlation check is unused.

Recommended owner: Session 1 (integration) or Session 9 (red team) to confirm, since
`esign/provider.ts` and `esign/signing.ts` belong to no lane in this fusion.
