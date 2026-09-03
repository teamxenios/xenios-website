# Care admin reliability deployment report — 2026-09-03

Operator: `claude-care-admin-reliability-20260903` (Claude Fable 5.1) on branch
`claude/care-admin-reliability-20260903`. Authorization: the founder's message
"GO: Deploy exact SHA db5a2d447114c1e8a14185a9865ded50ee3f1ac6 to Render service
srv-d8s9vej7uimc7384dfcg. Use only a commit-pinned deployment. Make no migrations,
environment changes, customer communications, or Care-status changes. After
deployment, run the full read-only smoke and confirm CARE-2A99C6F7 appears exactly
once in the Care admin queue. Roll back to 50c2d35cf543724fad17a61d9d5c36cf81fe5f21
immediately if any regression is detected." (2026-09-03).

Result: **deployed and live; no regression detected; no rollback.** One item of the
requested smoke is not done by this session: the authenticated confirmation that
`CARE-2A99C6F7` appears exactly once requires the founder's admin session (see §6).

## 1. Identity

| Item | Value |
| --- | --- |
| Deployed SHA | `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` (records-only successor of the tested code SHA) |
| Tested code SHA | `ace27886dd3b76a8e5dcc982111bb7062e9e451b` — tree hashes for `client/`, `server/`, `shared/`, `script/`, `scripts/`, `supabase/` identical to the deployed SHA |
| Base | `8cca3373047a2161f5360541a9b2fc5c71f8063f` (release branch head; contains the previous live `50c2d35c…`) |
| Previous live (pre-deploy rollback target) | `50c2d35cf543724fad17a61d9d5c36cf81fe5f21`, `dep-daatp715efls738v00dg` |
| Render deployment | `dep-dad08h740ujc73aprfcg`, trigger `api` (commit-pinned), created `2026-09-03T23:35:32Z`, live `2026-09-03T23:36:32Z` |
| Service | `srv-d8s9vej7uimc7384dfcg` (`tea-d8nhh6a8qa3s73f4ocj0`), branch `release/early-access-code-session-checkout`, auto-deploy off, unchanged |
| Runtime files production took on | 14 files under `client/src/research`, `server/care`, `shared/care` (+1,682 / −14); no `script/`, `scripts/`, `supabase/`, `package*.json` change |
| Migration / environment / settings | none, none, none |
| PR | #306 (`claude/care-admin-reliability-20260903` → `release/early-access-code-session-checkout`), open; the release branch was not moved |

## 2. Pre-deploy gate (read-only)

| Gate | Result |
| --- | --- |
| Origin head | `git ls-remote` = `db5a2d44…`; local worktree clean at the same SHA |
| Runtime identity | `git diff --name-status ace27886..db5a2d44` = `.claude/launch.json` (restored), `.xenios/*`, `docs/*` only; no deletions |
| Render state | `autoDeploy: no`, `autoDeployTrigger: off`, not suspended; top deploy `dep-daatp715efls738v00dg` live on `50c2d35c…`; no deploy in progress |
| Build inputs | `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `script/build.mjs`, `.npmrc` byte-identical between `50c2d35c…` and `db5a2d44…`; `engines` node 20.19.0 / npm 10.8.2 = Render `NODE_VERSION` |
| Off-branch commitId precedent | five prior API deploys (`eb659d81`, `1fd84ad2`, `abe03ca3`, `72b6f138`, `50c2d35c`) built commits not contained in the then-release head `3daa3f4a…`; all succeeded |
| Live baseline capture | 30 critical endpoints captured on `50c2d35c…` at `2026-09-03T23:23:10Z` (`pre-baseline-live-50c2d35c.json`) |
| Adversarial gate | three independent read-only skeptics: identity CONFIRMED, Render mechanics CONFIRMED, smoke sufficiency REFUTED (default endpoint list is blind to the shipped feature and the authenticated proof needs a session; no candidate-vs-live diff had been run) — addressed by the Care-door probes below, the local production-shaped diff, and §6 |
| Local production-shaped diff | `50c2d35c…` and `db5a2d44…` each built and booted in the pinned Node 20.19.0 LF clone with the production env shape (placeholder secrets): SAME 30 / INTENTIONAL_CHANGE 0 / REGRESSION 0 / HUMAN_REVIEW_REQUIRED 0 |

## 3. Deployment

```
deploy-db5a2d44 START 2026-09-03T23:35:30Z commitId db5a2d447114c1e8a14185a9865ded50ee3f1ac6
http=201
deploy-db5a2d44 TRIGGERED 2026-09-03T23:35:32Z deploy=dep-dad08h740ujc73aprfcg commit=db5a2d447114c1e8a14185a9865ded50ee3f1ac6
  poll 1 2026-09-03T23:35:48Z status=build_in_progress
  poll 2 2026-09-03T23:36:05Z status=build_in_progress
  poll 3 2026-09-03T23:36:22Z status=update_in_progress
  poll 4 2026-09-03T23:36:39Z status=live
deploy-db5a2d44 TERMINAL 2026-09-03T23:36:40Z status=live finishedAt=2026-09-03T23:36:32.75103Z
```

The trigger response's `commit.id` was compared with the requested SHA before
polling began; a mismatch would have aborted.

Boot log (`dep-dad08h740ujc73aprfcg`): build successful; `npm run start`;
early-access session identity enabled; affiliates partner portal mounted; research
config `password=set sessionSecret=set publicMode=false nodeEnv=production`; outbox
worker started; email `provider=resend-env`; **assisted order bridge mounted
(audit mode: log_line_nondurable)**; serving on port 10000; **supabase service key
check ok**; "Your service is live".

## 4. Post-deploy read-only smoke (`2026-09-03T23:37Z`)

| Check | Result |
| --- | --- |
| Live deploy | `dep-dad08h740ujc73aprfcg` `live` `db5a2d44…` |
| `/api/health` ×3 | 200 / 200 / 200 (`supabaseConfigured true`, `adminConfigured true`, `turnstileConfigured false`, `commerceEnabled false`); Render origin health 200 |
| Critical-endpoint diff vs pre-deploy baseline | **SAME 30 / INTENTIONAL_CHANGE 0 / REGRESSION 0 / HUMAN_REVIEW_REQUIRED 0 — PASS (exit 0)** |
| `GET /api/admin/care/access-requests` (no token) | 401 `{"success":false,"message":"Unauthorized"}` (was 404 on `50c2d35c…`) |
| `GET /api/admin/care/access-requests/CARE-2A99C6F7` (no token) | 401 |
| `PATCH /api/admin/care/access-requests/00000000-0000-4000-8000-000000000000/status` (no token, no body, nonexistent id) | 401 — the guard runs before any handler; nothing could be mutated |
| `GET /api/admin/care/definitely-missing-xr-smoke` | 404 `{"message":"Not Found"}` (control) |
| `GET /admin/research/care-requests` | 200 private shell (`<div id="root">`); was 404 on `50c2d35c…` |
| `GET /care/schedule` | 200 |
| `GET /api/care/access-request/status` | 200 `acceptingRequests: true` (unchanged public write door) |
| Request log | every probe above appears in the Render log with the expected status and ≤ 76 ms |

## 5. Observation window and second capture

| Tick | health | care list (no token) | care page | /care/schedule | /research |
| --- | --- | --- | --- | --- | --- |
| 23:39:35Z … 23:46:46Z (8 ticks, one per minute) | 200 | 401 | 200 | 200 | 200 |

Second full capture at `2026-09-03T23:46:5xZ` against the pre-deploy baseline: **SAME 30 / INTENTIONAL_CHANGE 0 / REGRESSION 0 / HUMAN_REVIEW_REQUIRED 0 — PASS**. Live deploy unchanged: `dep-dad08h740ujc73aprfcg` on `db5a2d44…`. No 5xx, no timeout, no status change on any tick.

## 6. Not done by this session: authenticated queue proof

The founder's instruction asks to "confirm CARE-2A99C6F7 appears exactly once in
the Care admin queue". That read requires an admin session. This session had no
admin session, no authorized database path, and does not sign in or enter
credentials; the Claude in Chrome connection that could have used the founder's
existing session was not reachable. The proof is therefore **pending**, recorded
as `CARE_ADMIN_AUTHENTICATED_PROOF_PENDING` in `CURRENT_PRODUCTION_STATE.json`.

Read-only steps for the founder (no status change; Seth is not asked to resubmit):

1. Signed in at `https://xeniostechnology.com/admin/research`, open
   `https://xeniostechnology.com/admin/research/care-requests`.
2. Expect exactly one card with reference `CARE-2A99C6F7` (Seth Grant, Colorado,
   "I want to start a new Care request", phone / morning, status `New`, email
   status `sent`). Expect no generic LOI row and no raw operational JSON.
3. Optional API confirmation from the browser devtools network panel: the page's
   `GET /api/admin/care/access-requests` returns 200 with `ok: true`,
   `summary.total ≥ 1` and one `reference: "CARE-2A99C6F7"`.
4. Do not change the status select during the check.

If the card is absent or the endpoint returns 503 `care_access_admin_unavailable`,
that is not a regression of previous production behaviour (the record was invisible
before too); do not roll back — report it and investigate the durable row.

## 7. Rollback criteria applied

Rollback to `50c2d35c…` (commit-pinned redeploy) would have been triggered by:
critical-endpoint diff REGRESSION after one confirming re-capture; any live
endpoint unreachable or 5xx; `/api/health` non-200; any Care admin door returning
anything other than 401 unauthenticated; the control route not 404; the page route
not a 200 private shell; a public Care status flip; or header/document drift on a
rule-bearing route. None occurred.

## 8. Records reconciled in the same session

`CURRENT_PRODUCTION_STATE.json`, `ACTIVE_RELEASE_GRAPH.json` (+ `.mmd`),
`FILE_OWNERSHIP.json`, `MIGRATION_DAG.json` (baseline fields only, byte format
preserved), `server/release-control-plane.test.ts` constants,
`CURRENT_PRODUCTION_STATE.md`, `.xenios/RELEASE_STATE.json`,
`.xenios/PROJECT_STATE.json`, `.xenios/SESSION_REGISTRY.json`, and the pre-flip
snapshots archived under `docs/coordination/history/*_2026-09-03.json`. The
release branch stays at `8cca3373…` until PR #306 is merged; auto-deploy is off,
so the stale branch head cannot deploy itself.

## 9. Follow-ups (not started)

- Founder read-only queue proof (§6).
- Hide Care rows from the generic `/admin` LOI list (legacy status vocabulary leak).
- Add `/api/admin/care/*` and `/admin/research/care-requests` to the critical-endpoint default list and re-derive the expectations file against `db5a2d44…`.
- Merge PR #306 so the configured Render branch again equals the live lineage.

Evidence (outside Git): `CONTROL/EVIDENCE/deploy-db5a2d44-20260903/` — deploy
record, trigger response, final deploy JSON, pre/post captures, diffs, probes, boot
and request logs, gate verdicts, local candidate diff log, observation log.
