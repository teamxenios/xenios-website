# Xenios Research Capability Matrix — 2026-08-28

Every capability carries exactly one classification. "Enabled" never means
"finished" unless the authority column names a durable source; a fail-closed
surface is honest, not complete. The comprehensive gate-results table (counts,
commands, and exit codes) lives in
`XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-29.md`; this matrix may repeat bounded
machine totals where they directly support a classification. This matrix
describes pushed runtime freeze
`2d662a0d31bb1de9332fb5c591f01cab76b991b1` (tree
`c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5`) and pushed evidence freeze
`c01569169cad5e6619187221d84019ae8bfc7c69` (tree
`c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019`), not current live production
`3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`. The evidence freeze differs from the runtime freeze only in
`scripts/evidence/routes.public.json`,
`scripts/evidence/routes-public.test.mjs`, and
`scripts/release/critical-endpoint-expectations.json`, plus
`scripts/evidence/lib/cdp.mjs`,
`scripts/evidence/network-boundary.test.mjs`,
`scripts/evidence/capture-synthetic-journeys.mjs`, and
`scripts/evidence/capture-synthetic-journeys.test.mjs`. The R11 technical
bundle is sealed PASS at 21/21 gates. A historical bounded db9 preflight smoke passed
9/9 HTTP records and 54 browser captures with zero failures. Exact-193 retry1
is `EXCLUDED_EXTERNAL_INTERRUPTION`: Windows Modern Standby Event 506 at
`2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` caused CDP loss after 224/1,100 observations
(180 PASS + 44 PASS_WITH_NOTES + 0 FAIL), with targeted partners 11/11 PASS
and no product or harness defect. Retry2 ran at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830`;
it used PowerShell 7.6.5 with a temporary
nonzero `0x80000043` execution-state guard, no persistent setting, and 1.89 GiB
preflight memory. It later completed primary 1,100/1,100 at 1,023 PASS + 77
PASS_WITH_NOTES + 0 FAIL with focused gates PASS, but is now
`EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE` because synthetic stopped 10/20 on a
service-worker CDP restart. Three valid diagnostics yielded one PASS and two
exact race reproductions, with no product or network failure.

The e641 three-run smoke is excluded at 2 PASS + 1 FAIL. At exact c015, the
focused suite passed 53/53 and three canonical prerequisite runs each passed
20 captures as 18 PASS + 2 declared notes + 0 FAIL with boundary 0 and PII
CLEAN. Retry3 stopped before evidence on a wrapper-only suite-count assertion
after exact clone/build and actual 3-suite/23-test focused PASS. Retry3b passed
network-boundary 23 and routes 17 but stopped before preview because its
wrapper assumed a fixed Vitest suite total instead of the observed
describe-block totals 3 then 2. Both guards reset, neither attempt may resume
or be reused, and neither failure is a candidate defect. Current phase is
Retry3c full evidence is now sealed: HTTP 100/100; browser 1,100 = 1,023 PASS
plus 77 expected notes and 0 fail on the first attempt; focused early, assisted,
negative and unknown 11/11 each and account 99/99, all zero fail and clean;
synthetic 20 = 18 PASS + 2 expected-denial notes + 0 fail; evidence tests 13
files/213 tests/46 describe suites; release scan 0/0 non-skipped; and PII CLEAN
with 0 findings across 2,332 text / 1,120 PNG manual-review inventory / 0
unscannable. Evidence manifest SHA-256 is
`1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257`.
The wrapper-only 46-vs-13 stop and excluded fixture-scan attempt remain
disclosed; reserved-fixture endpoint recapture passed 16/11/0/0 with config
HTTP 200. The bounded packet at
`docs/review/xenios-research-full-site-20260829` is generated and validated:
192 files = 191 payload + inventory self, with 72 PNG + 72 text (36
desktop-1440 + 36 mobile-390 pairs); packet inventory `6dab7745…`, payload
inventory `f6ef58ea…`. Manual visual/privacy QA covered 18 PNG/9 areas/2
viewports with 0 blocking visual and 0 privacy findings; five cosmetic items
are backlog. Canonical release-manifest verification passed under Node
20.19.0/npm 10.8.2 at SHA-256 `16f08fd2…`, binding the packet and
assisted-order environment inventory. Current phase remains
**PACKET_FINALIZING**; the records/evidence successor SHA, exact-final-SHA
checks, final RC assignment, detached review and deployment remain unassigned.

## Allowed classifications

- **ENABLED + AUTHORITATIVE** — served from a durable, current source of truth.
- **ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE** — served, but renders an explicit
  unknown/unavailable/partial state whenever its source cannot prove a fact.
- **PRODUCTION DISABLED** — code exists and is tested, but production cannot
  reach it (unmounted, unavailable adapter, or capability denial first).
- **HUMAN CONFIGURATION REQUIRED** — blocked only on an external credential,
  URL, approval, or founder decision; a polished truthful fallback is served.
- **FUTURE MIGRATION REQUIRED** — depends on a database change that is
  unapplied and outside the migration DAG.

## Matrix

| Capability | Classification | Authority or honest fallback | Establishing evidence |
| --- | --- | --- | --- |
| Public Research homepage (warm-silver editorial) | ENABLED + AUTHORITATIVE | Lane 02 source semantically composed with the exact reviewed hero; catalog doors closed; Gateway anchor allowlist adjudicated | `6597df46`, `72d7676b`, `602311ad`; `Gateway.catalog-guard.test.tsx`; browser matrix packet |
| Access Hub, About, How it works, FAQ, Policies, Contact, Support | ENABLED + AUTHORITATIVE | Protected router + public allowlist + manifest composed by Lead | `72d7676b`; `routes-parity`, `recovery-route-isolation`, `public-brand-pages` tests |
| Accessibility Statement | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Served as an explicit operational draft (`Draft status` section); counsel review pending | `602311ad`; `shared/research/paths.test.ts`, `route-policy.test.ts` |
| Quality, Testing, Documents pages | ENABLED + AUTHORITATIVE (informational) | Static informational documents in the exact public-document allowlist; copy narrowed away from clinical wording; affirmative operational claims remain a counsel gate | `1a065e0c`, `6edcb2e`; `quality-surfaces`, `lot-lookup` tests |
| Public lot verification page | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Client page renders the explicit unavailable state; API unmounted | `1a065e0c`; `lot-lookup.test.tsx` |
| Public lot verification API (`registerPublicQualityApi`) | PRODUCTION DISABLED | Not registered; requires durable publication, immutable reads, audit, keyed-HMAC/trusted-proxy rate authority, bounded streaming (item 4 admitted as dormant source `6342c25`) | `server/research/quality/public-lot-api.test.ts`; route-parity control |
| Research catalog (member) | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Server-resolved canonical offering actions; draft or unavailable rows remain request/informational actions only; no product-live claim comes from this matrix | `0989cfba`, `1164cc5`, `9d1ad2d`; catalog authority suites in the sealed technical bundle |
| Catalog discovery presentation | PRODUCTION DISABLED (dormant source) | Seven-state parser and URL controls present; no producer for the DTO; `onAction` inert | `43a72023`; catalog discovery suites in the sealed technical bundle |
| Public storefront (`/research/catalog`) | PRODUCTION DISABLED | Unmounted, default-off, noindex; no durable publication adapter or approved copy | `9fbff3f`; `storefront/composition.test.ts` |
| Product detail | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Exact product + variant status truth; no purchase CTA without authority | `0989cfba`; `master-offering-detail`, `exact-variant-identity` tests |
| Add to cart / checkout / activation | PRODUCTION DISABLED | `resolveMasterOfferingAction` requires product AND variant `available_now` plus validated current/live authority; production repositories unavailable; money mutation disabled | `d02bc145`; `production-wiring.test.ts`; root item 2 residual |
| Early Access order request flow | ENABLED + AUTHORITATIVE (request intake) | Existing authoritative access rules; assisted-order request path; quantity authority bounded by the durable cart maximum | `77d3f69`; e2e launch-invariant suite |
| Customer account overview / profile / security / interests / order detail | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Authenticated, request-identity-keyed projection; ten-route manifest; opaque detail path; denied return path-only | `1a301f1`, `0415a82e`, `880686c8`; customer-account suites in the sealed technical bundle |
| Order history | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | `OrderHistoryAvailabilityDto`: numeric count only when complete; partial/unavailable never definitive; foreign-row disclosure impossible (fails closed) | `7ebc888`, `d02bc145`; `member-order-history`, `orders-projection` tests |
| Payment / billing truth | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | `paymentFromFacts`: durable due/captured/refunded facts only; new orders carry the ledger's zero refund fact; lifecycle labels never prove payment | `d02bc145`; `server/research/customer-account/orders-projection.test.ts` and `server/research/providers/stripe-billing.test.ts` in the sealed `targeted-domains.log` |
| Refund execution | PRODUCTION DISABLED | `durableRefundExecutionAvailable: false`; capability denial precedes replay/provider work; atomic correction (root item 1) not admitted | `refunds.test.ts`, `production-wiring.test.ts` |
| Fulfillment / tracking | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Shipment evidence from a connected source only; no carrier inference | `orders-projection.test.ts` |
| Payment / fulfillment webhooks | PRODUCTION DISABLED | No atomic inbox+order adapter; `capability_disabled` before verification | `webhooks.test.ts` |
| Membership renewal | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | `renewal` discriminant: scheduled / not_scheduled (durable proof) / unavailable | `contract.test.ts`, `SubscriptionView` tests |
| Care/pharmacy history | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | available+count / partial+null / unavailable+null | `contract.test.ts` |
| Account Care view | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Current authorized stage only; no inferred prior stages, approval, prescription, or pharmacy state; exact Tebra fallback sentence | `880686c8`; `care-route-contract.test.tsx` |
| Account support submissions | ENABLED + AUTHORITATIVE | Durable rate limiter; fails closed when the durable limiter is unavailable | `880686c8`; `support-rate-limit.test.ts` |
| Documents | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Customer-scoped records or explicit unavailable; private `no-store` on every response | `26093ed`; `customer-account/routes.test.ts` |
| Member cart identity | ENABLED + AUTHORITATIVE | Cart isolated by session identity; cleared on logout/account switch | `7e5a158`; `core-cart-session-privacy.test.tsx` |
| Care public experience | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Provider-governed boundary separate from Research; self-only Care CSP; tracking suppressed | `b41de5af`; `server/care` suites |
| Clinical write routes | PRODUCTION DISABLED (gated) | Canonical capability gate on 20 routes; refusals before repositories; no actor/patient in logs | `aefac85`; `clinical-write-gate*.test.ts` |
| Tebra scheduling adapter | PRODUCTION DISABLED | Disabled/unconfigured in this release; `review` is never actionable and future production enablement requires separately approved, release-bound durable authority | `b41de5af`; `tebra-scheduling.test.ts`; `XENIOS_RESEARCH_TEBRA_INTEGRATION_2026-08-28.md` |
| Tebra Patient Portal handoff | PRODUCTION DISABLED | No configured portal authority; a future exact approved URL and separate activation are required | same |
| Telehealth presentation | PRODUCTION DISABLED | Not entitled, attested, or enabled; a future separate configuration may expose it only after approval | same |
| Public Tebra configuration endpoint throttle | PRODUCTION DISABLED (non-blocking post-release backlog) | Endpoint serves truthful disabled configuration; a future durable bounded guard requires a concrete authority and does not block this safely disabled release | `CLAUDE_DECISION_LOG.md` 2026-08-28T19:03Z; 2026-08-29 RC disposition |
| Organizations / Partners / Affiliates roots | ENABLED + AUTHORITATIVE (informational) | Exact informational roots only; apply, descendants, referral capture, economics closed | `b404b0e8`, `f36a1c10`; public-brand route suites |
| Admin customer operations (CRM) | PRODUCTION DISABLED (dormant source) | Registrars uncalled; filtered-zero truth corrected; Trust Dial atomic port defined, composition unavailable | `dc10c3fd`, `cf482a2`, `8774a4a` |
| Admin inventory / lots / COAs | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Movement evidence bound to canonical buckets; signed grants bound to the storage origin; private COA capabilities unavailable before side effects; aggregate remains `503` without durable RPC (item 17 rejected) | `dc10c3fd`, `c9b12a85` |
| Admin fulfillment | PRODUCTION DISABLED | Registrar uncalled; private operations boundary hardened | `a8ff044` |
| Assisted-order audit authority | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Config probe plus nine operational routes always register. `durable_store` uses durable authority; the production-shaped `log_line_nondurable` mode discloses non-durable logging; `unavailable` returns an explicit unavailable response. Enabled config is HTTP 200 and cannot fall through to generic 404. No migration ships. | `0e1b60a` … `2d662a0`; R11 production-root boot/HTTP gate; critical-endpoint comparison |
| Client-account / invitation lifecycle | FUTURE MIGRATION REQUIRED | Candidate unapplied and outside the DAG; harness rejected (trust/TOCTOU/EOL/manifest) | `CONTROL/BLOCKERS/00-LANE01-MIGRATION-HARNESS-ADMISSION-REJECT.md` |
| Raw HTTP document policy (status, robots, canonical, schema) | ENABLED + AUTHORITATIVE | The root document and every SPA document are answered by the policy resolver in production and dev; authoritative 404; template schema stripped. Static directory indexes under `dist/public` (the `/hino` subtree) are served as files exactly as production does, with the production-parity `/hino` → `/hino/` redirect answered only for index-bearing directories so asset-only directories never redirect an SPA document. `RESEARCH_INDEXABLE` is honoured at the HTTP layer: public Research documents are noindex at header and meta until true, while the marketing site stays indexable. Raw response-byte canonicalization established at historical commit `efb30f57` is preserved in runtime freeze `2d662a0`; the evidence-only fingerprint re-pin is `193b307`, e641 adds CDP lifecycle controls, and current c015 applies the lifecycle contract to the canonical synthetic runner. | `0a2ef2b`, `600e45a`, `7931044a`, `42c9bdba`, `14f154bd`, `dc70fb17`, `679564fc`, `efb30f57`, `2d662a0`, `193b307`, `e64122d6`, `c0156916`; R11 raw-document/static gates; c015 sealed HTTP 100/100, endpoint recapture 16/11/0/0 with config 200, evidence manifest `1f90d4fe…` |
| Research indexing / sitemap publication | PRODUCTION DISABLED | `RESEARCH_INDEXABLE` stays false and the sitemap remains unchanged; any future publication is a separate decision, not a blocker to this safely noindexed release | `602311ad`; `sitemap-parity.test.ts` |
| Privacy: request/error logging | ENABLED + AUTHORITATIVE | Server-generated request ids; route templates only; no bodies, identifiers, or exception text | `40bae71`; `request-logging.test.ts` |
| Privacy: attribution and tracking | ENABLED + AUTHORITATIVE | Research/Care/recovery locations never reach storage or submissions; public vocabulary constrained | `b41de5af`, `a01d152` |
| Reduced motion, touch targets (Research chrome) | ENABLED + AUTHORITATIVE (structural) | Centralised scroll behaviour; 44 px minima in Research subnav, footer, header, and sign-out. Runtime `2d662a0` also gives assisted-order text inputs, selects, and textareas a 44 px minimum while explicitly excluding checkbox/radio sizing. Historical retries remain disclosed; exact-c015 retry3c browser evidence is sealed at 1,100 = 1,023 PASS + 77 expected notes + 0 fail on the first attempt, with PII CLEAN. | `75f68fe`, `9c404d7`, `460138b`, `e8569c15`, `2d662a0`, `c0156916`; `client/src/research/assisted-order/assisted-order-accessibility.test.ts`; evidence manifest `1f90d4fe…` |
| Global marketing shell touch targets (Navbar/Footer/TopRibbon) | ENABLED + AUTHORITATIVE (structural) | Reviewed candidate changes are fully classified by the core disposition; no separate acknowledgement is required beyond exact-SHA GO | `XENIOS_RESEARCH_CORE_SITE_PROTECTION_DISPOSITION_2026-08-29.md` |
| Hino / public-site continuity | ENABLED + AUTHORITATIVE | `/hino` tree is production-compatible; core protection tripwire re-pinned only for reviewed global changes | `ea4e294`; sealed core-site gate and 2026-08-29 disposition |
| 404 and error handling | ENABLED + AUTHORITATIVE | Authoritative HTTP 404 + noindex from the raw policy; public error message never carries exception text | `600e45a`, `40bae71` |
| Recut production deployment | PRODUCTION DISABLED | Runtime `2d662a0` and evidence freeze `c0156916` are pushed, retry3c full evidence is sealed, and the bounded 192-file packet is generated/validated. State remains PACKET_FINALIZING because the records/evidence successor SHA, exact-final-SHA checks, final RC assignment and detached review are not closed. Samuel's exact-final-RC-SHA GO is therefore not yet requestable. Failed `eb659d8100a3b9831d52688120931c48d10330d9` / `dep-da94b91srm7s73b55dsg` remains disqualified; live production remains `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` / `dep-da94g05g1s2s7396lkv0`. | Packet inventory `6dab7745…`; canonical manifest `16f08fd2…`; 2026-08-29 deploy record; recut mutation ledger: NO |
| Production or shared-staging migration from this recut | PRODUCTION DISABLED | No migration is required, authorized, or applied | mutation ledger: NO / NO / NO |
| Real invitations, accounts, external messages | PRODUCTION DISABLED | No external send exists in this program | mutation ledger: 0 |

## Classification rules

1. A capability is ENABLED + AUTHORITATIVE only when the serving path reads a
   durable current source and every failure of that source renders an
   explicit unavailable state rather than a default.
2. A capability whose production adapter is the explicit unavailable adapter,
   whose registrar is uncalled, or whose first check is a capability denial is
   PRODUCTION DISABLED regardless of how much tested code exists behind it.
3. A capability blocked solely on a human input is HUMAN CONFIGURATION
   REQUIRED and must already serve its polished fallback.
4. A capability that needs an unapplied database change is FUTURE MIGRATION
   REQUIRED; no live claim may depend on it.
5. No row may say "complete" while its authority cell names a fallback.

## Finalization check

- Every row has exactly one classification.  YES
- Every classification cites a commit, test, or ledger entry.  YES
- The comprehensive exact gate table lives in the RC document; bounded
  supporting totals may be repeated here.  YES
