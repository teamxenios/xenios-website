# Xenios Research Rollback Plan — 2026-08-28

## Current state and boundary

| Item | Value |
| --- | --- |
| Attested production SHA | 3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 |
| Attested production branch | release/early-access-code-session-checkout (auto-deploy off) |
| Current live deployment | dep-da94g05g1s2s7396lkv0 (Render service srv-d8s9vej7uimc7384dfcg) |
| Failed deployment already rolled back | eb659d8100a3b9831d52688120931c48d10330d9 / dep-da94b91srm7s73b55dsg |
| Pushed runtime freeze | 2d662a0d31bb1de9332fb5c591f01cab76b991b1 / tree c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5 |
| Pushed evidence freeze | c01569169cad5e6619187221d84019ae8bfc7c69 / tree c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019 |
| Runtime-to-evidence delta | Exactly `scripts/evidence/routes.public.json`, `scripts/evidence/routes-public.test.mjs`, `scripts/release/critical-endpoint-expectations.json`, `scripts/evidence/lib/cdp.mjs`, `scripts/evidence/network-boundary.test.mjs`, `scripts/evidence/capture-synthetic-journeys.mjs`, and `scripts/evidence/capture-synthetic-journeys.test.mjs` |
| R11 technical bundle | PASS 21/21 exact-runtime gates |
| Historical bounded preflight smoke | db9: HTTP 9/9; browser 54 captures, zero failures; not current c015 final validation |
| Current c015 evidence and packet | `FULL_EVIDENCE_SEALED`: HTTP 100/100; browser 1,100 = 1,023 PASS + 77 expected notes + 0 fail first attempt; focused 11/11, 11/11, 11/11, 11/11 and 99/99 all clean; synthetic 20 = 18 + 2 expected denial + 0; evidence tests 13 files/213 tests/46 suites; release scan 0/0 non-skipped; PII CLEAN 0 across 2,332 text / 1,120 PNG manual-review inventory / 0 unscannable; evidence manifest `1f90d4fe…`. Bounded packet generated/validated: 192 = 191 payload + self; packet inventory `6dab7745…`; payload `f6ef58ea…`; canonical manifest PASS `16f08fd2…`. Records/evidence successor `8bd8df8f…` and continuity successor `0f3b3a33…` are pushed and origin-verified; final records-only consistency successor/final RC/review pending by self-reference. |
| Recut deployed | NO |
| Migrations applied by this program | NO (production and shared staging untouched) |
| Real accounts, invitations, product activations, pricing or payment effects, external messages | 0 / 0 / 0 / none / 0 |

The disqualified `eb659d81…` deployment was rolled back on 2026-08-29 after
the assisted-order config route regressed from live HTTP 200 to generic 404.
Production is now exactly the rollback SHA above at `dep-da94g05g1s2s7396lkv0`.
The recut runtime `2d662a0…` is frozen and R11-gated, not deployed. The R11
machine results are: assisted production 6 files/115 tests;
endpoint/static/SEO/Hino 4/79; targeted domains 196/3,116; canonical E2E
4/53; full sequential suite 807 files (803 passed/4 skipped), 12,092 tests
(12,049 passed/43 skipped), zero failures in 469.08s; and evidence tooling
13 files/208 tests (196 passed/12 skipped), zero failures. These technical
results are now complemented by sealed exact-c015 retry3c evidence, the
validated bounded packet and pushed/origin-verified records/evidence successor
`8bd8df8f…` and continuity successor `0f3b3a33…`. They do not substitute for
the still-pending final records-only consistency successor, exact-final-SHA
checks or detached final-RC review.

Retry1 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry1-20260830`
is excluded after Windows Modern Standby Event 506 at
`2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` caused CDP loss. It had 224/1,100 primary
observations (180 PASS + 44 PASS_WITH_NOTES + 0 FAIL) and targeted partners
11/11 PASS; no product or harness defect was found. Retry2 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830`.
completed primary 1,100/1,100 at 1,023 PASS + 77 PASS_WITH_NOTES + 0 FAIL and
its focused gates passed, but is `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE` because
synthetic stopped 10/20 on a service-worker CDP restart. Three valid
diagnostics yielded one PASS and two exact race reproductions, with no product
or network failure.

The e641 smoke is excluded at 2 PASS + 1 FAIL. Current evidence freeze c015
changes only the seven evidence/test files listed above. Its focused suite
passed 53/53, and three canonical prerequisite runs each passed 20 captures as
18 PASS + 2 declared notes + 0 FAIL with boundary 0 and PII CLEAN. Retry3
stopped pre-evidence on a wrapper-only one-suite assertion after clone/build
and actual 3-suite/23-test focused PASS. Retry3b passed network-boundary 23 and
routes 17 but stopped pre-preview because its wrapper assumed fixed suite total
3 while Vitest reported describe-block totals 3 then 2. Both guards reset; no
candidate defect was found; neither attempt may resume or be reused. Exact-c015
retry3c full evidence is sealed: HTTP 100/100; browser 1,100 = 1,023 PASS + 77
expected notes + 0 fail on the first attempt; all five focused groups are
zero-fail and clean; synthetic 20 = 18 PASS + 2 expected-denial notes + 0 fail;
evidence tests 13 files/213 tests/46 describe suites; release scan 0/0
non-skipped; and PII CLEAN with 0 findings across 2,332 text / 1,120 PNG
manual-review inventory / 0 unscannable. Evidence manifest SHA-256 is
`1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257`.
The wrapper-only 46-vs-13 stop and excluded fixture-scan attempt remain
disclosed; reserved-fixture endpoint recapture passed 16/11/0/0 with config
200. The bounded packet at `docs/review/xenios-research-full-site-20260829` is
generated and validated at 192 files = 191 payload + inventory self; packet
inventory `6dab7745…`, payload inventory `f6ef58ea…`; representative manual QA
covered 18 PNG/9 areas/2 viewports with 0 blocking visual and 0 privacy
findings. Canonical release-manifest verification passed under Node
20.19.0/npm 10.8.2 at SHA-256 `16f08fd2…`. Records/evidence successor
`8bd8df8f556d8e84bc9c8daef1871d6a59b58590` is pushed, origin-verified and
non-skipped scanned at 0 secret/0 PII. State is `CODEX_DETACHED_REVIEW`; the
continuity successor `0f3b3a334312273775ecf2efa4e3cda5bcf7a04d` is also
pushed/origin-verified and scanned 0/0. The final records-only consistency
successor/final RC SHA and detached-review verdict remain unassigned by
self-reference.

No product or variant is represented as live without current durable Product
Control authority. This plan authorizes no product activation, pricing,
payment, refund, fulfillment, Tebra, account, or external-message mutation.

## Preconditions for any future rollback

An automatic rollback during Samuel's approved deployment and observation
window is already part of that exact-SHA GO and does not require a second
approval. A later standalone rollback outside that window requires:

1. Samuel or the designated release owner to approve the exact action.
2. Identification of the exact deployed SHA and deployment ID then active.
3. Confirmation of whether any migration or external configuration was applied.
4. A captured pre-action health and audit snapshot.
5. A named incident/release owner and communication channel.

Re-attest the anchors above immediately before any future action; do not rely
on this packet's snapshot.

## Future code-only rollback sequence

If a later authorized deployment of the frozen candidate causes a
release-blocking regression and no migration was applied:

1. Preserve logs and capture the exact failing deployment, SHA, route, time,
   request correlation ids (server-generated, never caller-supplied), and a
   synthetic reproduction. Application logs carry no customer identifiers,
   exception text, or request bodies after `40bae71`.
2. Confirm the prior approved artifact is the exact attested target
   (3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212 today); do not rebuild from a
   branch name.
3. Codex performs the platform rollback to that exact commit-pinned artifact
   on Render under Samuel's exact release authority (auto-deploy stays off).
4. Do not change flags or environment values unless Samuel separately
   authorizes that mutation.
5. Verify public site, `/hino`, the Research gateway and editorial pages, the
   auth wall and account protection, Early Access, `/api` health, 404 and error
   handling, and critical admin reads.
6. Re-run the secret and PII leakage scan against the rollback diff and inspect
   logs for customer-data exposure.
7. Record the final platform deployment id and health verdict in
   `docs/coordination/CURRENT_PRODUCTION_STATE.json`.

## Migration boundary

No migration is part of this candidate's deployable surface. Candidates under
`supabase/candidates/` (client-account/invitation lifecycle, assisted-order
audit store, activation/cart authority, refund command, checkout
compatibility) are outside `docs/coordination/MIGRATION_DAG.json`, unapplied to
production and shared staging, and not part of this deploy. A future migration
rollback requires the candidate-specific rollback SQL, a disposable rehearsal
with verified removal, and founder/data-owner approval — none of which this
program authorizes.

## Existing fail-closed posture

These values describe the safe candidate posture. They are not instructions or
authority to mutate the production environment during rollback.

| Surface | No-write rollback invariant | Result |
| --- | --- | --- |
| Tebra scheduling / portal | Preserve the existing environment unchanged | Truthful disabled/unconfigured state; no scheduler or portal link is actionable. |
| Public storefront / product activation | Preserve the existing environment unchanged | Storefront descriptors remain unregistered; catalog routes remain unmounted and noindex. Products and variants without durable current authority remain request-only, informational, held, or unavailable—not live. |
| Research indexing | Preserve the existing environment unchanged | Client section keeps the reviewed noindex posture; raw HTTP policy still answers exact status/robots per document. |
| Assisted-order audit authority | preserve the existing production-shaped mode | Config probe plus nine operational routes remain registered. `durable_store`, `log_line_nondurable` and explicit `unavailable` are the only truthful modes; enabled config cannot become generic 404. |
| Refund / activation / webhook execution | no flag exists to enable them in this candidate | Always disabled; capability denial precedes every effect. |

## Rollback validation matrix

After any future rollback, verify at minimum: `/`, `/hino/`, `/research`,
`/research/about`, `/research/quality`, `/research/account` (denied without a
session), `/research/early-access`,
`/api/research/early-access/assisted-orders/config` (HTTP 200), `/care`,
`/api/health`, an unknown path
(authoritative 404 with `X-Robots-Tag: noindex,nofollow,noarchive`), and an
admin read as an authorized operator. Compare against the evidence packet
captured for the candidate (`docs/review/xenios-research-full-site-20260829/`).

## Stop conditions

Stop and escalate to Samuel if any of the following is observed: a migration
was applied without a matching DAG entry; production returns a candidate SHA
that was never frozen and reviewed; any customer identifier, token, or PHI
appears in logs or evidence; or a rollback target cannot be attested by exact
SHA and deployment id.
