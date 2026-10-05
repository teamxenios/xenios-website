# Quick Order HTTP successor `fd023e8` / `1b3bb16`: bounded delta review against `c807f19`

**SOURCE: ACCEPT WITH LIMITS** for the six-file HTTP delta. **QO-P2-03: PARTIAL** and **QO-P2-04: PARTIAL**: both source
defects are **closed at source** (independent static derivation by two lenses and two verifiers, plus an executed probe
of the real classifier module under the pinned Node 20.19.0 runtime), and the authored regressions are **NOT RUN** by
anyone, so the composition-level proof the coordinator requires before either finding is called CLOSED is still
missing. **Packet disclosures: VERIFIED**, with record-precision items below. **No P0, no P1.** One P2 found at
`fd023e8` (no record bound the changed runtime to a source identity) is **closed by the records checkpoint `1b3bb16`**.
Real intake, live purchase and production release: **NOT READY**, unchanged.

**Revision note (records-only, this commit; first pushed at `78cd7e6`).** Five record corrections reconciled against the
retained artifacts in doc 39: the probe artifact holds **61** single targets, not 66; the probe's provenance limits are
now stated; the `c807f19` run receipt attributes 999 MiB to the Node run and 933 MiB to the first Vitest run; section 6
names one filtered `tests/handler.test.mjs` per red/green snapshot, not a two-file set; and the "nothing previously
contained is released" wording now carries the F1 exception. Verdict, closure statuses, bounds and holds are unchanged.
The commit message of `78cd7e6` carries the old count and the unqualified wording and cannot be amended; this note
supersedes it. The builder's records-only successor `5ee44d5` is verified in doc 39 and closes QO-R-02 and QO-R-04.

Nothing here is an approval. A1 (`c65d7e49…`) remains unapproved and unapplied, A2 remains undrafted and
unauthorized, GATE-01 and the Core hash pairs remain Samuel's. Reviewer: this session, `claude-fable-5-1`; the
environment reports effort `xhigh` and ultracode on (requested "highest" is not proof of `max`). Read-only Git
objects from `C:/xenios-wt/health-review`; no worktree was checked out at the successor; no test, server, build,
typecheck, browser or database process was launched. The one execution is the classifier probe in section 3, disclosed
as such. Specialists: one HTTP/security lens and one evidence/packet lens, each with an adversarial verifier
(workflow `wf_def6887c-f48`, 4 agents, 120 tool calls); all 11 lens findings were upheld, one at P2 and ten at P3;
full output in `hl12/38_qo_http_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source reviewed | `fd023e8c03baa2326baf707c944bcd25dce7f453`, tree `46de8f772bb04c20eb09d9b8d3fbfacc44d9dd4e` ("fix(quick-order): unify HTTP target ownership and preserve passthrough") |
| Records checkpoint | `1b3bb16bf99d89af18a88c702434e929ebe83c02`, tree `1af8dec1bbcd7378e3af4646ec6c36c70254276a`; `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package*.json` identical to `fd023e8` (empty `diff --stat`); rewrites the handoff to name `fd023e8` / `46de8f77…` as the pushed source, runs the own-entry checkpoint so task, session and lease carry `sourceSha fd023e8`, state `blocked_external`, and adds `evidence/http-regression-plan-fd023e8.json` and `evidence/packet-integrity-http-fd023e8.json`. Further records-only successor `5ee44d53e55774fd8a29ea009dac16da2ed907ef` (tree `d7171c75…`): runtime, tests, patch, evidence and history identical to `fd023e8`; changes only the `APPROVAL_MATRIX.md` GATE-01 provenance and PWA paragraphs plus own continuity entries (doc 39) |
| Predecessor | `c807f1913ce95ebcf4113cd4f1ef5bdfb2f45d09` (runtime identical to `f1e467f`), accepted as a pure relocation in doc 37 (`324183e`) |
| Runtime delta | exactly six files under `server/research/health/quick-order/`: `paths.mjs` (new, 74 lines, sha256-lf `89c017ec…fc88`), `paths.d.mts` (new), `containment.ts`, `handler.mjs`, `containment.test.ts`, `tests/handler.test.mjs`; both test diffs are additions only (60/0 and 197/0) |
| Requests governing this slice | coordinator request `25ca24b`, dispatch `2228172`, Samuel's direct bounded-successor text bound at `b7301fc`, coordinator audit and review request to this context at `7d53f0c` (`QUICK_ORDER_HTTP_REVIEW_REQUEST_fd023e8.txt`), coordinator handoff `bf80c63` |
| Invariance | `git diff --name-only c807f19 fd023e8` over `supabase/`, `server/index.ts`, `client/`, `shared/`, `server/static.ts`, `server/vite.ts`, `client/src/lib/`, `client/src/pwa/`, `client/src/components/`, `client/src/index.css`, `docs/phase2/`, `scripts/`, `package.json`, `package-lock.json`, `MIGRATIONS.md`, `vitest.config.ts`, `tsconfig.json` is **empty**; `MOUNT_PROPOSAL.patch` (blob `48075a4d`, sha256 and sha256-lf `c65d7e49…`), `evidence/mount-proposal-hashes.json`, `evidence/proposal-baselines.json`, `PERSISTENCE_PROPOSAL.md` and `history/` are byte-identical to `c807f19`; the manifest blob `241fc344` is identical at `756a906`, `c807f19` and `fd023e8`; all 14 proposal baselines re-hash (14/14); the old module locations remain absent; no file under `supabase/` or any SQL path changed |

## 2. What changed, read line by line

- **One non-throwing classifier.** `paths.mjs` exports `classifyQuickOrderTarget(req, prefix)` returning `unrelated`,
  `owned-malformed` or `owned-valid` (with a URL built on the fixed sentinel origin `https://quick-order.invalid`).
  Ownership (`looksOwned`) considers both `req.originalUrl` and `req.url`, each in raw and once-percent-decoded form,
  after folding backslashes to `/`, collapsing empty segments and lower-casing, and then again after WHATWG dot-segment
  normalization through a `pathname` setter that cannot adopt an authority. Absolute-form targets contribute a lexical
  path view and a parsed view, for ownership only. Acceptance (`canonicalUrl`) is strictly narrower: origin-form,
  exact-case prefix, no `//`, no `%` in the path, no backslash, `#` or control character, and `new URL` must not change
  the path. A mount-stripped `req.url` is accepted only when it is a suffix of the full `originalUrl` path with an
  identical query. Every branch is wrapped so parse failures become `owned-malformed` when ownership was already
  established and `unrelated` otherwise.
- **Three consumers, one policy.** `containment.ts` responds (same fixed 503 and headers as before) unless the target is
  `unrelated`; `handler.mjs` calls `next()` exactly once for `unrelated` before any port, header or body access, throws
  the scoped `invalid_request` 400 for `owned-malformed`, and proceeds only for `owned-valid`; the parser-error
  middleware forwards unrelated errors unchanged, answers `owned-malformed` with the same fixed 400, and keeps the
  413 / invalid-JSON 400 / fixed 503 mapping for owned-valid targets. `requestUrl()` and `ownsPath()` are gone, so the
  pre-ownership throw that caused QO-P2-04 no longer exists. The handler's downstream use of the URL object is limited
  to `pathname` and `searchParams` (page and search validation), so the sentinel origin changes nothing else.
- **Unchanged.** `send()`, `unavailable()`, origin and `sec-fetch-site` checks, CSRF compare, body limits, replay order,
  receipt validation, `core.mjs`, `fixtures.mjs`, `production.ts`, `legal.ts`, `catalog.ts`, the containment's
  response bytes and headers, and the two public exports of `handler.mjs` (`handler.d.mts` unchanged).
- **Tests.** `containment.test.ts` grows from 5 to 7 cases: a raw-socket `rawPost` helper (so `fetch` cannot normalize
  the target), 25 owned targets that must answer 503 with zero parser and verifier calls and `parsed:false,
  retained:false`, and 11 unrelated targets that must reach the parser and the fallback. The host mirror records its
  observation in a middleware placed **before** the containment, so contained requests do produce the asserted
  observation. `tests/handler.test.mjs` grows from 33 to 40 test groups: an `ownershipBoundaryProbe` whose ports and
  every request body or stream accessor throw on touch, 28 owned-malformed targets, 16 unrelated targets, 10
  conflicting original/effective pairs, 7 canonical rows (including mount-stripped forms), and three parser-error
  groups. The earlier 33 groups (origin, body limits, CSRF, replay, legal, config) are untouched.

## 3. Evidence, by class

| Class | What |
| --- | --- |
| Immutable Git proof | the diff, the invariance list, hashes and counts above; verified from objects, not from the packet; the two verifiers re-derived every lens anchor |
| Producer receipts verified | `packet-integrity-http-fd023e8.json` (`ok:true`, 14 baselines unchanged, six historical logs exact, patch `c65d7e49…`, `patchCheckExit 0`) and `http-regression-plan-fd023e8.json` (red snapshot = `f1e467f` runtime with `fd023e8` tests, green = `fd023e8`; blob and sha256-lf bindings; `materialized:false`; both executions `NOT RUN`, exit and log null); the coordinator's own static audit (`QUICK_ORDER_HTTP_SUCCESSOR_AUDIT_fd023e8.json`: 24 module hashes, 14 baselines, no introduced bug found, no execution) agrees with mine |
| Independently executed by this reviewer | **one pure-function probe** of the real `paths.mjs` blob (materialized with `git show` into a scratch directory; no worktree touched) under `node-v20.19.0-win-x64`: **61** single targets with `originalUrl` raw and `url` run through the host's leading-slash collapse (33 owned-malformed, 6 owned-valid, 22 unrelated), 12 original/effective pairs, 23 odd inputs. Result: every adversarial owned-looking alias is `owned-malformed` (case, literal and encoded dots including double-encoded, backslashes literal and `%5c`, leading and interior empty segments, `%2F`, `%71`, `/../other`, fragments, absolute forms with one to four scheme separators, `http://evil.test/api/health/quick-order/…`); canonical roots, trailing-slash root, query-bearing paths and mount-stripped pairs are `owned-valid`; `//other`, `//external.invalid/api/…`, `/api/health/quick-order-other`, `/api/health/quick-orders`, `/api/health`, dot-segment paths that normalize elsewhere, and lookalikes with trailing `.`, `%20`, `%2e` or a unicode hyphen are `unrelated`; conflicting pairs are `owned-malformed`; **0 throws**; **0 owned-valid results with a non-sentinel host**. Receipt: `hl12/38_claude-qo-classifier-probe-fd023e8.{mjs,out}`. A reviewer micro-probe of one module: not a qualification run, not a test-suite execution, not Express composition proof, and it does not exercise Node's HTTP parser. **Provenance limits:** the archived output header records the source SHA, the `paths.mjs` sha256-lf and the pinned Node version, but no argv, working directory, scratch path, start or end time, exit code, signal, stderr or resource sample was retained, and the executed scratch copy of `paths.mjs` is not archived beside the script (the hash in the header binds it to the blob at `fd023e8` by narrative only); the script logs classifications without assertions or failure exits; the foreign-host counter iterates the 61 single targets only, not the pairs or odd inputs; the run was unreserved and took place while disk sat at 13.91 GiB, below the coordinator's floor. No retrospective wrapper has been manufactured and no rerun has been made. |
| Narrative only | the packet's description of what the authored tests "assert", until they run; the coordinator's host sample (13.91 GiB, 1,331 MiB) quoted in the packet; Samuel's attachment `20a5d445…` cited as the narrowing authority (not in the repository) |
| Missing (NOT RUN / NOT PROVEN) | execution of the 7 new node:test groups and the 2 new Vitest cases at `fd023e8`; the red run against `f1e467f`; Node's HTTP parser (llhttp) accepting the raw request-targets with literal backslashes and `http:////` so those containment rows are deliverable at all (the same forms are covered parser-free at handler level); Node 20's own URL implementation treating `%2e%2e` as a dot segment in the pathname setter (the probe covers the 61-target table, so this is established for the probed strings but was argued from the whatwg-url source by the lens); the composed containment inside the real `server/index.ts` (mount still unapplied); typecheck of the first non-test `.ts → .mjs` import in the typechecked tree (`containment.ts → ./paths.mjs`, expected to resolve to `paths.d.mts` under `moduleResolution: bundler` with TypeScript 5.6.3, unproven); build; full-App; reverse-proxy normalization; browser; database |

Host at review time: 825 to 1,331 MiB free RAM, 13.91 GiB disk (the coordinator's 20 GiB floor unmet; its read-only
assessment leaves the 13 GiB drop unattributed and notes a 41.8 GB pagefile allocation with 16.5 GB peak use; this
session's own footprint measured 572 MiB scratch, 317 MiB transcripts, 230 MiB scratch worktree plus 418 MiB
`node_modules`, so it does not explain the drop), no qualification reservation, no heavy job observed. I did not run the
suites, per the request.

## 4. Closure status

| Finding | Status | Basis | What remains |
| --- | --- | --- | --- |
| QO-P2-03 containment/handler path disagreement | **PARTIAL: closed at source** | one classifier for all three consumers; ownership is a conservative superset of the handler's acceptance and of anything Express 5 (case-insensitive mount matching, `parseurl` pathname) would route into the namespace, with one exception (F1 below); nothing `c807f19` contained is released **except** that F1 single-slash-scheme form, whose delivery through Node's HTTP parser is unproven and whose consequence if delivered would be parse-then-404 with no sink (`/api/health/quick-order/../other` stays contained); `/api/health/x/../quick-order/requests`, `%2e%2e`, backslash and `/API/…` now terminate before parsers; probe confirms the table | run `containment.test.ts` (7 cases, 46 rows) at `fd023e8` under a reservation; red run per the builder's plan; verify the receipts |
| QO-P2-04 root-mounted handler interferes with unrelated requests | **PARTIAL: closed at source** | ownership is decided before any throw; `unrelated` returns `next()` once and touches nothing; owned-malformed, including `//api/health/quick-order/requests` and absolute forms inside the namespace, gets the fixed in-namespace 400 and never `next()`; the parser-error middleware mirrors this; a leading `//` is never passed to `new URL` as a relative reference, so no attacker host can become origin, session binding, return URL or destination | run the 7 new `handler.test.mjs` groups at `fd023e8` under a reservation; verify the receipts |
| Packet disclosures | **VERIFIED** | PWA: correct file, predicate and HARD pin `9594f398…` (re-hashed), separate scope, not folded into A1. Regression pins: the doc 36 QO-P2-01 list is recorded as required accompanying test work, with no edit to any protected or shared test file. GATE-01 sequencing: the conclusion is correct (see QO-R-02 for an attribution correction that also applies to my own earlier records). 706 MiB: withdrawn in `README.md` and `QUALIFICATION.md` without a reconstructed number. Lease: only the three obsolete prefixes removed from this builder's own task and lease entries; lease, session and task counts and both registry `updatedAt` values identical at `c807f19` and `fd023e8`. `c65d7e49…` unchanged, unapproved, unapplied. Runner coverage explained and consistent with `vitest.config.ts:29`, `package.json` `check` and `tsconfig.json`. A2 recorded as future holds only; `PERSISTENCE_PROPOSAL.md` untouched (blob `44974092`). Test status stated as authored, NOT RUN, resource-deferred, with the coordinator's slot state cited; no predecessor pass transferred. | the P3 wording items in section 5 at the next records commit |
| Adjacent containment and passthrough regressions | **PASS (static)** | the 5 pre-existing containment cases and 33 pre-existing handler groups are unchanged; neighbour routes `/api/health`, `/api/health/quick-order-other`, `/api/health/quick-orders` stay unrelated; `GET /api/health` is unaffected; no other server registration exists under `/api/health/quick-order` | executed proof with the same runs |

## 5. Findings (all upheld by the verifiers; none blocks the source verdict)

| ID | Sev | Where | Finding | Smallest repair |
| --- | --- | --- | --- | --- |
| **QO-R-01** | P2 → **CLOSED at `1b3bb16`** | `.xenios/handoffs/quick-order-20261005-handoff.md`, the three registries | At `fd023e8` the handoff still named `f1e467f` as the final pushed source, said later commits add no runtime change, and listed the dropped lease prefixes as retained; task, session and registry entries still carried `sourceSha f1e467f` while the runtime had changed. The coordinator's request sequenced the records step after the push, so this was an unfinished second step, not concealment. | Done: `1b3bb16` names `fd023e8` / `46de8f77…`, carries `sourceSha fd023e8` and `blocked_external` in task, session and lease, and adds the integrity and regression-plan receipts. Verified above. |
| F1 | P3 | `paths.mjs:12-18` | A scheme-prefixed target with a single slash after the colon (`http:/api/health/quick-order/requests`) classifies `unrelated`, because the lexical regex treats `api` as the authority; Node's legacy `url.parse` (used by `parseurl` for non-`/` targets) would give Express the pathname `/api/health/quick-order/requests`, and the `c807f19` predicate would have contained it. The only exception to "nothing previously contained is released". Deliverability is NOT PROVEN: as both lens and verifier read llhttp's URL grammar, a scheme must be followed by `//` or Node answers 400 before Express; if it were delivered the consequence is the parse-then-404 class with no sink, not a leak. Escalates to P2 only if a raw-socket probe shows Node delivers it. | In `pathViews`, when a scheme is present and the remainder does not start with `//` or `\\`, also push the post-colon remainder as an ownership view (owned-malformed only, never valid); add a handler-level row expecting 400. Batch with the next source slice, not a slice of its own. |
| F2 / QO-R-05 | P3 → **CLOSED at `1b3bb16`** | registries | Interim state at `fd023e8` (`claimed` / `active`, stale `fc11f54` blocker text). | Done by the checkpoint. |
| F3 | P3 | `paths.mjs:26-33` | Mounted at the app root, every request that is not lexically owned costs four `new URL(PATH_ORIGIN)` constructions plus four pathname-setter parses (both `originalUrl` and `url`, each in raw and decoded view), ahead of static and Vite. Constant-time, no behaviour effect. | Optional: short-circuit when no view contains the last prefix segment (normalization removes but never creates characters), or memoize the URL object. |
| F4 | P3 | `containment.test.ts:58-74` | Rows with literal backslashes and `http:////` scheme forms depend on llhttp accepting those request-targets; if it refuses, Node answers 400 before Express and the rows fail for delivery reasons. Only `#` and standard absolute-form raw rows are proven delivered (doc 37 receipt at `c807f19`). The same forms are covered parser-free as direct handler objects. | When the slot exists, run once; move any row that fails with an HTTP 400 and no containment observation into a separately named `it.each` documented as parser-level refusal, keeping the handler-level case. Do not weaken assertions for delivered rows. |
| QO-R-02 | P3 → **CLOSED at `5ee44d5`** | `APPROVAL_MATRIX.md` GATE-01 paragraph (and **my own docs 29, 36 and 37**) | The paragraph attributes both seams' inherited drift to the Access Hub change. Git shows that is exact for `client/src/App.tsx` (`3b3b808b… → 1bc59371…` at `0d22757`, which also touched `AccessHub.tsx` and `server/static.ts`) but not for `server/index.ts`, which left its pin `1d6594d6…` at `3562c03` (2026-09-30, "durably recover verified-payment audit and notifications") and moved again through `cb9b8d6`, `5809b72`, `27463d7`, `2f0a975`, the HL-12 provider and payment wiring, reaching `ba5800e6…` before `3eaa017`. I re-derived these hashes myself. **Correction to my earlier records:** doc 36 QO-P1-B and doc 37 section 4 say both seams were off-baseline "since HL-17 `0d22757`"; the App.tsx half is right, the server/index.ts half should read "since the HL-12 chain beginning `3562c03`". The sequencing conclusion is unchanged: after A1 neither seam's re-cut could isolate its inherited delta alone. | Done at `5ee44d5`: the paragraph now names both pin and current hashes and the originating commits (`0d22757` for App.tsx; `3562c03` then `cb9b8d6`, `5809b72`, `27463d7`, `2f0a975` for server/index.ts), matching my own derivation; the sequencing conclusion is preserved. No decision or hash in any record is wrong. |
| QO-R-03 | P3 | `paths.mjs:6,56-58,66`; `HTTP_CORRECTION.md` | Two implemented behaviours are undocumented: absent or non-string targets are `unrelated` (tested), and the original/effective conflict check accepts any pathname suffix rather than a `/`-aligned mount strip. Unreachable as a defect: only Express's router rewrites `req.url`, and it strips only on a `/` boundary; dispatch uses the `originalUrl`-derived URL. | One sentence in `HTTP_CORRECTION.md`; optionally tighten the suffix test to a `/` boundary in the next reviewed source slice, with a test. |
| QO-R-04 | P3 → **CLOSED at `5ee44d5`** | `APPROVAL_MATRIX.md` PWA sentence | "only consults the exact Health gateway and its other sensitive roots" understates the predicate (it also fails closed on Research, recommendation, Care, recovery hashes and encoded structural characters); the eligibility conclusion for `/health/quick-order` is correct. | Done at `5ee44d5`: the sentence now lists the `normalizeCarePath` and encoded-structural refusals (`%2e`, `%2f`, `%3f`, `%5c`, `%23`), Research, recommendation, Care, exact `/health`, recovery hashes and sensitive roots, matching `PwaLifecycle.tsx:28-60`; eligibility conclusion and separate protected scope retained. |
| QO-R-06 | P3 | `RELOCATION.md:50-51` | A historical sentence still says the "effective `req.path` pre-parser containment" is unchanged; at `fd023e8` the containment no longer reads `req.path`. The file labels itself historical and points to `HTTP_CORRECTION.md`. | Reword to say the contract was unchanged by the relocation and the classifier was later replaced. |
| QO-R-07 | P3 | `APPROVAL_MATRIX.md` A2 row | The A2 holds are recorded mostly by reference; the coordinator's `25ca24b` request asked for the full list (canonical source and recovery consequence, line fields and attribution/code mapping, outbox template, actor/key/standing mapping, predecessor guard chain, Health legal and classification, currentness authority, and the 100-versus-50 confirmation). The packet attributes the narrower scope to Samuel's attachment, which is not in the repository (NOT PROVEN). Nothing drafts A2 or asserts an owner decision. | Add a short hold list naming QO-P2-05, -06, -09 to -15 and 100-versus-50, with no design text. |
| verifier note | P3 | `handler.test.mjs:342` | Doc 36's requested handler-level assertion that `//api/health/quick-order/requests` stays refused is present as the `/config` variant; the `/requests` variant sits at `containment.test.ts:64`. Substantively equivalent. | none |

## 6. Smallest coherent follow-up

1. **Coordinator**: grant one bounded serialized reservation for the targeted red/green the builder already specified
   (`http-regression-plan-fd023e8.json`: per snapshot, **red** on the `f1e467f` runtime with the `fd023e8` tests and
   **green** on `fd023e8`, both mandatory; each snapshot runs **one filtered `tests/handler.test.mjs`** under node:test at
   128 MiB old-space with the seven-group `--test-name-pattern`, then the single `containment.test.ts` under Vitest at
   1,024 MiB with the two-case `-t` filter; not the historical two-file Node suite), with fresh per-job prechecks. Red must
   fail for the intended defect, not for an import or setup error. If the 20 GiB
   disk floor must hold, the next step is the disk cause, not a threshold change. A reviewer rerun is not needed; the
   builder's receipts at `fd023e8` will do, and I will verify them from receipts (blob bindings, exits, raw logs, F4
   handling).
2. **Builder**, next records commit only: the QO-R-02, -03, -04, -06, -07 wording items. Next source slice, only when
   one is otherwise justified: F1 ownership view and the F3 short-circuit, both owned-malformed-only and behaviour-
   preserving, with tests.
3. **Then**: QO-P2-03 and QO-P2-04 move from PARTIAL to CLOSED on receipt verification, with no further source review
   unless the runs fail.

## 7. Next action permitted under existing scope

Receipt verification of the targeted runs when they exist; otherwise checkpoint. No A1 application, no A2 drafting,
no SQL, no hosted action, no lane contact, no new audit.

## 8. Held founder and hosted decisions (unchanged)

A1 edit-from-exact-baseline authority on four protected successors plus two allowed-zone edits, sequenced with GATE-01;
PWA `PwaLifecycle.tsx` as its own protected scope; A2 with the doc 36 section 7 conditions binding; the three Core hash
pairs and the manifest re-cut; GATE-01 / Access Hub; Health legal pair (not `early_access_terms/v1`); Health
classification, visibility, destination, standing and currentness authorities; managed SQL registration or apply; real
intake, payment, provider, partner, publication, production. Separate dispositions: **SOURCE INTEGRATION: ACCEPT WITH
LIMITS (this delta, pending executed regressions)**; **LIVE INTAKE: NOT READY**; **LIVE PURCHASE: NOT READY**;
**PRODUCTION RELEASE: NOT READY**.
