# e33 cloud regression run, receipt reconciliation, and the planned KAN-31 matrix

**Cloud run verdict: PASS, bounded.** GitHub Actions run `38764174056`, attempt 2, on overlay `303042fa` ran the
release-control compiler and the exact 66-case regression on candidate `e33c12a9`. It was accepted as 66 tests, 65
passed, and only the named PostgreSQL opt-in test skipped.

- **What this is.** Linux cloud evidence for the release controls only.
- **What this is not.** Not managed-database, browser, customer-path, deployment or live evidence. NOT LIVE.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Method.** Committed Git objects, plus read-only GitHub Actions metadata and logs. Nothing executed, mutated or
  re-run; no agents.
- **Packet.** `Xenios_Codex_Claude_Jira_Handoff_2026-10-15.zip` (15,220 B, `e6ac351c…`), with the reviewer brief
  `02_CLAUDE_REVIEWER_PROMPT.md` (`f778c870…`) and the protocol `03_TEAM_JIRA_PROTOCOL.md` (`512224d5…`), delivered in
  chat.
- **Timing.** Reviewed at 2026-10-15T19:26–19:30Z.

Archive: `hl12/190_e33_cloud_regression_run_and_kan31_planned_matrix.json`.

## 1. Access status

- **Jira and Confluence: not available here.** This Claude Code session has no Atlassian connector, so I cannot read
  KAN-2, KAN-31 or XENENG, or post to them.
- **Not attempted.** Connecting one would change persistent configuration and need interactive OAuth, so I did not
  attempt it.
- **What that means.** Nothing in this doc claims Jira activity. The comment text in section 6 is ready for an
  authorized owner to post.
- **GitHub: read-only.** Readable through the existing `gh` login, and used for metadata and logs only.

## 2. Receipts reconciled (data from Root and Core records; each category kept separate)

| Item | Evidence | Status |
|---|---|---|
| e33 release-control compiler, local Windows | Core `c9cf257`, ticket `7803a266` consumed, exit 0, 0 diagnostics, independent owned postcheck PASS | **PASS** (compiler only) |
| e33 current-66 regression, local Windows | Core `d9d92f6`: Samuel paused all work; no READY, ticket or G0 | **NOT RUN** |
| e33 current-66 regression, GitHub cloud | Run `38764174056` (section 3) | **PASS, bounded** |
| Staging DB I3 | Core `bf7f4a9`: one installation, one structural postcheck (9 empty tables, 30 functions, privileges, 240-min sessions), on staging `tetynodzrtmdbuzgboro`, not production. Earlier I1 refusal, D1 diagnosis and I2 syntax failure preserved | **PASS within its scope**. The receipt itself excludes real Auth/PostgREST, customer submission, retry and persistence |
| Browser | Core `cd64f5e`: readiness and coverage gaps documented, no journey executed | **NOT RUN** |
| Production | Root DOC332/339: live service on `7bba4b6e`, manual deploy, actor and reason unknown | **Not the candidate** |
| Security (KAN-85) | No closure evidence seen | **OPEN** |

## 3. Candidate-bound review: the cloud regression run

- **Run.** `38764174056`, push event on `codex/e33-regression-overlay-20261015`.
- **Head.** `303042fa`, whose parent is exactly `e33c12a9`. Its diff adds only the four overlay files, byte-identical
  to the package reviewed in Doc 189: workflow `726cec8a…`, validator `eb6d941f…`, contract `acd3b338…`, tests
  `6dc06213…`.
- **Attempt 1: failure, but the job never started.** GitHub's annotation reads "The job was not started because your
  account is locked due to a billing issue". Zero steps ran, so this is not a hidden test failure, and attempt 2 is
  not a retry of a failed test.
- **Attempt 2: success, 16:06:02Z–16:07:40Z, job `116529564534`.** All 12 steps succeeded. The log shows:
  - checkout of `e33c12a9` ("HEAD is now at e33c12a9");
  - the HEAD, tree, clean-status and four blob-pin assertions passing;
  - Node v20.19.0 and npm 10.8.2;
  - checker controls: 16 run, 16 passed, 0 failed;
  - `npm ci` and the literal `npm run check:release-control-plane` succeeding;
  - the three-file Vitest step exiting 0 with `CI` and `XENIOS_RUN_PG16_VERIFIER` empty;
  - the validator printing `ACCEPTED_EXACT_66_REPORT` (candidate `e33c12a9`, 66 total, 65 passed, 1 skipped,
    PostgreSQL `NOT_RUN`).
- **Artifact.** `xenios-e33-exact-reviewed-66`, ID `11989721095`, 3,945 B, digest `sha256:4e3581f6…`.
- **Log copy.** I saved the full attempt-2 log as a review copy (1,005 lines, `b0fb04e1…`).
- **What it answers.** The `e33` scanner fix makes the release-control regression that failed on `84178ce1` (run 309:
  61 passed, 1 failed) pass, with the exact reviewed identities, in this environment. Run 309 itself stays FAILED.

### Limits of the PASS

- **Environment.** Linux `ubuntu-latest` with a fresh `npm ci`, not the reviewed Windows runner with its 91 raw pins,
  owned closure and G0. Whether this cloud evidence stands in for the local regression admission is the release
  owner's decision.
- **Artifact.** I did not download or re-parse the artifact JSON. Acceptance rests on the validator's logged output,
  which I reviewed in Doc 189, and the step gating.
- **PostgreSQL.** The PG16 verifier test was skipped by design. This is not managed-database coverage.
- **Command differences.** As noted in Doc 189, none of them changes outcomes.

## 4. What is still absent before release

1. **Real persistence and reference (KAN-26).** A managed staging database with real Auth and PostgREST, a genuine
   pending request and reference, and an idempotent retry. I3 installed prerequisites only.
2. **Staff readback (KAN-29).** HELD until the security exposure is closed (KAN-85) and the staff-read flag is enabled
   by its owner.
3. **Browser journey (KAN-31).** Not run. The earlier host blocker was G0 memory capacity.
4. **Release evidence (KAN-33).** Full suite, static checks, diff and final manifest. The phase A 40-path return is
   pending.
5. **Deployment and live verification (KAN-35).** The authorized release owner must reconcile the release branch, then
   verify the served SHA, deploy ID, synthetic pending request, retry, staff readback and access denial.
6. **Owned cleanup.** `source7` removal is still owed.

## 5. KAN-31 test matrix: PLANNED, none executed

- **Environment.** A qualified staging environment with real Auth and PostgREST and the I3 prerequisites, never
  production. Synthetic identities only.
- **Source.** Expected results come from the `e33c12a9` source: `request-intent/express.ts`, `production.ts`,
  `service.ts` and `staff-read-authority.ts`. I could not read Jira's KAN-31 acceptance criteria, so they must be
  reconciled before use.

| # | Persona | Step | Expected result | Status |
|---|---|---|---|---|
| 1 | Any visitor | Feature flag off; load request page and `GET …/config` | 503 `{enabled:false}`; no submit control | PLANNED |
| 2 | Eligible member (synthetic) | Pick a clinical and a nonclinical item from `GET …/catalog` | Both in one draft with exact variant and quantity | PLANNED |
| 3 | Eligible member | `POST …/` with current acknowledgments | 200 with a genuine reference; exactly one pending-review row (KAN-26); no payment, approval, prescription or order | PLANNED |
| 4 | Eligible member | Submit without current acknowledgments | 400 `current_acknowledgments_required`; nothing saved | PLANNED |
| 5 | Eligible member | Drop the response, resend the same attempt or `POST …/recover` | Same reference; still exactly one row | PLANNED |
| 6 | Eligible member | Same attempt key, changed items | 409 `attempt_conflict`; original unchanged | PLANNED |
| 7 | Eligible member | Submit a stale selection | 400 `selection_requires_refresh` | PLANNED |
| 8 | Signed-out visitor, or a bearer that is not a member | Submit | 401 `authentication_required`; no row | PLANNED |
| 9 | Any | Cross-origin submit | 403 `request_origin_not_authorized` | PLANNED |
| 10 | Any | Exceed the rate limit; limiter unavailable | 429 `rate_limited`; 503 when unavailable (fails closed) | PLANNED |
| 11 | Second member | Read member A's request, or call the staff routes | 401 or 403; staff routes give 503 `private_review_unavailable` while the flag is off | PLANNED |
| 12 | Authorized staff (after KAN-85 closure and flag on) | `GET …/staff`, then `…/staff/:id` | The exact pending request (KAN-29); unauthorized staff get 403 `private_review_access_required` | PLANNED |
| 13 | Admin | Try to mark a request paid or act commercially | No such route; 409 `unapproved_intent_has_no_commercial_authority` (KAN-32) | PLANNED |
| 14 | Eligible member | Backend or RPC fails mid-submit | 503 `request_outcome_unconfirmed` with recovery notice; never shows "not saved" | PLANNED |
| 15 | Eligible member, 375 px mobile | Full flow plus error states | Usable layout; clear errors; no token or personal data in URLs | PLANNED |

## 6. Comment text for Jira (to be posted by an authorized owner; not posted by me)

`REVIEW | KAN-33 | head 303042fa (overlay) on candidate e33c12a9 | base 84178ce1 | reviewer 6abf1edf (original Claude) | prior: Docs 183–189 | received: GitHub Actions run 38764174056 attempt 2 log + metadata; attempt 1 never started (billing lock) | PASS (bounded): release-control compiler + exact 66-case regression, 65 passed + 1 named PG16 skip, Linux cloud | remaining: managed DB/Auth (KAN-26), staff readback after KAN-85 (KAN-29), browser journey (KAN-31), full suite/manifest (KAN-33), deploy + live verification (KAN-35) | next owner: Codex coordinator / release owner | handoff: doc 190.`

Not execution, admission, push, deployment or production consent; not human approval; not clinical or security
signoff.
