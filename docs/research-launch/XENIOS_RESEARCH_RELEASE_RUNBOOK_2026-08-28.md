# Xenios Research Release Runbook — 2026-08-28

> Companion to `XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-29.md` (the exact
> frozen SHA, gate table and verdict), `XENIOS_RESEARCH_ROLLBACK_PLAN_2026-08-28.md`,
> `XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md`,
> `XENIOS_RESEARCH_TEBRA_INTEGRATION_2026-08-28.md` and
> `XENIOS_RESEARCH_CAPABILITY_MATRIX_2026-08-28.md`.
>
> This runbook describes how Codex executes Samuel's later exact-SHA GO.
> **It does not authorize a deployment.** The disqualified `eb659d81…` was
> deployed and rolled back on 2026-08-29 as recorded in
> `DEPLOY_RECORD_2026-08-29_FULL_SITE_RC_EB659D81_ROLLBACK.md`. Production is
> now the verified rollback SHA `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`
> (Render `srv-d8s9vej7uimc7384dfcg`, current deployment
> `dep-da94g05g1s2s7396lkv0`, auto-deploy off) and stays there until Samuel
> gives a new exact-SHA GO.

## 0. Authority and stop rules

| Rule | Consequence |
| --- | --- |
| Only Samuel may authorize deployment; Codex executes only after Samuel supplies the exact approved command. | No deploy, environment write, migration or other production mutation occurs before that command. |
| Deploy the **exact final RC SHA named in the GO** only. | Never infer a branch head, never rebuild the tree, and never add a "small fix on top." A different SHA is unauthorized. |
| Runtime freeze, evidence freeze, and final RC are distinct. | Runtime gates bind `2d662a0d31bb1de9332fb5c591f01cab76b991b1`; the pushed evidence-only successor is `c01569169cad5e6619187221d84019ae8bfc7c69`; the final RC adds records only. The authorization packet supplies the final successor SHA after commit/push because a commit cannot contain its own SHA. |
| No migration ships with this candidate. | If a deploy plan includes a `supabase/candidates/*` file, stop; that is a separate, later, founder-authorized decision. |
| Any `SKIPPED` line in the PII scan, any secret-scan finding, any P0 or deployment-blocking P1 in the independent review → no deploy. | Re-freeze after remediation; rerun every gate on the new SHA. |

## 1. Pre-deploy checklist (human, read-only)

1. Open the RC document and Samuel's authorization message. Confirm runtime
   freeze `2d662a0d…`, evidence freeze `c0156916…`, and the exact
   **FINAL_RC_SHA** named in the GO.
2. Confirm `origin/claude/xenios-research-full-finish-takeover-20260828` equals
   that approved SHA:
   `git ls-remote origin refs/heads/claude/xenios-research-full-finish-takeover-20260828`.
3. Confirm the runtime freeze and evidence freeze are ancestors of the approved
   SHA. `git diff --name-only 2d662a0d… <FINAL_RC_SHA>` may list only the exact
   evidence controls `scripts/evidence/capture-synthetic-journeys.mjs`,
   `scripts/evidence/capture-synthetic-journeys.test.mjs`,
   `scripts/evidence/lib/cdp.mjs`,
   `scripts/evidence/network-boundary.test.mjs`,
   `scripts/evidence/routes-public.test.mjs`,
   `scripts/evidence/routes.public.json`, and
   `scripts/release/critical-endpoint-expectations.json`, plus the reviewed
   `docs/**` and `.xenios/**` records. Any customer-facing or server-runtime
   path means stop.
4. Confirm production is still `3daa3f4a…` (Render dashboard, deployment
   `dep-da94g05g1s2s7396lkv0`, auto-deploy **off**). If production moved, stop:
   the candidate's scans and protection gate were computed against `3daa3f4a…`.
5. Confirm the detached review of the exact final RC successor states
   **PASS, P0 = 0, deployment-blocking P1 = 0, critical P2 = 0**
   and independently verifies runtime freeze
    `2d662a0d31bb1de9332fb5c591f01cab76b991b1` and evidence freeze
    `c01569169cad5e6619187221d84019ae8bfc7c69` in its ancestry. Use the bounded packet at
   `docs/review/xenios-research-full-site-20260829/`.
6. Confirm the only present release authorization blocker was Samuel's exact
   GO. Future Tebra, product, indexing, storefront and migration choices remain
   disabled and are not bundled into this deployment.
7. Capture the pre-deploy critical-endpoint comparison against current live
   production; require the assisted-order config baseline to be HTTP 200.

## 2. Immutable environment boundary

This exact-SHA GO authorizes no environment set, unset, rotation, or value
change. Preserve the verified production environment byte-for-byte. If the
deployment cannot start and behave truthfully without an environment write,
stop; the authorization is not broad enough.

| Surface | Required no-write invariant | Candidate behaviour |
| --- | --- | --- |
| Research indexing and storefront | Preserve current values | Reviewed noindex/disabled states remain truthful; no publication is activated. |
| Tebra/Care | Preserve current values | Disabled/unconfigured; no scheduler, portal, telehealth, credential, mapping, sandbox or activation claim. |
| Assisted-order audit mode | Preserve the existing production-shaped configuration | All ten routes register. `durable_store`, `log_line_nondurable`, and explicit `unavailable` are the only truthful modes; enabled config cannot become generic 404. |
| Refund, activation, webhook, catalog mutation and inventory aggregate | No enabling write exists in this release | Capability denial or explicit unavailable state precedes every effect. |
| Existing Supabase, session, mail and Early Access variables | Preserve exactly | No new secret or value is required by the recut. |

Do not paste secret values, Tebra links, or portal URLs into Git or evidence.

## 3. Deploy sequence (Render, manual)

1. Render → service `srv-d8s9vej7uimc7384dfcg` → **Manual Deploy → Deploy a specific commit** → paste the exact `FINAL_RC_SHA` from Samuel's GO. Auto-deploy stays **off**.
2. Wait for the build (Render build command `npm run render-build`, start command `npm run start`, health check path `/api/health`; Node 20.19.0 / npm 10.8.2 pinned by `package.json` `engines`) and for the health check to pass on the new deployment id.
3. Record the new deployment id and the SHA it reports before any verification.

## 4. Post-deploy verification (all read-only, all synthetic)

Run in this order; stop at the first failure and go to §6.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `GET /` | 200, marketing shell, robots from the raw HTTP policy, no template-organization JSON-LD leakage. |
| 2 | `GET /hino/` and `GET /hino` | 200 static Hino index (no `div#root`, no Research header); bare `/hino` → 301 `/hino/`. |
| 3 | `GET /research`, `/research/about`, `/research/quality`, `/research/testing`, `/research/documents`, `/research/policies`, `/research/policies/accessibility` | 200; `X-Robots-Tag` and `<link rel=canonical>` exactly as in `http-evidence.json`; Accessibility Statement shows its **Draft status** panel. |
| 4 | `GET /research/account` without a session | Denied state; sign-in return path is path-only (no host, no token). |
| 5 | `GET /research/this-route-does-not-exist` | HTTP **404** with `X-Robots-Tag: noindex,nofollow,noarchive`. |
| 6 | `GET /care`, `/care/appointments` | Pending-configuration state; no scheduler iframe or popup script loads; Care CSP self-only. |
| 7 | `GET /sitemap.xml`, `/robots.txt` | Served; sitemap parity matches the evidence packet (public documents only). |
| 8 | `GET /api/health` | 200. |
| 9 | Immediate pre/post critical-endpoint comparison | `REGRESSION=0`, `HUMAN_REVIEW_REQUIRED=0`; every intentional change matches the exact reviewed allowlist. |
| 10 | `GET /api/research/early-access/assisted-orders/config` | HTTP 200 with enabled configuration; never generic 404. |
| 11 | Early Access page with a synthetic code | Renders; no product is add-to-cart-able unless product **and** variant are `available_now` with current/live authority (none are in this candidate). |
| 12 | Admin read as an authorized operator (synthetic) | Loads; refund/activation actions report capability disabled. |
| 13 | Application logs for the verification window | No customer identifiers, request bodies, exception text, tokens or PHI. |

Compare screens against `docs/review/xenios-research-full-site-20260829/` at
1440 and 390 at minimum.

## 5. Sign-off record

Append to `docs/coordination/CURRENT_PRODUCTION_STATE.json` (schemaVersion 3)
the new `production.gitSha`, `renderDeploymentId`, `verifiedAt`, and update the
`final-rc-packet` graph node with the deployed exact final RC SHA and deployed
state; then run
`verify-production-state`, `verify-migration-dag`, `verify-route-uniqueness --sha <sha>`
and `verify-release-manifest` from a clean clone. For the runtime-bound
manifest, unset `GITHUB_EVENT_PATH` and set
`XENIOS_EXPECTED_PRODUCTION_SHA=3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`,
`XENIOS_EXPECTED_HEAD_SHA=c01569169cad5e6619187221d84019ae8bfc7c69`.
Set `XENIOS_EXPECTED_OWNERSHIP_SHA256` to the exact ownership-policy digest
stored in the committed manifest; do not copy a predecessor digest. The
manifest remains evidence-freeze-bound after the records successor deploys.
The deployed final RC becomes the scan base for the next release.

## 6. Rollback

Follow `XENIOS_RESEARCH_ROLLBACK_PLAN_2026-08-28.md`: preserve incident
evidence, then immediately redeploy the exact commit-pinned rollback SHA
`3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`. Do not change flags or environment
values unless Samuel separately authorizes that mutation. No database rollback
exists because no migration ships.

## 7. What this candidate deliberately does NOT do

- No production migration; `supabase/candidates/*` remain unapplied.
- No real client-account creation, no invitations, no import of any real client row.
- No product activation, no pricing change, no payment/refund effect.
- No Tebra configuration or activation; the production state remains disabled and unconfigured.
- No undisclosed core-site change; all 33 reviewed out-of-zone paths and all
  protected-file hashes are classified in
  `XENIOS_RESEARCH_CORE_SITE_PROTECTION_DISPOSITION_2026-08-29.md`.
- No claim of medical efficacy, dosing, protocol, provider approval, pharmacy processing or shipment anywhere.
