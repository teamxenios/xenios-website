# Xenios Research Tebra Integration — 2026-08-28

Release classification: **PRODUCTION DISABLED / UNCONFIGURED — NOT A RELEASE
BLOCKER**.

The pushed frozen runtime is
`2d662a0d31bb1de9332fb5c591f01cab76b991b1` (tree
`c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5`). The pushed evidence freeze is
`c01569169cad5e6619187221d84019ae8bfc7c69` (tree
`c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019`); its only delta from the runtime
is `scripts/evidence/routes.public.json`,
`scripts/evidence/routes-public.test.mjs`, and
`scripts/release/critical-endpoint-expectations.json`,
`scripts/evidence/lib/cdp.mjs`,
`scripts/evidence/network-boundary.test.mjs`,
`scripts/evidence/capture-synthetic-journeys.mjs`, and
`scripts/evidence/capture-synthetic-journeys.test.mjs`. This release does not
configure, activate, or claim a live Tebra integration.

## Frozen release truth

| Capability | Exact release state |
| --- | --- |
| Scheduling | Disabled and unconfigured; no actionable Tebra destination is published. |
| Patient Portal | Unavailable; no portal URL or portal authority is configured. |
| Telehealth | Disabled and not advertised; no entitlement or practice attestation is asserted. |
| Credentials | No Tebra API key, OAuth client, access token, authenticated REST credential, or credential-bearing environment value is configured or authorized. Retired private REST/API-key variables must remain absent. |
| External identifiers | No Tebra practice ID, provider ID, location ID, visit-reason ID, appointment ID, patient ID, or portal-account identifier is configured, stored, inferred, or published. Optional `TEBRA_PRACTICE_NAME`, `TEBRA_LOCATION_LABEL`, and `TEBRA_PROVIDER_LABEL` are public labels only and do not provide identifier authority. |
| Practice mapping | No practice/provider/location/visit-reason/hours mapping is approved or activated. No label-to-ID mapping exists. |
| Consent and claims approval | No approved scheduling/portal consent copy, redirect disclosure, clinical claim, or founder/legal activation approval is recorded. The disabled fallback does not imply consent. |
| Sandbox or staging account | No Tebra sandbox account, connection, credential validation, mapped test practice, end-to-end scheduling result, or sandbox attestation exists. |
| Production activation | None. `TEBRA_SCHEDULING_ENABLED` has no approved true value; no non-disabled `TEBRA_SCHEDULING_MODE`, URL, embed script, allowed origin, portal URL, production environment record, telehealth entitlement, environment change, or Tebra account-side action is authorized. |
| Clinical effects | No appointment, intake, provider decision, prescription, pharmacy action, or clinical record is created or inferred. |

No Tebra value is required to deploy this RC. Missing configuration fails
closed to the truthful disabled/unconfigured presentation. The existence of
dormant adapter modes in source does not make any external mode configured or
approved.

## Runtime safety contract

- Tebra is treated only as a possible future external scheduling and portal
  authority; the candidate does not call a Tebra API or mint an appointment.
- Scheduling can become actionable only through separately validated
  production configuration and release-bound durable authority. Neither exists
  in this release.
- The Patient Portal has a separate authority boundary. General Care enablement
  cannot manufacture portal readiness.
- Care documents keep the self-only CSP baseline. No Tebra frame, popup script,
  third-party pixel, marketing attribution, or analytics load is authorized on
  Care paths.
- Clinical writes pass the canonical capability gate before repositories or
  RPCs. Refusal logging contains no actor, patient, request body, or clinical
  content.
- The account Care view reports only authorized current state and never infers
  provider approval, prescription, pharmacy processing, or earlier stages.

## R11 evidence boundary

The sealed exact-runtime R11 technical bundle is at
`C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux\runner-completion.json`
and passed 21/21 gates. It includes assisted production 6 files/115 tests;
endpoint/static/SEO/Hino 4/79; targeted domains 196/3,116; canonical E2E 4/53;
the full sequential suite at 807 files (803 passed/4 skipped) and 12,092 tests
(12,049 passed/43 skipped), zero failures in 469.08s; and evidence tooling
13 files/208 tests (196 passed/12 skipped), zero failures.

The historical bounded db9 preflight smoke passed 9/9 HTTP records and 54 browser
captures with zero failures. It is not final evidence. Exact-193 retry1 is
`EXCLUDED_EXTERNAL_INTERRUPTION`: Windows Modern Standby Event 506 at
`2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` caused CDP loss after 224/1,100 observations
(180 PASS + 44 PASS_WITH_NOTES + 0 FAIL); targeted partners were 11/11 PASS,
and no product or harness defect was found.

Retry2 completed primary 1,100/1,100 at 1,023 PASS + 77 PASS_WITH_NOTES +
0 FAIL and its focused gates passed, but is
`EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE` because synthetic stopped 10/20 on a
service-worker CDP restart. Three valid diagnostics yielded one PASS and two
exact race reproductions, with no product or network failure.

The e641 three-run smoke is excluded at 2 PASS + 1 FAIL. Exact c015 focused
validation passed 53/53, and its three canonical prerequisite synthetic runs
each passed 20 captures as 18 PASS + 2 declared notes + 0 FAIL with boundary 0
and PII CLEAN. Retry3 stopped before evidence on a wrapper-only suite-count
assertion after exact clone/build and actual 3-suite/23-test focused PASS.
Retry3b passed network-boundary 23 and routes 17 but stopped before preview
because its wrapper assumed a fixed suite total of 3 while Vitest reported
describe-block totals 3 then 2. Both guards reset; no candidate defect was
found; neither attempt may resume or be reused. Exact-c015 retry3c full evidence
is sealed: HTTP 100/100; browser 1,100 = 1,023 PASS + 77 expected notes + 0
fail first attempt; focused early/assisted/negative/unknown 11/11 each and
account 99/99, all clean; synthetic 20 = 18 PASS + 2 expected-denial notes + 0
fail; evidence tests 13 files/213 tests/46 describe suites; release scan 0/0
non-skipped; PII CLEAN 0 findings across 2,332 text / 1,120 PNG manual-review
inventory / 0 unscannable. Evidence manifest SHA-256 is
`1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257`.
The wrapper-only 46-vs-13 stop and excluded fixture scan remain disclosed;
reserved-fixture endpoint recapture passed 16/11/0/0 with config 200. The
bounded packet is generated and validated at 192 files = 191 payload +
inventory self; packet inventory `6dab7745…`, payload inventory `f6ef58ea…`;
canonical release-manifest verification passed under Node 20.19.0/npm 10.8.2
at SHA-256 `16f08fd2…`, binding the packet and assisted-order environment
inventory. Records/evidence successor
`8bd8df8f556d8e84bc9c8daef1871d6a59b58590` is pushed, origin-verified and
non-skipped scanned at 0 secret/0 PII. Continuity successor
`0f3b3a334312273775ecf2efa4e3cda5bcf7a04d` is also pushed,
origin-verified and scanned at 0 secret/0 PII. Current phase is
**CODEX_DETACHED_REVIEW**. The final records-only consistency successor/final
RC SHA and detached-review verdict remain unassigned by self-reference.

No deploy, migration, environment change, external account configuration,
credential entry, portal enablement, telehealth enablement, mapping, sandbox
exercise, or Tebra activation occurred while producing that evidence.

## Nonblocking post-release backlog

A durable bounded throttle for the public Tebra configuration GET remains a
defense-in-depth backlog item. The candidate state is disabled/unconfigured and
the endpoint exposes neither secrets nor clinical state, so this item does not
undermine the current release claim or require a recut.

## Future enablement is a separate release

Any future scheduling, portal, telehealth, iframe, popup, or direct-link
enablement requires a new scoped change with exact authorized practice values,
security review, staging evidence, and explicit activation approval. Those
future inputs are not missing prerequisites for this safely disabled release.
`docs/care/TEBRA_ACTIVATION_PACKET_2026-08-28.md` is advisory for that future
workflow and grants no authority today.

Deploying the final RC must not alter Tebra configuration. Samuel's exact-SHA
production GO is not yet requestable while the final records-only consistency
successor, exact-final-SHA clean/origin checks, final RC assignment and
detached review remain open. Only after those engineering gates pass does
Samuel's new GO naming the exact final RC SHA become the sole human-only
release boundary.
