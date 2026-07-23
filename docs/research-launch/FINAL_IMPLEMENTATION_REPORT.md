# Xenios Research: Final Implementation Report (Founding Membership Completion Directive)

Date: 2026-07-22
Branch: `integration/xenios-research-track-b-commerce-activation`
Head: `6ba11d86603710218a36fed02191e112f2ff2370` (local == remote; the final PR
comment pins the exact head)
PR: #38 (draft, not merged)

This report covers the Founding Membership platform AND the OpenSign e-signature
integration, archive, and admin-records delivery added under the later directive
(section 35). The OpenSign integration is inert by default (`RESEARCH_ESIGN_ENABLED`
off); the native agreement engine remains the launch signing path.

## Verdicts (summary, evidence in sections 23 to 28, 34, and 35)

| Verdict | Status |
| --- | --- |
| CODE READINESS | READY, subject to final CI status (Founding Membership + OpenSign integration + canonical legacy-category mapping; 2874 tests, 0 type errors, build success, both SQL bundles green on live scratch Postgres, two adversarial audits at 0 confirmed majors) |
| MEMBERSHIP ACTIVATION READINESS | NOT READY FOR PRODUCTION only because production configuration, publication, and Samuel's controlled live test remain outstanding. No legal document is a blocker: the activation required set is built from the canonical final-package signing sequence (section 9). |
| PRODUCTION CONFIGURATION READINESS | NOT READY (no production secrets, buckets, bridge settings, methods, or email configuration exist yet; production SQL not applied; and, if OpenSign is used, no OpenSign account/credentials yet) |
| PRODUCT COMMERCE READINESS | NOT READY (0 of 65 referenced COA files exist on disk; commerce stays behind its kill switch) |

Nothing was merged, deployed, or executed against production. Real payments were never taken.
No real financial identifier, receiving handle, or secret value (including the OpenSign API
token or webhook secret) appears in the repository, the client bundle, or this report.

---

## 1. Current architecture assessment

The platform is a layered, seam-first system:

- Domain modules (`server/research/membership-activation/`, `server/research/commerce/`)
  are pure logic with injected clocks and id generators, so every rule (pricing, bridge
  calendar math, state transitions, idempotency) is unit-tested deterministically.
- Persistence is a port per aggregate: an in-memory reference implementation (the
  executable specification) and a Supabase implementation via an injected client, with
  `resolve*()` falling back on `supabaseConfigured()`. Row mappers are pure snake_case
  functions tested against fake fluent clients.
- Production wiring is three-state everywhere: flag off is byte-identical and provider
  untouched (spy-proven), flag on but unconfigured returns precise `capability_disabled`
  or `payment_disabled` denials, and flag on plus configured composes the real adapter
  only after `assertNoSyntheticDataInProduction` passes.
- Financial invariants are enforced twice: in code and again by database constraints and
  append-only triggers, so an application bug cannot corrupt the ledger.
- The HTTP surface sits behind the merged guard trust model (requireMember,
  requireActiveMember, requireSupabaseAdmin) with the three-state gate evaluated before
  authentication so a disabled deployment leaks nothing, not even route existence.
- The client is an adapter-per-domain SPA (wouter routing, typed adapters, honest
  loading/denial states); the browser never grants authority.

No duplicate architecture was created. The Founding Membership work extends the existing
agreements engine, media abstraction, outbox, and admin application rather than
introducing parallel systems.

## 2. Work that already existed before this directive

- Track A (the private member platform) merged to `main` and auto-deployed; its SQL
  handed to Samuel for console application.
- Track B commerce on this branch: persistent repositories (11 store files), checkout
  with reservation seam and restart-replay safety, provider adapters (Stripe
  manual-capture payment, shipping with timestamp-bound webhooks, Mitch fulfillment with
  an adversarially proven allowlist, approval-gated payouts, Stripe billing), webhook
  routes with raw-body signature gates, admin order lifecycle, 77 running-server
  acceptance tests, and the Track B SQL bundle.
- The launch scope override: health tracker and all health programs deferred and hidden
  from navigation with routes stable; the Mitch synthetic sandbox with production-blocked
  labeled fixtures; `MITCH_LIVE_CONFIGURATION_WORKSHEET.md`.
- The Founding Membership base landed in this session's earlier waves (commits
  `b4812ea`, `f445688`, `0095ce8`): domain layer, HTTP surface, three-state wiring,
  emails, scheduler, activation stepper UI, admin queues, pricing sweep, FM SQL bundle.

## 3. Work completed under this directive

1. Background work reconciled: the connect wave and the legal-import and closure agents
   were collected, verified independently, and committed; no duplicate agents were
   started for landed work.
2. The final legal package imported verbatim and hash-verified (sections 7 to 9).
3. The package's separate conspicuous acceptance for the release document is now
   ENFORCED by the domain (registry flag on the covenant slot), not merely recorded in
   provenance. Commit `5ba1054`.
4. The pre-obligation payment-method listing wire gap closed: the activation stepper can
   list methods (masked instructions only) after the identity and agreements gates, before
   an obligation exists. Commit `b7fd026`.
5. The admin readiness endpoint and page (six areas, strict four-state vocabulary,
   presence booleans and variable names only, never a secret value). Commit `b7fd026`.
6. A minimal GitHub Actions workflow running the repository's canonical checks (test,
   typecheck, build) on Node 20 with no secrets and no production access. Commit `b7fd026`.
7. Full independent gates re-run at the final head (section 23) and an independent
   security review executed over the committed tree (sections 25 and 26).

## 4. Exact files changed

Against the Track A merge base `dd1f6b4` (main at Track A): **244 files changed,
66,740 insertions, 1,043 deletions**. Domains: `server/research/membership-activation/`
(about 25 files plus persistence), `server/research/commerce/`, `server/research/providers/`,
`client/src/research/` (activation stepper, five admin pages, pricing sweep),
`supabase/` (Track B and FM bundles plus verification and rollback),
`docs/legal/xenios-research/v1.0.0/` (52 files), `docs/research-launch/`,
`.github/workflows/checks.yml`.

## 5. Commits created on this branch

```
6ba11d8 esign: member + admin document centers (client)
1a21aa4 esign: display endpoints read the gate with e-sign acceptances (audit fix)
7b3a160 esign: fold the e-signature schema into the FM production bundle
b6d3ab7 esign: wire routes, three-state services, HMAC webhook, admin center
8d0f8f7 esign: let a completed e-signature satisfy the agreement gate (additive)
19be9b6 esign: OpenSign provider, signing domain, archive, ZIP, persistence
40d13c7 esign: SQL schema and environment matrix for the OpenSign integration
1017ca0 esign: shared type contract for the e-signature integration
76c4983 activation: gate obligation creation on identity + agreements (review fix)
b7fd026 activation: pre-obligation method listing, admin readiness, CI
bde0ea5 legal: import the counsel-approved Xenios Research package v1.0.0
5ba1054 activation: enforce separate acknowledgment on the covenant slot
0095ce8 founding membership: activation UI, admin queues, pricing sweep, outbox renderers, scheduler, FM SQL with live dry run
f445688 founding membership: HTTP surface, three-state wiring, email templates
b4812ea founding membership: domain layer (bridge, money spine, identity, agreements)
d38e9fd track B final closure: reservation wiring, restart-replay fix, admin lifecycle + fulfillment webhook over HTTP, refreshed SQL bundle
d69cce6 track B final waves: running-server acceptance suite, frontend verification, security review
bbda236 track B waves 18+23 + comms rails: production wiring, Track B SQL with live dry run, media/Telegram/identity
375a0c5 track B waves 14-22: audit closure, schema fidelity, subscriptions, admin queues, store credit, four provider adapters
23983e0 launch override: defer health programs/tracker, Mitch worksheet, synthetic-data production guard
d74c57f track B waves 4-13: persistent commerce repositories (Supabase-backed, tested)
94f6886 track B wave 1: async repository-seam conversion (no behavior change)
05e8af8 track B: consolidate the two Track B efforts into one architecture
27e4468 Merge remote-tracking branch 'origin/main'
1ad388f launch(track-a): member-platform-only SQL split + dry-run evidence (#36)
29a66c1 track-b wave 1: persistent idempotency store
6a5cbb9 track B wave 1: persistent cart store
```

## 6. Database migrations

Prerequisite chain (apply in order, never out of order):

1. Base migrations 1 to 8 (already on main).
2. `supabase/production/research-track-a-private-platform.sql` (merged to main;
   Samuel applies via his console; not this branch's concern).
3. `supabase/production/research-track-b-commerce.sql`: 49 tables, append-only ledger
   triggers, hold-is-the-decrement reservations. Live scratch-Postgres dry run
   (Docker postgres:16): **32/32 verification checks passed**. Rollback script provided.
4. `supabase/production/research-founding-membership.sql`: the FM bundle. Live scratch
   dry run: **41/41 verification checks passed**, including the DB-enforced canonical
   pricing constraint (`research_fm_obligations_amount_matches_type`: activation
   obligations must be exactly 5000 cents, renewals exactly 2500). Rollback script
   provided; the append-only ledger and signature tables are forward-fix only by design
   (documented in the bundle header).

Production SQL was NOT run anywhere.

## 7. Legal files imported

52 files committed under `docs/legal/xenios-research/v1.0.0/` (commit `bde0ea5`):
17 member-facing documents, 18 internal policies (team-only, never registered as
member-facing or signable), approval records, supporting files (signing sequence,
business terms schedule, website integration manifest, versioning table, release hash
manifest), the two master files, `IMPORT_MANIFEST.md`, and a directory `.gitattributes`
(`* -text`) so newline normalization can never silently change a hash on checkout.
Every file byte-identical to the canonical source at
`C:\Users\sboad\Downloads\Xenios_Research_Legal_Package_FINAL`. No file was rewritten,
summarized, or improved. No DRAFT file was used.

## 8. Legal source hashes and manifest result

- Package manifest verification: **50 of 50 hashes MATCH** against
  `RELEASE_HASH_MANIFEST.json` (verified twice: at intake and by the import module's
  own pinned-hash checks).
- `server/research/membership-activation/legal-import.ts` pins the SHA-256 of each of
  the 17 member-facing sources in `MEMBER_FACING_IMPORT_PLAN`; `registerLegalPackage`
  refuses loudly (`LegalImportConflict`) if a source on disk ever deviates from its pin.
- Registration is deterministic, idempotent (keyed by category, semver, content hash),
  environment-safe, and re-runnable without duplicate versions. 19 tests in
  `legal-import.test.ts`.

## 9. Agreement registry and signing sequence

- 16 fixed categories (`documents.ts`), lifecycle
  draft -> under_legal_review -> approved_for_publication -> scheduled -> published ->
  superseded/archived/withdrawn. Drafts and unpublished versions are structurally
  unsignable. Publication happens only through the controlled release path (NOT
  performed by the import).
- The package's own signing sequence is authoritative: 17 documents, e-records first,
  the release document (XR-LEGAL-17) at position 9, files 15, 13, 14, 16 at positions
  14 to 17. Sequence extracted from `MEMBER_SIGNING_SEQUENCE.md` and
  `website_integration_manifest.json` (they agree).
- 12 package documents map onto registry categories; 5 (website terms, product purchase
  terms, shipping policy, payment evidence upload consent, cookie notice) register as
  typed additional documents.
- Separate conspicuous acceptance is enforced for BOTH flagged documents: arbitration
  (position 8) and the release, waiver, covenant not to sue, limitation of liability and
  indemnification (position 9, registered under the covenant slot). Signing without the
  separate acknowledgment returns `separate_acknowledgment_required`.
- LEGACY-CATEGORY MAPPING (FINAL AGREEMENT-GATE CORRECTION): the activation required set
  is built exclusively from the canonical final-package signing sequence. Three legacy
  registry categories have no standalone document in the package and resolve through a
  documented `LEGACY_CATEGORY_MAPPING` (documents.ts), without inventing, editing, or
  merging any legal text:
  - `activation_terms` is an ALIAS satisfied by signing the Founding Membership Agreement
    (XR-LEGAL-04), which carries the $50 activation terms. The separate Manual Payment and
    Verification Terms, Membership Renewal Policy, Cancellation and Refund Policy, and
    Website Terms remain INDEPENDENTLY required by their own categories; nothing is merged.
  - `no_guarantee_acknowledgment` is an ALIAS satisfied by signing the No-Medical-Advice
    and Assumption-of-Risk Acknowledgment (XR-LEGAL-07), which carries the approved "No
    Guaranteed Outcome" provision.
  - `sensitive_health_data_consent` is DEFERRED out of the initial required set (the
    package has no such document and the initial workflow collects no health data). The
    category and its capability are preserved behind a future health-data-collection
    feature gate (`RESEARCH_HEALTH_DATA_ENABLED`); it becomes required, and blocks until
    published and signed, before Xenios collects any sensitive health or biometric data.
  The gate still fails closed on any canonical required category with no published
  version. No missing legal document blocks activation. Historical registry records and
  the categories themselves are preserved. Proven by `signatures.test.ts` (the mappings,
  satisfied by the canonical set alone, not-required-when-disabled, required-when-enabled).

## 10. Identity model and retention flow

- 12 states: not_started, consent_required, awaiting_upload, uploaded, under_review,
  information_requested, manually_verified, provider_verified, rejected, expired,
  source_scheduled_for_deletion, source_deleted.
- Consent-first: upload sessions refuse without an active identity consent. Private
  storage only (no public bucket), random non-guessable object keys, strict MIME
  allowlist with magic-byte validation, SVG and executables rejected, size limits,
  sanitized filenames.
- Manual name and age review (`manual_name_age`): the reviewer records name-match,
  age-threshold, jurisdiction, expiration result, review type, outcome, reviewer, and
  timestamps. No SSN. No full license number. Masked last four only where required.
- Retention: source documents are scheduled for deletion 7 days after completed review;
  the deletion worker is idempotent and runs on the hourly scheduler tick; emergency
  manual deletion exists; after deletion only the minimal verification record remains.
- Every admin view of an identity document is audited.

## 11. Payment-method registry

`payment-methods.ts`: UUID, provider code, internal category, member and admin display
names, temporary/permanent classification, ownership classification
(`personal_bridge` / business / processor-backed), enabled state, effective window,
currency, per-purpose eligibility (activation, renewal, product purchase with product
DEFAULTING TO FALSE), amount bounds, settlement expectation, receiving legal entity,
provider approval status and dates, compliance review, admin approver, masked
member-facing instructions, ENCRYPTED full instructions (AES-256-GCM via an injected
cipher keyed from `PAYMENT_INSTRUCTIONS_ENC_KEY`; plaintext is structurally absent from
every serialization and there is no reveal route), mobile/desktop/memo instructions, QR
and deep-link references, support instructions, disabled reason, version history, audit
history. Instructions are admin-entered at runtime, never committed.

## 12. Fourteen-day bridge model

`bridge.ts`: durable server-controlled settings (enabled, start, end, timezone,
duration days, accepting_new_activation_obligations,
accepting_existing_obligation_submissions, temporary_methods_visible,
replacement_provider_status, administrator_emergency_disable, extension fields,
closed_at/by). Calendar math is timezone and DST proven by test. At sunset: new
obligations on expired methods are REFUSED server-side, submitted payments stay
reviewable, history is immutable, extensions require an authorized admin plus a written
reason plus a new expiration plus an audit event. Emergency disable works instantly.

## 13. Payment-obligation model

`obligations.ts`: UUID plus human-readable `XRM-XXXXXXXX` reference (unique), member,
type, expected amount (DB-constrained: activation_50 = 5000 cents INCLUDING the first
30 days, renewal_25 = 2500 cents per additional 30-day period), currency, purpose,
created/due/expiration timestamps, bridge phase, selected method with a version
snapshot, agreement-version snapshot, 15-state status vocabulary, member submission,
admin verification, receiving-destination reference, receipt reference, idempotency
key, immutable audit history. There is no $25 charge at activation anywhere: interface,
fixtures, schema, tests, seeds, emails, receipts, API output, and admin labels all
carry the canonical model (verified by the pricing sweep tests).

## 14. Samuel's verification workflow

The admin queue shows identity state, agreement completion, expected versus reported
amount, method, XRM reference, sender fields, external reference, evidence, receiving
destination, duplicate warnings, prior submissions, notes, and audit history. Actions:
verify, reject, request information, mark mismatch, mark duplicate, mark reversed, mark
refunded, cancel, migrate to a replacement method. Verification requires the amount
actually received, date, destination, method, external reference, reconciliation date,
and the explicit confirmation checkbox with the exact sentence:

> I confirm that I checked the receiving account and verified that this payment was received.

Admin identity, role, timestamp, hashed IP and user agent, prior and new state,
verification data, and idempotency key are recorded immutably. There is no hidden
activate-member bypass; a screenshot never activates anything.

## 15. Membership activation transaction

One idempotent transaction on verify: marks the obligation verified, writes the ledger
entry, creates one receipt, activates one membership, sets the activation timestamp,
creates the first period ending EXACTLY 30 calendar days later, schedules the first $25
renewal for that boundary, unlocks the portal, enqueues the activation email, and writes
audit events. Uniqueness constraints plus idempotency keys make repeated clicks,
retries, tab duplication, restarts, and replays produce no duplicate membership,
period, receipt, ledger entry, renewal, email, or extra days. All dates are
server-calculated.

## 16. Manual renewal workflow

Each $25 renewal is member-initiated (never auto-pulled, never described as automatic
billing), flows through the same obligation, submission, evidence, verification,
receipt, and audit infrastructure, and each verified renewal extends access exactly one
additional 30-day period (duplicate approval cannot extend twice). States: upcoming,
due, reported, under review, verified, overdue, grace period, suspended for nonpayment,
canceled, reversed, refunded. The scheduler emits 7-day, 3-day, due-date, overdue,
grace, suspension warning and confirmation, renewal confirmation, and migration notices
idempotently through the outbox.

## 17. Day 15 cutover workflow

Admin can add business methods, set effective dates, keep them hidden while testing,
disable personal bridge methods, migrate outstanding obligations, notify affected
members, preserve snapshots, export bridge-period records, and mark the bridge closed.
The Day 15 checklist (bank confirmed, entity confirmed, provider application and
approval recorded, method entered securely, test transaction, receipt verified, refund
test, reconciliation, temporary method disabled, notification sent, export stored) is a
durable store with owner attribution, surfaced on the admin Bridge and Readiness pages.
Nothing logs into or scrapes Zelle, Cash App, Venmo, Apple, or bank applications, and
nothing moves money automatically.

## 18. Member UI

`ActivationPage.tsx`: mobile-first 10-step stepper across the five canonical phases
(Account, Identity, Agreements, Payment, Activation), server-derived state on every
refresh (resume from any device), the canonical pricing block verbatim ("$50 due today /
Includes your activation and first 30 days of membership. / Then $25 for each
additional 30-day membership period. / Your first renewal date will be calculated when
your activation payment is verified."), full-document agreement rendering with nothing
prechecked and separate acknowledgments for the two flagged documents, method selection
with masked instructions and copy controls and the XRM reference, the "I sent my
payment" report with the exact non-activation disclosure, evidence upload, honest
pending-review states, and the activated state (activation date, current period, next
$25 due date, signed documents, receipts). Keyboard accessible with visible focus
states and screen-reader labels. MFA is not in the member flow (code preserved behind a
disabled flag).

## 19. Admin UI

Five pages under `/admin/research`: Payment verification (ActivationQueue), Bridge
(ActivationBridge, with sunset countdown), Day 15 (ActivationChecklist), Reconciliation
(ActivationReconciliation, CSV export without raw ID or evidence files), and Readiness
(ActivationReadiness). All follow the AdminScreen/AdminBoundary pattern: data only from
admin-authorized APIs, denials rendered honestly.

## 20. HTTP routes

`membership-activation/routes.ts`: 32 route registrations across 28 unique paths
(13 member paths under `/api/research/activation/`, 15 admin paths under
`/api/admin/research/activation/`), all behind the three-state gate BEFORE
authentication, with schema validation, ownership isolation, idempotency, stable error
codes, audit events, and the JSON 404 tail. The earlier "37-route" claim is corrected
by this verified count. Representative routes are spy-proven silent when the flag is
off and precisely denying when unconfigured.

## 21. Environment-variable matrix

Founding Membership (all optional in dev; the readiness endpoint reports presence):

| Variable | Purpose | Default |
| --- | --- | --- |
| `RESEARCH_FOUNDING_ACTIVATION_ENABLED` | Master flag; in the production-guard flag list | false |
| `PAYMENT_INSTRUCTIONS_ENC_KEY` | AES-256-GCM key for encrypted receiving instructions | unset (encryption seam refuses) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Persistence (server only, never client) | unset (in-memory fallback) |
| `RESEARCH_IDENTITY_BUCKET` | Private identity-document bucket | unset |
| `RESEARCH_MEDIA_BUCKET` | Private evidence/media bucket | unset |
| `RESEND_API_KEY`, `FROM_EMAIL`, `REPLY_TO_EMAIL` | Outbox email delivery | unset (outbox queues, does not send) |

Commerce (separate release gate, all default false/unset): `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED`,
`RESEARCH_MEMBERSHIP_BILLING_ENABLED`, `RESEARCH_MITCH_FULFILLMENT_ENABLED`,
`RESEARCH_LIVE_SHIPPING_ENABLED`, `RESEARCH_AFFILIATE_PAYOUTS_ENABLED`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCH_ACTIVATION`,
`STRIPE_PRICE_RESEARCH_MEMBERSHIP`, `MITCH_API_KEY`, `MITCH_ENDPOINT_URL`,
`MITCH_WEBHOOK_SECRET`, `SHIPPING_API_KEY`, `SHIPPING_API_BASE_URL`,
`SHIPPING_WEBHOOK_SECRET`, `PAYOUT_API_KEY`, `PAYOUT_WEBHOOK_SECRET`,
`PAYOUTS_EMERGENCY_DISABLED`.

Platform (existing): `RESEARCH_ACCESS_PASSWORD`, `RESEARCH_SESSION_SECRET`,
`ADMIN_API_KEY`, `ADMIN_EMAILS`, `DATABASE_URL`, `SITE_URL`, `TURNSTILE_*`,
`RESEARCH_QUEUE_REF_SALT`.

## 22. Required secure configuration

Samuel enters receiving instructions ONLY through the authenticated admin interface;
they are encrypted at rest with `PAYMENT_INSTRUCTIONS_ENC_KEY` and only the
server-derived masked variant is ever serialized. The service-role key, encryption key,
bucket names, and email credentials live in the deployment environment, never in git.
No QR image containing payment details may be committed; QR references are storage
refs. The admin API key guards admin routes; identity and evidence access is via
short-lived signed URLs with every access audited.

## 23. Test results (final independent run at head)

- `npx vitest run`: **121 files, 2874 tests, all passed** (0 failures, 0 skips).
- `npm run check` (tsc): **0 errors**.
- `npm run build`: success (vite client bundle plus `dist/index.cjs`, 616.7kb).
- The Founding Membership base run at `b7fd026` was 114 files / 2754 tests; the OpenSign
  integration and its client document centers added the balance (esign provider, signing,
  archive, ZIP, persistence, wiring, gate extension, and the two client pages).
- Coverage highlights: money spine 105 tests, bridge 61, routes surface (incl. the
  running three-state gate and string-scan proofs), legal import 19, scheduler/outbox
  20, activation client pages 399+, commerce acceptance 77 running-server tests,
  safety-critical idempotency and replay suites throughout.
- CI now runs test, typecheck, and build on every PR and push to main
  (`.github/workflows/checks.yml`, Node 20, no secrets, no deploy).

## 24. SQL dry-run results

Live scratch Postgres (Docker postgres:16), full prerequisite chain applied in order:

- Track B commerce bundle: **32/32 verification checks passed** (49 tables).
- Founding Membership bundle: **41/41 verification checks passed**, including
  append-only ledger triggers and the canonical-pricing check constraints.
- Rollback scripts execute where rollback is safe; the ledger and signature tables are
  documented forward-fix only.

## 25. Security findings

An independent seven-lens adversarial review ran against the committed tree at
`b7fd026` (secrets in tree, secrets in branch history, client bundle, synthetic-data
guard, supplier confidentiality, legal-import integrity, final-commit correctness).

**Result: all seven lenses PASS, zero major findings.**

- Secrets in the tree: no real API key, token, private key, bank/routing/account
  number, or payment handle anywhere. The only `.env` file is `.env.example` with
  every secret-bearing value empty. `PAYMENT_INSTRUCTIONS_ENC_KEY` appears only as a
  variable name (`process.env` read), never a literal. Stripe-shaped tokens exist only
  as obvious fakes in test fixtures.
- Secrets in branch history (`dd1f6b4..HEAD`, 18 commits): pickaxe and shape scans
  found no real key ever committed-then-removed; occurrence counts only grow
  monotonically and are all short placeholders. Two SSN-shaped strings are synthetic
  KYC fixtures with the never-valid `000-` prefix.
- Client bundle (`dist/public`): no secret-shaped string, no `SUPABASE_SERVICE_ROLE_KEY`,
  no `PAYMENT_INSTRUCTIONS_ENC_KEY`, no ciphertext, no plaintext payment instructions,
  no internal-SOP content, no owner-identifying handle. The readiness page carries no
  env names or values.
- Synthetic-data production guard: `RESEARCH_FOUNDING_ACTIVATION_ENABLED` is in the
  production-flag list; every live provider resolver calls
  `assertNoSyntheticDataInProduction` before constructing.
- Supplier confidentiality: no committed supplier PDF, COA, signature image, contact
  detail, or price sheet; `docs/legal/**` is only the counsel package.
- Legal-import integrity: 17/17 member-facing hashes match on both committed and
  working-tree bytes; `.gitattributes` verified effective; no route serves
  `internal_policies/` content.
- Final-commit correctness: the one actionable finding (obligation creation not
  re-enforcing the identity and agreements gates) was CONFIRMED and FIXED in commit
  `76c4983` (a shared `activationGatesDenial()` now gates both the pre-obligation
  listing and `selectMethod`); two note-level items (document-specific acknowledgment
  copy, a stale manifest note) were also addressed.

**E-signature integration audit (five lenses, 0 confirmed majors).** A second independent
adversarial audit ran over the OpenSign integration: webhook security, gate advancement,
three-state + secrets, storage/ZIP/archive safety, and idempotency/AGPL/correctness. All
five lenses passed with zero majors.

- Webhook: HMAC-SHA256 of the exact raw body, length-guarded `timingSafeEqual`, parse only
  after verify, replay dedup by event id (no second ingest/email/archive), raw body and
  signature never logged, `capability_disabled` when off, 200 only after durable processing.
- Gate: the `esignAcceptances` extension is additive and fail-closed. The audit tried and
  failed to construct a bypass: an e-sign acceptance cannot satisfy a category with no
  published version, cannot clear a foreign/non-published version id, and cannot clear a
  reacceptance-required republish; passing nothing reproduces native-only behavior; only a
  completed (webhook-processed) request becomes an acceptance, so a redirect never advances.
- Secrets: `OPENSIGN_API_TOKEN` / `OPENSIGN_WEBHOOK_SECRET` are absent from the client bundle
  and every serialization/log; the live adapter is built only after the synthetic-data guard.
- Storage: path builders and the ZIP writer reject traversal; the packet route guards the
  member id against Content-Disposition injection; raw ID and payment evidence are excluded.

Two minor findings were fixed (the read-only member status and agreements-list displays now
read the gate with e-sign acceptances, so an e-signed member's progress reads correctly).
Two were accepted by design and documented: a swallowed archive-row write failure is
non-fatal because the signing-request row still carries the refs and hashes (the admin center
reads both), and the signing-session idempotency is check-then-act with the database
`UNIQUE (member_id, idempotency_key)` as the backstop. A note-level item (esign admin
downloads are not yet audit-logged the way identity access is) is recorded as a follow-on.

## 26. Privacy findings

- IP addresses and user agents are stored as SHA-256 hashes only, on signatures and
  admin verifications alike.
- Identity sources: 7-day post-review retention, idempotent deletion worker, minimal
  verification record after deletion, no SSN, no full license number.
- Evidence: private storage, member ownership enforced, access audited, members are
  instructed to redact unrelated balances and transactions, no OCR.
- No raw ID or evidence content reaches logs, email, analytics, or browser persistence.
- Internal SOPs are in the repo for the team but are never registered as member-facing
  or signable and no server route serves `internal_policies/` content
  (verified by the review above).

## 27. Product-commerce status

Determined from actual files, not letters: **0 of 65 referenced COA and attachment
files exist on disk** (all `referenced_not_found` against the signed supplier master).
SOP 17 in the legal package is a checklist, not a COA. Therefore 0 of 15 SKUs are
purchase-eligible, the KLOW rule stands with no bypass, and product commerce remains
behind its kill switch (`NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` false plus per-SKU
release states). Membership activation is code-complete independently of this gate.

## 28. Remaining external blockers

No legal document is a blocker: the activation required set is built from the canonical
final-package signing sequence and the three legacy categories resolve via the documented
mapping (section 9). The remaining items are production configuration and operational
steps, all Samuel's:

1. Publish the registered legal versions through the controlled release path (registration
   stopped at approved_for_publication by design).
2. Production environment configuration (section 21 matrix) on Render, plus Supabase
   private buckets and the encryption key.
3. Apply the Track B and FM SQL bundles to production Supabase (after Track A).
4. Bridge settings (start/end/timezone) and at least one approved receiving method entered
   through the admin interface.
5. Email: Resend domain verification and a production test send.
6. The Samuel-executed controlled live-activation test (section 29).
7. If OpenSign is used: an OpenSign account + credentials + the private `RESEARCH_ESIGN_BUCKET`.
8. Product commerce only: real COA files, lot mapping, provider credentials, Mitch live
   configuration per the worksheet.

## 29. Controlled live-activation runbook (Samuel-executed; prepared, not executed)

1. Create an approved test applicant (real email Samuel controls).
2. Claim the account from the approval email.
3. Verify the email address.
4. Accept the Electronic Records and Signature Consent.
5. Accept the identity-verification consent.
6. Upload a permitted test ID image.
7. Confirm the ID-access audit event exists for the admin view.
8. Review and verify the identity in the admin queue.
9. Sign every required agreement in the package sequence (arbitration and the release
   each need their separate acknowledgment).
10. Confirm the signed copies render with matching content hashes.
11. Generate the $50 obligation and confirm the XRM reference.
12. Select a temporary bridge method; confirm only masked instructions are shown.
13. Complete a controlled external payment of $50 (Samuel's own action, real funds
    between Samuel's own accounts).
14. Report the payment in the portal.
15. Upload redacted evidence.
16. In the admin queue, check the ACTUAL receiving account, then verify with the exact
    confirmation sentence.
17. Confirm the membership activated exactly once.
18. Confirm the first period ends exactly 30 calendar days after activation.
19. Confirm the portal unlocked.
20. Confirm the receipt and the activation email.
21. Confirm the first $25 renewal date equals the period boundary.
22. Confirm the ID source shows its deletion schedule (7 days post-review).
23. Exercise a cancellation or reversal path on a second test obligation.
24. Confirm the full audit history for every step above.
25. Confirm no product-commerce flag or capability was enabled anywhere.

## 30. Day 15 migration runbook

1. Before Day 12: complete the Day 15 checklist items (business account, entity,
   provider application, approval).
2. Enter the business method through the admin interface (hidden, untested state).
3. Run a test transaction end to end; verify the receipt; run a refund test where the
   method supports it; record both on the checklist.
4. On Day 15 (bridge `endAt`): the server automatically refuses new obligations on
   temporary methods; verify with a test member.
5. Open the migration queue; migrate every outstanding unpaid obligation to the
   business method (each migration is audited and notifies the member).
6. Confirm every affected member received the migration notice.
7. Disable the personal bridge methods (they remain in history, never deleted).
8. Export the bridge-period records; store the export.
9. Mark the bridge closed (closed_at, closed_by recorded).
10. If more time is genuinely needed: extend ONLY through the audited extension path
    (authorized admin, written reason, new expiration). Nothing extends silently.

## 31. Rollback and forward-fix plan

- Code: revert the PR merge commit (single squash) or roll back the Render deploy to
  the prior image; the flag being default-false means reverting configuration
  (`RESEARCH_FOUNDING_ACTIVATION_ENABLED=false`) instantly returns the deployment to
  byte-identical pre-FM behavior without a code rollback.
- SQL: rollback scripts ship beside each bundle for the reversible tables. The payment
  ledger, signatures, and audit tables are append-only BY DESIGN and must never be
  rolled back; the forward-fix strategy is compensating entries (reversal/refund
  states) plus superseding document versions.
- Data: no destructive DDL exists in any bundle (no truncate, no drop column on
  existing tables); applying a bundle to production is additive.
- Legal: a wrongly published version is superseded through the lifecycle
  (published -> superseded), never edited in place; signatures on the superseded
  version remain valid records.

## 32. Daily Samuel operating checklist

1. Open Admin -> Readiness: everything green that was green yesterday.
2. Open Admin -> Payment verification: review every reported payment against the actual
   receiving account; verify or mark (mismatch, duplicate, information requested).
3. Open Admin -> Identity queue: review pending uploads; verify or request clearer
   images.
4. Check the reconciliation report: obligations created, reported, verified, mismatches,
   duplicates, reversals, unverified backlog, per-destination totals.
5. Check upcoming and overdue renewals; confirm notices went out (outbox status).
6. Check ID sources due for deletion and confirm yesterday's deletions ran.
7. Check the bridge countdown; on Day 12 or later, work the Day 15 checklist.
8. Confirm no product-commerce flag is enabled.

## 33. Monitoring checklist

- Scheduler tick success and last-run timestamp (renewal notices, retention worker).
- Outbox: queued versus delivered counts, no stuck events.
- Error rates on the activation routes (4xx spikes mean member confusion, 5xx bugs).
- Storage: identity and evidence bucket access audit volumes (anomalies mean trouble).
- Duplicate-detection hits in the verification queue.
- Bridge state versus calendar (sunset approaching, extensions on record).
- CI status on the branch and main.

## 34. Evidence-based verdicts

**CODE READINESS: READY, subject to final CI status.** Every gate passed independently at
the final head: 2874 tests across 121 files (0 failures, 0 skips), 0 type errors, production
build success, both SQL bundles green on live scratch Postgres (the FM bundle 41/41 with 18
tables), and two independent adversarial audits (the release tree and the OpenSign
integration) at 0 confirmed majors. The directive's model (the $50-includes-30-days pricing,
the bridge, the state machine, identity, agreements, verification, idempotent activation,
renewals, Day 15) plus the OpenSign e-signature execution provider and the canonical
legacy-category mapping (section 9) are implemented and enforced in code and database
constraints, with OpenSign inert by default.

**MEMBERSHIP ACTIVATION READINESS: NOT READY FOR PRODUCTION** only because production
configuration, publication, and Samuel's controlled live test remain outstanding. No missing
legal document is a blocker: the activation required set is built from the canonical
final-package signing sequence, and the three legacy categories resolve via the documented
mapping (section 9). Every remaining item is external configuration or an operational step,
none is missing code.

**PRODUCTION CONFIGURATION READINESS: NOT READY** until Supabase storage (private buckets),
encryption keys, email (Resend domain + test send), bridge methods, the applied production
SQL, and the controlled production test are completed. The readiness page tracks each item in
the four-state vocabulary.

**PRODUCT COMMERCE READINESS: NOT READY** at 0 of 65 actual COA files on disk; 0 of 15 SKUs
purchase-eligible; commerce remains behind its kill switch. This does not block membership
activation.

No merge, production deployment, or production SQL occurred, and none will without
Samuel's explicit approval.

## 35. E-signature (OpenSign) integration

Added under the OpenSign / archive / delivery directive. OpenSign is wired as the
signature EXECUTION provider behind the existing Xenios agreement engine, entirely
inert by default (`RESEARCH_ESIGN_ENABLED` off).

**Why a separate provider boundary.** OpenSign is AGPL-3.0. It is integrated strictly at
the API/service boundary: no OpenSign source is vendored or forked into this repo, only a
small HTTP client. `docs/legal/third-party/OPENSIGN_NOTICE.md` records the license and the
posture. Any future self-hosting or modification of OpenSign itself is a separate
service-and-licensing workstream; the AGPL network-use obligations attach to the OpenSign
operator, not to this client.

**Xenios stays the source of legal truth.** The native agreement engine
(`documents.ts` + `signatures.ts`) owns document identity, version, source hash, required
order, separate-acknowledgment requirements, reacceptance, activation gating, and member
completion state. OpenSign only executes signatures. A member clears the agreement gate
only after the server processes a verified `completed` webhook; a browser redirect never
advances anything.

**Signing modes.** `view_only_public_policy`, `clickwrap_acceptance`, `typed_signature`,
`opensign_document`, `opensign_packet`. Public notices and routine acknowledgments stay on
the native engine; signature-heavy documents (the Membership Agreement, the arbitration
agreement, the release/waiver) can route through OpenSign. Not all 17 documents are forced
through OpenSign, and no signature-required document is reduced to a bare checkbox.

**Template mapping and drift.** Templates are keyed deterministically by mode + the mapped
Xenios version ids + their source content hashes. A source-hash change yields a NEW key, so
an old template can never be used with new legal text; `provisionTemplate` refuses when a
spec's hashes do not match the currently published versions.

**Webhook security.** `POST /api/research/webhooks/esign` is signature-gated, not
auth-gated. `verifyWebhook` computes HMAC-SHA256 of the exact raw body keyed by
`OPENSIGN_WEBHOOK_SECRET`, hex-compares with `crypto.timingSafeEqual` after a length guard,
and parses only after the signature verifies. Absent, non-hex, or wrong signatures reject
with no processing. Provider events are deduplicated by event id (a replay is a no-op: no
second ingest, no second email, no second archive row). The raw body and signature are
never logged. When esign is off, the webhook returns `capability_disabled`.

**Completed-file ingestion.** On a verified completion the server fetches the signed PDF and
the completion certificate immediately (the provider file URL is never trusted as
permanent), validates content type and size, computes SHA-256 of each (so integrity is
Xenios-owned, not a provider claim), and stores both plus a `metadata.json` in a private
Xenios bucket (`RESEARCH_ESIGN_BUCKET`, distinct from identity and evidence). A durable
archive record points at the refs and hashes.

**Gate advancement.** `requiredAgreementsSatisfied` gained an additive, fail-closed
`esignAcceptances` input: a completed OpenSign acceptance satisfies a category for the exact
published version id, exactly like a native signature, but never bypasses a missing
published version and never relaxes reacceptance. Both the select-method gate and the admin
verify path compose it.

**Member and admin document centers.** Members see their signed agreements and e-sign
requests with resume-signing and download links. Samuel's admin document center searches by
member, shows provider status, signed-PDF and certificate hashes, provider events, mints
short-lived authorized download URLs, produces a member packet ZIP (signed agreements and
certificates only; raw ID and payment evidence excluded by default; the `:memberId` is
guarded against Content-Disposition header injection), and can resend the completion notice.

**Email delivery.** On completion the member gets a portal-retrieval confirmation and Samuel
gets a records notice at `RESEARCH_ADMIN_RECORDS_EMAIL` (default `samuel@xeniostechnology.com`)
carrying the member, document, version, timestamp, and integrity hashes, plus a link into
the AUTHENTICATED admin document center (never a raw storage URL). Government IDs are never
attached or linked in email; payment evidence stays link-only behind its own authenticated
view.

**Local export.** A production website cannot write to a Windows path such as
`C:\Users\sboad\...`. The workflow is two-layer: Layer 1 is the Xenios private archive; Layer
2 is Samuel's authorized browser download (the member packet ZIP), which he saves to a local
folder such as `C:\Users\sboad\Documents\Xenios Research Archive\YYYY\MM\{member-id}-{name}\`.
A trusted desktop archive agent is left as a documented future seam; there is no internet-
exposed local filesystem endpoint and no folder watcher.

**Three-state and secrets.** The live `OpenSignAdapter` is constructed only after
`assertNoSyntheticDataInProduction`. `OPENSIGN_API_TOKEN` and `OPENSIGN_WEBHOOK_SECRET` are
read server-side only and never reach the client bundle, a `ServiceResult`, a thrown error,
or a log. The readiness page gained an `esign` area reporting the four-state vocabulary with
presence booleans and variable names only.

**Database.** Section 6 of the FM bundle: `research_fm_esign_templates`,
`research_fm_esign_requests`, `research_fm_esign_archive`, all RLS-enabled and server-only,
with UNIQUE `(member_id, idempotency_key)` (no duplicate provider document on a refresh) and a
partial-unique `provider_document_id` (one provider document maps to one request). The live
dry run passed 41/41 with 18 FM tables.

**External dependency (yours to provide).** The live path needs an OpenSign account and, set
server-side only: `OPENSIGN_BASE_URL`, `OPENSIGN_API_TOKEN`, `OPENSIGN_WEBHOOK_SECRET` (plus
the private `RESEARCH_ESIGN_BUCKET`). Until then the whole integration is inert. The exact
OpenSign v1.2 endpoint and payload shapes are isolated in localized mapping helpers in
`provider.ts`, flagged for confirmation against OpenSign's published API before live use;
confirming them is a small, contained edit and touches neither the crypto nor the resolver.

## 36. OpenSign sandbox signing runbook (Samuel-executed; prepared, not run)

1. Create an OpenSign sandbox account; obtain an API token.
2. Set `RESEARCH_ESIGN_ENABLED=true`, `RESEARCH_ESIGN_PROVIDER=opensign`,
   `OPENSIGN_BASE_URL` (sandbox), `OPENSIGN_API_TOKEN`, `OPENSIGN_WEBHOOK_SECRET`,
   `OPENSIGN_SANDBOX_MODE=true`, and create the private `RESEARCH_ESIGN_BUCKET`.
3. Register the sandbox webhook URL (`/api/research/webhooks/esign`) with the secret.
4. Confirm the OpenSign v1.2 request/response field shapes in `provider.ts` against the
   sandbox; adjust the mapping helpers if needed (localized).
5. Provision one test template; confirm the deterministic key + the stored template id.
6. Start one test signing session as a test member; open the signing link.
7. Complete the document in the sandbox.
8. Confirm the webhook signature verified, the signed PDF + certificate ingested, and the
   hashes recorded (admin document center).
9. Confirm the member portal copy and the completion emails (member + Samuel).
10. Confirm the secure admin download link and the packet ZIP.
11. Replay the webhook; confirm idempotency (no second ingest/email/archive).
12. Confirm a redirect alone does NOT complete the gate (only the webhook does).
13. Archive or delete sandbox artifacts per policy.

## 37. Archive and recovery runbook

- Every completed signing request has: the Xenios signing-request row (refs + hashes), the
  archive row, and the objects in `RESEARCH_ESIGN_BUCKET`. Any one can rebuild the admin
  document-center view of the others.
- To recover a member's documents: read the archive rows for the member, mint signed URLs
  for each ref, or produce the packet ZIP.
- If an archive-row write failed (logged, non-fatal), the signing-request row still carries
  the refs and hashes; the admin center reads both, so the completion still surfaces.
- Retention: signed legal documents are member legal records (retained); raw government IDs
  follow the 7-day identity retention, separate from the esign bucket.
