# Xenios Research Release Runbook — 2026-08-28

> Companion to `XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-28.md` (the exact
> frozen SHA, gate table and verdict), `XENIOS_RESEARCH_ROLLBACK_PLAN_2026-08-28.md`,
> `XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md`,
> `XENIOS_RESEARCH_TEBRA_INTEGRATION_2026-08-28.md` and
> `XENIOS_RESEARCH_CAPABILITY_MATRIX_2026-08-28.md`.
>
> This runbook describes how a human release owner would deploy the frozen
> candidate. **It does not authorize a deployment.** Nothing in this program
> deployed, merged, migrated, activated, invited, priced, paid, refunded, or
> messaged anything. Production is the attested `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`
> (Render `srv-d8s9vej7uimc7384dfcg`, deployment `dep-da6vorqfngtc73brb0gg`,
> auto-deploy off) and stays there until Samuel decides otherwise.

## 0. Authority and stop rules

| Rule | Consequence |
| --- | --- |
| Only Samuel (or a release owner Samuel names in writing) may deploy. | No agent, script or helper triggers a deploy. `mcp__render__trigger_deploy` and `update_environment_variables` are never used by this program. |
| Deploy the **exact frozen SHA** only. | Never a branch name, never a rebuilt tree, never a "small fix on top". A new SHA is a new candidate with new gates. |
| The docs/evidence commit on top of the code freeze is a separate SHA. | The RC document names both: the code-frozen SHA that every gate ran on and the final branch HEAD whose diff against it is docs/evidence only (`git diff --stat <code> <head>` must show no `client/`, `server/`, `shared/`, `config/`, `supabase/`, `package*.json` change). |
| No migration ships with this candidate. | If a deploy plan includes a `supabase/candidates/*` file, stop; that is a separate, later, founder-authorized decision. |
| Any `SKIPPED` line in the PII scan, any secret-scan finding, any P0 or deployment-blocking P1 in the independent review → no deploy. | Re-freeze after remediation; rerun every gate on the new SHA. |

## 1. Pre-deploy checklist (human, read-only)

1. Open the RC document and confirm the **code-frozen SHA** and the **final branch HEAD**.
2. Confirm `origin/claude/xenios-research-full-finish-takeover-20260828` equals the final HEAD:
   `git ls-remote origin refs/heads/claude/xenios-research-full-finish-takeover-20260828`.
3. Confirm the code-frozen SHA is an ancestor of the final HEAD and that
   `git diff --stat <code-sha> <head>` lists only `docs/**`, `.xenios/**`,
   `CONTROL`-mirrored evidence and coordination JSON.
4. Confirm production is still `3daa3f4a…` (Render dashboard, deployment
   `dep-da6vorqfngtc73brb0gg`, auto-deploy **off**). If production moved, stop:
   the candidate's scans and protection gate were computed against `3daa3f4a…`.
5. Confirm the independent review report for the frozen SHA states
   **PASS, P0 = 0, deployment-blocking P1 = 0, critical P2 = 0**
   (`CONTROL/REPORTS/CLAUDE-FINAL-INDEPENDENT-REVIEW-<sha8>.md`, mirrored in
   `docs/review/xenios-research-full-site-20260828/`).
6. Read `XENIOS_RESEARCH_HUMAN_ONLY_BLOCKERS_2026-08-28.md` and decide each
   founder decision explicitly. Undecided items ship in their truthful
   disabled/pending state — that is acceptable; a guessed value is not.

## 2. Environment configuration for the first deploy

Every flag below defaults to the **safe/dark** value when unset. Set nothing
you have not decided.

| Variable | Recommended first-deploy value | Effect when unset |
| --- | --- | --- |
| `RESEARCH_INDEXABLE` | unset | Every public Research document is answered `noindex,nofollow,noarchive` at the HTTP layer (`X-Robots-Tag` and the policy meta tag) and the client section forces `noindex` — production-gate parity (`dc70fb17` + `679564fc`); the marketing site (`/`, careers, ICP pages) is never gated by this flag; exact status, canonical and og:url are still answered per document. Set `true` only after reviewing the raw-HTTP evidence; the static sitemap lists no Research page until then. |
| `RESEARCH_PUBLIC_STOREFRONT_ENABLED` | unset | Public storefront descriptors are not registered; catalog routes stay unmounted and noindex. Requires publication authority and approved copy. |
| `TEBRA_SCHEDULING_ENABLED` / `TEBRA_SCHEDULING_MODE` | `false` / `disabled` | Care shows the truthful configuration-pending state; no scheduler, no embed, no portal link. See the Tebra document for the exact per-mode variables (`TEBRA_SCHEDULING_URL`, `TEBRA_SCHEDULING_EMBED_SCRIPT_URL`, `TEBRA_ALLOWED_ORIGINS`, `TEBRA_PATIENT_PORTAL_URL`, `TEBRA_TELEHEALTH_ENABLED`, `TEBRA_ENVIRONMENT`). |
| Assisted-order audit store configuration | unset | Bridge stays unmounted; no audit table is required. |
| Refund execution, product/variant activation, webhook application, member-catalog read, inventory aggregate | **no enabling flag exists** | Always disabled in this candidate; capability denial precedes every effect (the surface reports unavailable/disabled; no provider, ledger, or catalog effect can occur). |
| Existing production variables (Supabase, session secrets, mail, Early Access) | unchanged | The candidate reads the same names as `3daa3f4a…`; no new secret is required. |

Do not paste secret values, Tebra links, or portal URLs into any document in Git.

## 3. Deploy sequence (Render, manual)

1. Render → service `srv-d8s9vej7uimc7384dfcg` → **Manual Deploy → Deploy a specific commit** → paste the final branch HEAD SHA from the RC document. Auto-deploy stays **off**.
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
| 9 | Early Access page with a synthetic code | Renders; no product is add-to-cart-able unless product **and** variant are `available_now` with current/live authority (none are in this candidate). |
| 10 | Admin read as an authorized operator (synthetic) | Loads; refund/activation actions report capability disabled. |
| 11 | Application logs for the verification window | No customer identifiers, request bodies, exception text, tokens or PHI. |

Compare screens against `docs/review/xenios-research-full-site-20260828/` at
1440 and 390 at minimum.

## 5. Sign-off record

Append to `docs/coordination/CURRENT_PRODUCTION_STATE.json` (schemaVersion 3)
the new `production.gitSha`, `renderDeploymentId`, `verifiedAt`, and move the
`omega-full-finish-candidate` graph node to its deployed state; then run
`verify-production-state`, `verify-migration-dag`, `verify-route-uniqueness --sha <sha>`
and `verify-release-manifest` from a clean clone. The candidate becomes the
new scan base for the next release.

## 6. Rollback

Follow `XENIOS_RESEARCH_ROLLBACK_PLAN_2026-08-28.md`: flags off first (every
new capability returns to its truthful state on the same SHA), then redeploy
the exact attested predecessor `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` if a
runtime rollback is still required. No database rollback exists because no
migration ships.

## 7. What this candidate deliberately does NOT do

- No production migration; `supabase/candidates/*` remain unapplied.
- No real client-account creation, no invitations, no import of any real client row.
- No product activation, no pricing change, no payment/refund effect.
- No Tebra configuration beyond the fail-closed pending state.
- No global marketing-shell change (hard-tripwire files unchanged; touch-target findings on `/`, `/care`, `/hino` are founder-review items).
- No claim of medical efficacy, dosing, protocol, provider approval, pharmacy processing or shipment anywhere.
