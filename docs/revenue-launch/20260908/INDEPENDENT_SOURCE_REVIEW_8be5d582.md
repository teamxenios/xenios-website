# Independent exact-source & evidence review — Resource Hub candidate 8be5d582

**Reviewer:** Claude Fable, session `fable-recruiter-resource-hub-20260906` (model Claude Opus 4.8). Independent of ASTRA-A's execution lane; not the author of the candidate, the harnesses, the browser host/driver, or the packet; not the production executor. This is **not** ASTRA-B's verdict and does not replace it; if B delivers a source-bound verdict, B's stands alongside this one.

**Method:** read-only inspection of Git objects and committed receipts in a worktree checked out at the candidate; the canonical validator functions re-run to recompute the ownership attestation; the installed provider clients read for behavioural facts. No managed, staging or production call was made by the reviewer; private result/journal files were not opened. A six-lens adversarial workflow (runtime, tests, API harness, browser host, browser driver, packet) corroborates this review; its adjudication is folded in below.

## Verdict

- **Application source (3814c687 → 8be5d582): ACCEPT.** The change is correct, minimal and honestly evidenced.
- **Release evidence / packet: ACCEPT WITH THREE CONDITIONS before any deploy.** Two are closed by this review; one is a founder-scope decision and is escalated.

An 8be5 deploy keeps the Hub flag **disabled**, i.e. the same production posture as the live 3814. Activation is a separate, still-open decision and is **not** endorsed here.

## What I verified (holds)

1. **Runtime diff is exactly three files** — `service.ts`, `store.ts`, `supabase-store.ts`. Every other path in the 51-file range is a test (6), a harness script (2), or records/docs (40). No route, env read, SQL, grant, policy, scanner or dependency change; `scripts/acceptance/**` unchanged.
2. **Both hardenings are present and sound.** Upload replay/race returns the winner only when sha256 **and** filename match, else a typed `resource_state_conflict` (409); the review update is one conditional PATCH keyed on `state` + `reviewed_at` + `reviewed_by_admin` + `review_reason` with `IS NULL` handling, zero rows → typed conflict (409), provider error → plain error (503), and `reviewed_at` kept as raw provider text so no `Date` truncation. Confirmed against installed postgrest-js 2.108.2 that `maybeSingle()` collapses a zero-row array to `data:null` for every method, so the `!result.data` conflict check is correct.
3. **Flag-off behaviour is unchanged.** The dark store answers empty/404/503 before any new code path; `updateVersion`'s new third argument is ignored by the refuse stub.
4. **Ownership attestation recomputes to A's draft exactly** using `buildIntegrationOwnershipReview` + `trustedOwnershipPolicy` at 8be5 over base 3814, lane `release-manager`: policy `8f84c67c…`, diff inventory `a6b6c468…`, finding inventory `69ecb750…`, counts 37 / 0 / 0. Artifact bytes written to `docs/coordination/evidence/XENIOS_RESOURCE_HUB_2026-09-07.integration-ownership-review-8be5.json`, sha256 `4877bd70c66ab1646b24a585d7773b9bf9bd0bdf1d49955d14dc2d9cbf4d12bd`.
5. **Every packet binding matches Git objects** — trees for 711bd41 / 2873a33 / 9d33ab5 / 8be5; host file `8edbab84…`; driver file `d7a98d29…`; supplemental map at 594e323 `5ba0f1bb…`; foundation harness at 8be5 byte-identical to 01a479d (`f69d3e98…`). Application source is byte-identical to the reviewed 62e6c63; only the three foundation-harness files changed after it.
6. **Managed API receipt reconciles** with the 711bd41 harness expected attempts/writes (objects 4/4, resources 4/4, versions 4 attempts→2, reviews 7→4, publications 2, withdrawals 2, deliveries 6, 5 expected refusals) and its SQL pre/post (0/0/0/0 → 4 resources / 2 versions / 6 deliveries / 4 objects, 2 withdrawn, 5 denied + 1 delivered, 2 empty resources). Authorization **denials are proven here at the API layer with exact status codes** (401 signed-out, 403 member, 404 non-partner / outside-audience / suspended).
7. **Browser receipt reconciles** with the driver/host code: 15 steps, 45 width captures, 8 real sign-ins and 8 sign-outs through the application's own controls (`/auth/v1/logout`, not storage-clearing), stale-download-after-logout discarded, byte-exact downloads, SQL delta 1/1/1/2/1/1/2.

## Conditions before deploy

**C1 — bind an independent review to the *executed* browser host and driver. CLOSED by this review.**
The packet's browser review receipts cover the **pre-fix parents** (`browser-host-source-review-5bc0efa9`, `browser-driver-source-review-6098a92f`); the browser run executed `2873a333` (host) and `9d33ab5` (driver), which add exactly the Express-5 startup fix and the observer-serialization fix — the code paths that failed in run1/run2. I read both diffs from Git:
- Host `5bc0efa9 → 2873a333` (+37 / −11): refactors route mounting into `mountCanonicalBrowserRoutes`, replaces `app.get("*", …)` (which Express 5 rejects) with a pathless GET-only `app.use(…)`, and adds stage tracking + error-name sanitization. The outer host gate (host/origin/sec-fetch, `/api/` allow-list, 503 for out-of-scope) is preserved. **Sound.**
- Driver `6098a92f → 9d33ab5` (+77 / −15): moves inline instrumentation into fixed `BROWSER_SCRIPTS` strings passed via `addInitScript({content})` / `evaluate(expression)` to survive Playwright/tsx `__name` serialization, plus a `selfTest` negative control and page-error diagnostics. No credential or fixture value is interpolated. **Sound.**
I bind this independent source review to the executed commits `2873a333` / `9d33ab5`.

**C2 — an arms-length evidence verdict, not reciprocal review among A's own delegated agents. CLOSED by this review.**
The packet's evidence reviews were performed by A's own delegated helpers (`managed_hub_harness`, `release_manifest`, `runtime_successor_review`) reviewing each other's artifacts. That is not arms-length. This review is outside the A execution lane and is that arms-length check. (The packet does correctly state B acceptance is still pending, so this was labelling, not self-acceptance.)

**C3 — confirm the deploy authorization covers an 8be application-code successor. ESCALATED to Samuel / A. OPEN.**
`standing-conditional-authorization-20260908.json` names the **installation lineage** (`identifiedOriginalCandidate` c350, `qualifiedCorrectedSuccessor` 3814, `expectedLiveSha` ff3c), was `verifiedAt` 14:20Z — **before** the 8be gates (API 17:18Z, browser 18:01Z) — and describes its successor as one that "corrects **metadata-only** PII findings." 8be5 changes three application **runtime** files, so it is an application-code successor, not a metadata-only correction. The record's general clause ("covers qualified in-scope releases with pinned exact commit/manifest, independent review and required checks") plausibly reaches an 8be deploy that passes the same installation-class gates with the Hub still off — but the record does not name 8be and predates its qualification. A must either cite the exact standing-text clause that generalizes to an application-code successor, or obtain a one-line founder confirmation. Activation stays separately gated regardless.

## Findings that do not block (disclose, then proceed)

- **Browser denial evidence is presentation-only.** The partner adapter maps 403→`forbidden` and 404/501/503→`unavailable`, and the client collapses both to one "platform is being prepared" state, so the rendered non-partner screen cannot by itself distinguish an audience denial from an outage. Not material because the **API layer already proved the denials with exact codes**; the browser layer only needed to prove rendering. Keep it in the receipt's `notProven`.
- **23 console-error events counted without retained text** (adjudicated 3–0 refuted): disclosed as a limitation; zero page errors / boundary refusals / asset failures were observed, and the host deliberately 503s incidental shell routes.
- **Minor packet arithmetic/labelling:** scan coverage "4,636 added lines" vs a 4,639-insertion diff; the supplemental map hashed two ways without stating encoding; requestCounts omit itemizing every read. Cosmetic; fix in the final manifest notes.
- **Test-double fidelity (tests lens, 0 survived):** the source-string containment test and the fake client's `.is`/`.eq` handling are weak in isolation, but the managed run exercises the real adapter against real PostgREST, which is the proof that matters.

## Cross-check status

The six-lens adversarial workflow's first pass refuted the runtime and tests findings (3–0 and 3–0) and one browser-driver finding (console errors, 3–0); the verify passes for the API-harness, browser-host, browser-driver and packet lenses were killed by a session usage limit and are being **re-adjudicated from cache** (run `wf_fed9cb16-f83`). This markdown records my own independent assessment of the surviving substantive findings (the three conditions above); the workflow re-run is corroboration and will be appended to `independent-source-review-8be5d582.json` when it returns. No finding I assessed is a code defect in the candidate.

## Boundaries

Read-only review only. No deployment, activation, migration, configuration, credential or customer action is authorized by this record. A remains the sole production executor.
