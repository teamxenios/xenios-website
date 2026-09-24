# Independent Xenios audit and contact repair — NOT READY

## Exact source identities

| Role | Identity |
| --- | --- |
| Fresh production, rechecked 2026-09-24 19:35 UTC | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` |
| Live Render deploy | `dep-daqft3vf3r2c73b7e88g` on `srv-d8s9vej7uimc7384dfcg` |
| Baseline candidate | `0574264562f33fe40572b1d9976f4700bef9c83e` |
| Baseline tree | `0f4c05b8fa8e4d927c8de693085b58d96ac1febd` |
| Audit base, documentation successor | `c8ea24944f277e5b0770d5446687f2752db3ab73` |
| Frozen baseline evidence commit | `a81c0a34bbd73f024f02fa8e8a9a563a7f9044a1` |
| Pushed repair / browser runtime | `02d525baa7d784ed16e297c1d17b1e4050ecf4cc` |
| Repair tree | `cd9b2abf2fc90c01956e447fd4c124b3093ff343` |
| Branch | `codex/xenios-adversarial-audit-20260924` |
| Exact repair dist | 346 files; inventory SHA256 `f51b1a21d6f8667b4939219ac2c12981dfa7ef06a769dc33afb5dc0716759be1` |

The final documentation/handoff commit is separate from the runtime SHA. All application changes are in the repair commit. Node 20.19.0 and npm 10.8.2 were pinned. `repair-build-provenance.json` binds the clean isolated build to its SHA/tree/lockfile/inventory.

## Demonstrated repair

AUD-001 (P1) reproduced at the original candidate: a synthetic partnership inquiry received HTTP 200 and “Inquiry received” even though the preview had no email provider. No durable inquiry was stored. The route started email operations without waiting; the email functions silently returned on missing configuration and ignored provider error responses.

The repair preserves the existing email-owned contact contract. It waits for the team message's provider acceptance, treats missing configuration, provider errors and malformed acceptance responses as failures, and returns HTTP 503 with a direct-email fallback when receipt cannot be confirmed. It sends the courtesy confirmation only after team acceptance. A courtesy-only failure remains a successful inquiry and explicitly tells the user not to resubmit. Inquiry copy distinguishes acceptance for delivery from inbox delivery, human review and account approval. Draft values remain on failure. The email's unsupported two-business-day promise was removed; the separate corporate page still has that copy and needs an operational decision.

No Auth, admin guard, account identity, pricing, product authority, clinical boundary, payment settlement rule, database schema, outbox or production configuration was changed.

## Fresh validation

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Focused contact + Care regression | PASS, 5 files / 33 tests | Provider configuration/rejection/malformed acceptance, awaited team message, courtesy failure, retained draft, canonical contact request and existing Care contract |
| Typecheck | PASS | `check.log` |
| Exact pinned production build | PASS | `repair-build.log`; Vite chunk-size and mixed import warnings remain |
| Full suite | NOT GREEN | 972 files pass, 1 fails, 6 skip; 18,049 tests pass, 1 fails, 85 skip. `full-tests.log` |
| Sole suite failure | Protected file fingerprint | `server/routes.ts`; see protection review below |
| Migration DAG | PASS | 37 nodes, canonical checksums verified; no migration applied |
| Route uniqueness | PASS | 448 registrations, 439 call sites; no new route added |
| Bound production-state verifier | FAIL | Stale central production evidence refers to c545a70; fresh expected base/head supplied. `verify-production-state-bound.log` |
| Qualified release manifest | NOT RUN / BLOCKED | No new lead-approved manifest. The bare command's usage error is retained as an unsuccessful invocation, not a validation result. |
| Exact site-system record | FAIL on clean post-commit tree | Three generated site record files are stale. `site-record-clean-check.log`. Initial dirty-tree refusal is also retained. |
| Missing-provider browser retest | PASS | Exact repair bundle, no provider: 503/error, retained draft, no false receipt; `evidence/repair-no-provider-result.*` |
| Accepted email browser scenario | PASS, synthetic only | Network-blocked capture returns synthetic acceptance; `repair-synthetic-accepted.txt` |
| Courtesy rejection browser scenario | PASS, synthetic only | Team acceptance + rejected confirmation; no resubmit instruction; `repair-synthetic-courtesy-failure.*` |
| Corporate contact regression | PASS, synthetic only | Same actual bundle and captured provider seam; `repair-corporate-contact-accepted.txt` |
| Native Google Doc refresh | PASS | All 18 tabs updated/read back, both original inline images preserved; `google-doc-verification.json` |

## Coverage and limits

`coverage-summary.json`, `route-inventory.json`, `CTA_MATRIX.csv` and `BASELINE_COVERAGE.md` are the coverage ledger. Current counts: 242 observations, 237 unique snapshot IDs, 3,910 observed controls, 222 source route declarations. 196 declarations have a browser entry observation; 23 are NOT RUN and 3 are router wildcards rather than discrete scenarios. These numbers include repeats, held gates and loading snapshots; they are not full scenario pass counts. The CTA matrix explicitly does not mark observed controls exercised merely because they rendered.

Browser work includes public corporate/Research/Care pages, intent chooser, closed applications, missing/invalid status-token recovery, internal return routing, external return rejection, synthetic active/empty/paused account states, account navigation/support/sign-out, partner/no-partner boundaries, signed-out admin gates, and exact responsive access-hub samples. A public lot lookup correctly says its source is unavailable rather than inventing nonexistence. Accessibility policy clearly remains a draft.

An additional isolated existing native fixture exercised the real admin guard: its configured synthetic admin opened and answered a seeded operational question; a different synthetic user was denied. Fixture diagnostics show zero external mutations and one memory notification intent. Its startup loopback readiness warning is fixture-only. A later cross-owner browser navigation lost its tab and is NOT RUN, not a security pass.

Missing evidence remains substantial: every meaningful CTA, full keyboard/zoom/network/retry/duplicate-state coverage, valid/expired/consumed/approved token lifecycles, production-equivalent cross-owner histories and documents, all privileged admin/partner/supplier/clinical/payment/fulfillment transitions, operator inbox delivery and durable notifications. Existing isolated fixtures do not support all those doors. Real test identities/provider sinks were not supplied. Tests supplement but do not replace those browser scenarios.

## Protected change requiring lead review

The exact narrow `server/routes.ts` diff replaces fire-and-forget contact sends with the awaited `deliverContact` result. Its existing validation, honeypot and rate limit remain. No other registration or authorization logic is changed.

- Manifest fingerprint: `sha256:feb276a9f6412c16deb352d267b3c2216ea251b32f0769bd42a66b1edd9f73c4`.
- Reviewed repair fingerprint: `sha256:deb5c6b56ab131965ac857413b066b06db1e003c0ee847c0ffb16ced15860cce`.
- `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` was not edited. The launch ownership registry reserves it to the integrator. The integrator must review the real protected change, document authority and rationale, and perform any legitimate reconciliation. A hash-only update to force green is not a release review.

## Remaining findings and next work

1. Release blocker: protected-route review and legitimate lead-owned fingerprint reconciliation.
2. Release blocker: stale central production evidence and qualified release-manifest/site-record workflow.
3. Evidence blocker: isolated, production-equivalent token/owner/admin/partner/supplier fixtures and approved delivery capture for unsupported lifecycles. No request to use real customer data or send real test email.
4. Coverage gap: complete meaningful CTA, responsive/accessibility and failure/retry scenarios; the current broad entry audit is not the requested exhaustive qualification.
5. Deferred P2 candidates: Prepare inquiry wording; unverified corporate two-business-day promise; public secure-documents link targets the held legacy member-documents route despite a supported account document area. Confirm operational intent before repair.

P0 absence is NOT established. AUD-001 is repaired and locally retested; this is not a statement that all P1 issues are resolved.

## Production boundary and later release conditions

No deployment or merge is requested. Production was rechecked unchanged at 19:35 UTC; health remains running with commerceEnabled=false. Applications and native commerce were not opened. No real email, charge, settlement, refund, payout, fulfillment, clinical record, production account or secret was mutated.

Before any future release: complete the missing qualification, resolve lead-owned gates, bind final manifest/build/evidence to one exact SHA, recheck live production, and obtain Samuel's current explicit approval. If subsequently authorized, use the then-current verified production build as rollback; the current candidate rollback reference is 79414143, not an assumed older handoff. Post-release smoke must verify health, disabled commerce/applications, entry/recovery, authorized account/admin boundaries and approved captured notification scenarios. No rollback or smoke mutation is authorized by this packet.
