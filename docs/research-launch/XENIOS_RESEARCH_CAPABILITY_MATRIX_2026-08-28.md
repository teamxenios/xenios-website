# Xenios Research Capability Matrix — 2026-08-28

Every capability carries exactly one classification. "Enabled" never means
"finished" unless the authority column names a durable source; a fail-closed
surface is honest, not complete. Gate results (counts, commands, exit codes)
are recorded once, in `XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-28.md`; this
matrix cites the commits and tests that establish each classification.

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
| Research catalog (member) | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Server-resolved canonical offering actions; 420/420 runtime rows draft → request/informational actions only; four canonical variants and two price conflicts documented, not regenerated | `0989cfba`, `1164cc5`, `9d1ad2d`; 18 files / 171 + 24 files / 218 catalog tests |
| Catalog discovery presentation | PRODUCTION DISABLED (dormant source) | Seven-state parser and URL controls present; no producer for the DTO; `onAction` inert | `43a72023`; 27 files / 206 tests |
| Public storefront (`/research/catalog`) | PRODUCTION DISABLED | Unmounted, default-off, noindex; no durable publication adapter or approved copy | `9fbff3f`; `storefront/composition.test.ts` |
| Product detail | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Exact product + variant status truth; no purchase CTA without authority | `0989cfba`; `master-offering-detail`, `exact-variant-identity` tests |
| Add to cart / checkout / activation | PRODUCTION DISABLED | `resolveMasterOfferingAction` requires product AND variant `available_now` plus validated current/live authority; production repositories unavailable; money mutation disabled | `d02bc145`; `production-wiring.test.ts` 68/68; root item 2 residual |
| Early Access order request flow | ENABLED + AUTHORITATIVE (request intake) | Existing authoritative access rules; assisted-order request path; quantity authority bounded by the durable cart maximum | `77d3f69`; e2e launch-invariant suite 53/53 |
| Customer account overview / profile / security / interests / order detail | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Authenticated, request-identity-keyed projection; ten-route manifest; opaque detail path; denied return path-only | `1a301f1`, `0415a82e`, `880686c8`; 19 files / 317 + 22 files / 247 tests |
| Order history | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | `OrderHistoryAvailabilityDto`: numeric count only when complete; partial/unavailable never definitive; foreign-row disclosure impossible (fails closed) | `7ebc888`, `d02bc145`; `member-order-history`, `orders-projection` tests |
| Payment / billing truth | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | `paymentFromFacts`: durable due/captured/refunded facts only; new orders carry the ledger's zero refund fact; lifecycle labels never prove payment | `d02bc145` (independent review PASS) |
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
| Tebra scheduling adapter | HUMAN CONFIGURATION REQUIRED | Only disabled / direct_link / iframe / popup_widget; `review` never actionable; production requires release-bound durable authority | `b41de5af`; `tebra-scheduling.test.ts`; `XENIOS_RESEARCH_TEBRA_INTEGRATION_2026-08-28.md` |
| Tebra Patient Portal handoff | HUMAN CONFIGURATION REQUIRED | Separate durable portal authority; unavailable until configured | same |
| Telehealth presentation | HUMAN CONFIGURATION REQUIRED | Shown only when `TEBRA_TELEHEALTH_ENABLED=true` after attestation | same |
| Public Tebra configuration endpoint throttle | PRODUCTION DISABLED (guard) / open P2 | Endpoint serves truthful configuration; durable bounded guard (root item 5) reverted pending a concrete guard | `CLAUDE_DECISION_LOG.md` 2026-08-28T19:03Z |
| Organizations / Partners / Affiliates roots | ENABLED + AUTHORITATIVE (informational) | Exact informational roots only; apply, descendants, referral capture, economics closed | `b404b0e8`, `f36a1c10`; 11 files / 151 tests |
| Admin customer operations (CRM) | PRODUCTION DISABLED (dormant source) | Registrars uncalled; filtered-zero truth corrected; Trust Dial atomic port defined, composition unavailable | `dc10c3fd`, `cf482a2`, `8774a4a` |
| Admin inventory / lots / COAs | ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE | Movement evidence bound to canonical buckets; signed grants bound to the storage origin; private COA capabilities unavailable before side effects; aggregate remains `503` without durable RPC (item 17 rejected) | `dc10c3fd`, `c9b12a85` |
| Admin fulfillment | PRODUCTION DISABLED | Registrar uncalled; private operations boundary hardened | `a8ff044` |
| Assisted-order audit authority | FUTURE MIGRATION REQUIRED | Durable audit store source present; candidate SQL unapplied; bridge unmounted without authority | `197eeeb` |
| Client-account / invitation lifecycle | FUTURE MIGRATION REQUIRED | Candidate unapplied and outside the DAG; harness rejected (trust/TOCTOU/EOL/manifest) | `CONTROL/BLOCKERS/00-LANE01-MIGRATION-HARNESS-ADMISSION-REJECT.md` |
| Raw HTTP document policy (status, robots, canonical, schema) | ENABLED + AUTHORITATIVE | The root document and every SPA document answered by the policy resolver in production and dev; authoritative 404; template schema stripped. Static directory indexes under `dist/public` (the `/hino` subtree) are served as files exactly as production does, with the production-parity `/hino` → `/hino/` redirect answered only for index-bearing directories so asset-only directories (`/research/*.jpg`) never redirect an SPA document (`7931044a` … `14f154bd` corrected the `600e45a` regression that had routed `/hino/` into the SPA shell and the interim `/research` 301). `RESEARCH_INDEXABLE` gate honoured at the HTTP layer: public Research documents are noindex at header and meta until the flag is `true`, while the marketing site stays indexable (`dc70fb17` + `679564fc`, production parity) | `0a2ef2b`, `600e45a`, `7931044a`, `42c9bdba`, `14f154bd`, `dc70fb17`, `679564fc`; `server/static.test.ts` 11/11, `raw-http-document-policy.test.ts` (incl. gate cases) |
| Research indexing / sitemap publication | HUMAN CONFIGURATION REQUIRED | `RESEARCH_INDEXABLE` stays false; sitemap unchanged; raw policy would index the reviewed Research documents once the founder decides | `602311ad`; `sitemap-parity.test.ts` |
| Privacy: request/error logging | ENABLED + AUTHORITATIVE | Server-generated request ids; route templates only; no bodies, identifiers, or exception text | `40bae71`; `request-logging.test.ts` |
| Privacy: attribution and tracking | ENABLED + AUTHORITATIVE | Research/Care/recovery locations never reach storage or submissions; public vocabulary constrained | `b41de5af`, `a01d152` |
| Reduced motion, touch targets (Research chrome) | ENABLED + AUTHORITATIVE (structural) | Centralised scroll behaviour; 44 px minima in Research subnav, footer, header, sign-out; browser geometry measured in the evidence packet | `75f68fe`, `9c404d7`, `460138b`, `e8569c15` |
| Global marketing shell touch targets (Navbar/Footer/TopRibbon) | HUMAN CONFIGURATION REQUIRED (founder decision on protected shell) | Hard-tripwire protected; findings recorded by the a11y helper; not changed by this candidate | `CONTROL/HANDOFFS/CLAUDE-HELPER-A11Y-EVIDENCE-HANDOFF.md` §5A |
| Hino / public-site continuity | ENABLED + AUTHORITATIVE | `/hino` tree byte-identical to production; core protection tripwire re-pinned only for reviewed global changes | `ea4e294`; core-site gate 21 hashes verified |
| 404 and error handling | ENABLED + AUTHORITATIVE | Authoritative HTTP 404 + noindex from the raw policy; public error message never carries exception text | `600e45a`, `40bae71` |
| Production deployment from this program | PRODUCTION DISABLED | Human-controlled later decision | mutation ledger: NO |
| Production or shared-staging migration from this program | PRODUCTION DISABLED | Human-controlled later decision | mutation ledger: NO |
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
- Gate counts live only in the RC document.  YES
