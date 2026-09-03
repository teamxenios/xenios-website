# Handoff — CARE-ADMIN-RELIABILITY-20260903 deployed (P0, incident CARE-2A99C6F7)

Session: `claude-care-admin-reliability-20260903` (Claude Fable 5.1)
Branch: `claude/care-admin-reliability-20260903`
Exact head: `47210a24870de0dc70cd27cda9d66d2d973c32ff` (records successor of the live SHA; no served-runtime change)
Live production: `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` as `dep-dad08h740ujc73aprfcg`, live since `2026-09-03T23:36:32Z` (records successor of tested code `ace27886dd3b76a8e5dcc982111bb7062e9e451b`; runtime trees identical)
Previous live / pre-deploy rollback target: `50c2d35cf543724fad17a61d9d5c36cf81fe5f21` (`dep-daatp715efls738v00dg`), now superseded history

## What happened

- The founder issued an exact-SHA GO for `db5a2d44` on 2026-09-03. Pre-flight (read-only): origin head verified, runtime identity to the tested SHA verified by tree hashes, Render `autoDeploy no / trigger off`, no deploy in progress, build inputs byte-identical to live, live 30-endpoint baseline captured, three-skeptic adversarial gate (identity and Render mechanics confirmed; smoke sufficiency refuted and addressed), local production-shaped `50c2d35c`-vs-`db5a2d44` diff 30/0/0/0.
- Commit-pinned Render API deploy: `POST /deploys {commitId}` 201, commit verified exact before polling, `build_in_progress -> update_in_progress -> live` in about a minute.
- Read-only smoke: health 200 x3; critical-endpoint diff vs the pre-deploy baseline SAME 30 / 0 / 0 / 0 PASS, repeated after an eight-minute clean observation; Care admin doors 401/401/401 unauthenticated (PATCH probe on a nonexistent id), control 404, page 200 private shell (was 404); public Care write door unchanged; boot log complete including the Supabase service-key check. No rollback.
- Production truth reconciled in the same session: state, graph (+mmd), ownership and DAG baseline fields, control-plane test pins, production-state document, `.xenios` state; pre-flip records archived under `docs/coordination/history/*_2026-09-03.json`. Validators: control-plane suite 51/1, verify-production-state, verify-migration-dag, verify-route-uniqueness (414/405), core-site gate PASS, tsc 0.
- Not changed: migrations, environment variables, Render settings, customer messages, any Care status.

## Pending / blocked

- Authenticated proof that `CARE-2A99C6F7` appears exactly once in `/admin/research/care-requests` (and that `GET /api/admin/care/access-requests` returns it once) requires the founder admin session; this session had none, did not sign in, and Claude in Chrome was unreachable. Read-only steps are in the deployment report. Do not change any status during the check; Seth is not asked to resubmit.
- PR #306 is open against `release/early-access-code-session-checkout` (head `8cca3373`, an ancestor of live). Merging it re-aligns the configured Render branch with the live lineage; auto-deploy is off so the stale head cannot deploy itself.

## Follow-ups (unclaimed)

- Hide Care rows from the generic `/admin` LOI list (legacy status vocabulary leak).
- Add `/api/admin/care/*` and `/admin/research/care-requests` to the critical-endpoint default list and re-derive `critical-endpoint-expectations.json` against `db5a2d44`.
- Records for the next release must start from `db5a2d44` as the scan base and rollback target.

Report: `docs/research-launch/CARE_ADMIN_RELIABILITY_DEPLOYMENT_REPORT_2026-09-03.md`. Evidence outside Git: `CONTROL/EVIDENCE/deploy-db5a2d44-20260903/`.
