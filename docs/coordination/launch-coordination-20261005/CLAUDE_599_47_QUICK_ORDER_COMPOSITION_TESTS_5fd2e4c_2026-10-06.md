# Quick Order composition test source `5fd2e4c` / `1595b8d`: bounded source review (packet part C)

**SOURCE: ACCEPT WITH LIMITS** for the four test files as authored at `5fd2e4c`: a test-only, four-file delta inside
the allowed write zones, each file stating its synthetic boundary, every import resolving, the real `App` plus
`PwaLifecycle` mounted as `main.tsx` mounts them, real `serveStatic`, real `setupVite` behind a mocked Vite
transport, and the real `server/index.ts` booted as a child with an explicit synthetic environment. **One P2 bounds
the receipts these tests can produce:** all three server files assert the `/status` privacy-header trio on the intake
document, which exceeds the sixth pin class doc 41 M-F1 prescribed and rests on an undefined phrase in the approved
scope; 17 parameterised cases are therefore predicted red until Samuel dispositions the pending `static.ts` patch
`8392d243`, and in the root file the trio shares one `it()` with the sixth pin itself. **Everything is NOT RUN**; every
statement about passing or failing is a prediction from source, and the executability of the Vite and root files
under the Vitest runner is NOT PROVEN. Nothing here is Samuel's approval, a reservation, or evidence about production.

**What this review is.** The four composition tests the supplemental scope named (doc 42 E-F11; doc 41 M-F1) were
authored at `5fd2e4c74d31562281493013489bb41949979b88` (tree `99ca9ae54298a30c860cfea924d08797a1dc4c9e`), recorded at
`1595b8d`, and are byte-identical at the SQL-draft successor `7d027e4`. The coordinator asked for a verdict on this
source separate from parts A and B. Method: full read of the four files, hash recomputation against the producer and
coordinator records, one read-only lens with an adversarial verifier. Nothing was executed; every statement about
what these tests would do when run is a prediction from source.

## 1. Identity (verified)

| File | Lines | Blob at `5fd2e4c` | Same at `7d027e4` |
| --- | --- | --- | --- |
| `client/src/research/quick-order/QuickOrderApp.composition.test.tsx` | 287 | `85503d76…` | yes |
| `server/research/health/quick-order/static-document.test.ts` | 174 | `10aed9de…` | yes |
| `server/research/health/quick-order/vite-document.test.ts` | 181 | `a626f283…` | yes |
| `server/research/health/quick-order/root-composition.test.ts` | 355 | `7c3fc866…` | yes |

`git diff --name-status c54f53f 5fd2e4c` outside records lists these four additions plus the already-reviewed S4 and
shared-readback paths (docs 43, 44); `5fd2e4c` itself adds only the four. The coordinator checkpoint
`QUICK_ORDER_COMPOSITION_COORDINATOR_CHECKPOINT.json` (worktree 3221, read as data) records four source bindings, 15
frozen references and 24 preserved `fd023e8` module blobs, execution NOT RUN and review pending this session.

## 2. What the tests compose (inspected source)

- **App composition** (`QuickOrderApp.composition.test.tsx`, jsdom): renders the real default `App` inside the real
  error boundary with the real `PwaLifecycle` sibling exactly as `main.tsx` mounts them; nothing in the page, router,
  shell, privacy predicates or PWA module is mocked. `fetch` is stubbed to answer only the credential-free public
  config and a paused Care status and throws for any other endpoint; `Storage.prototype.setItem` and the config read
  are spied with their real implementations; user agent, `sendBeacon`, `requestAnimationFrame` and the History API are
  controlled and restored. Cases: Chromium and iOS Safari keep the intake unavailable with no collection, transport or
  install promotion; the real update notice stays usable beside the unavailable intake; the real header's home action
  survives the document privacy boundary; a parameterised set of aliases (including encoded forms, the doc 41 M-F4
  question). The header states what it cannot prove: Auth, persistence, service-worker registration, real install
  prompts, a production build.
- **Static** (`static-document.test.ts`): real `serveStatic` over a synthetic built shell written to a
  `mkdtemp` directory under the OS temp root (cleanup refuses to remove anything outside that owned prefix); four owned
  targets (exact, query with `ref` and `email`, upper case with trailing slash, percent-encoded) by GET and HEAD;
  `expectPrivateHtml` asserts the private title, `noindex,nofollow,noarchive`, no canonical, no social or structured
  data, no reflected query values; direct refresh re-applies the policy while built assets remain ordinary files; the
  exact `/health → /` 301 control; the Access Hub document under `RESEARCH_INDEXABLE` true and false; neighbours
  (`/health/quick-order-extra`, `/health/quick-order/child`) are not owned.
- **Vite** (`vite-document.test.ts`, labelled "Composition UNIT test"): `vi.mock("vite")` replaces only
  `createServer` with a hoisted boundary (`middlewares` pass-through, a `transformIndexHtml` that injects public
  indexable tags, `ssrFixStacktrace`), so the real `setupVite`, the real `client/index.html` read and the real
  `sendRawHttpDocument` policy run while Vite's transport is synthetic and the `customLogger.error → process.exit(1)`
  path is never reached because no real Vite server is created. Same owned targets, privacy cases, refresh, gateway
  redirect, Access Hub and neighbour controls as the static file.
- **Root** (`root-composition.test.ts`): spawns the real `server/index.ts` as a child of `process.execPath` with
  `--max-old-space-size=1024` and the `tsx` loader, `NODE_ENV=production`, an ephemeral `PORT`, a synthetic dist, and
  an explicit environment allowlist that inherits only OS keys and sets `SITE_URL`, `KAIROS_PROXY_TARGET` and
  `SUPABASE_URL` to a loopback dependency fixture (no Supabase keys, so storage and its timer stay unconfigured),
  synthetic admin e-mails and two synthetic session secrets; the header and the emitted receipt state that the
  unchanged root listener binds `0.0.0.0`, so this is not a loopback-bound root or a network sandbox. Boot waits on
  `/api/health` with a 120 s deadline; `afterAll` sends SIGTERM then SIGKILL with 5 s bounds, closes the dependency
  sockets and server, removes the fixture only when the child's exit is confirmed and the path is inside the owned
  temp prefix, and prints a receipt with probe, dependency, output-tail, exit and cleanup facts; a spawn error,
  unexpected exit or cleanup error fails the suite. Cases: the three containment targets answer 503 `no-store` before
  the parsers; malformed and over-2 MiB owned bodies are refused while the unrelated parser stays active; health,
  public document, redirect and loopback proxy controls; the disabled intake served as private HTML through the real
  static root.

## 3. Predicted outcomes that depend on unapplied patches

- **Privacy headers.** The privacy cases assert the `/status` trio: `Cache-Control: no-store, private`, `Pragma:
  no-cache`, `Referrer-Policy: no-referrer` (static `:97-103`, Vite `:107-113`, root `:351-353` inside the same `it()`
  as the sixth-pin assertions at `:340-348`). At `ac36e60` and at `5fd2e4c`, `server/static.ts:102-106` sets those
  headers only for `/status`; the pending patch `8392d243` (recorded at `1595b8d`) extends that branch with
  `isHealthIntakePath` and the `no-store, private` value. Until Samuel answers that question and the patch is applied
  to the HARD-pinned `static.ts` (which also carries the inherited GATE-01 mismatch), **17 `it()` instances are
  predicted red**: eight in the static test, eight in the Vite test and one in the root test. At the root only the
  first two header assertions fail; `Referrer-Policy: no-referrer` is already supplied by helmet mounted at
  `server/index.ts:268-272` (doc 36 recorded this), so the root test's own comment "frozen static.ts omits these" and
  the producer records overstate the root prediction. These are source predictions, not observed failures; nothing
  has run.
- **Origin of the header requirement.** The approved scope (`QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md:358` at
  `1d4f2c3`) obliges the static test to assert "the specified privacy headers" but specifies none; no reviewed record
  defines them, and doc 41 M-F1 warned that a pin phrased as "private cache headers" would fail against the
  HARD-pinned `static.ts` and prescribed 200, the robots header, no canonical `Link` and the 301 control. The builder
  resolved the undefined phrase to the `/status` trio and proposed `8392d243`. Samuel's disposition of that patch
  either defines the headers or strikes the phrase; this review takes no position on the runtime change, which edits a
  HARD-pinned file.
- **Provider-journal fixture.** None of the four files touches the admin reader, so the unapplied `8396609…`
  fixture (doc 44 RB-F5) does not affect them.
- **Everything else** in the four files depends only on code present at `5fd2e4c`.

## 4. Lens findings (verified)

One lens and one adversarial verifier (archived in `hl12/45_sql_draft_lens_findings.json`, lens
`composition-tests-5fd2e4c`); all six findings upheld at their severities; every hash claim recomputed equal (the four
sources, the 15 frozen references at `5fd2e4c`, `7d027e4`, `ac36e60` and `4669493`, the two pending patches, the
re-derived `static.ts` after-hash `9a3cf706…`, the three trees, and the 24 preserved `fd023e8` module blobs).

| ID | Sev | Finding (verified) | Smallest correction |
| --- | --- | --- | --- |
| C-F1 | **P2** | The privacy-header trio in all three server files (static `:97-103`, Vite `:107-113`, root `:351-353`) exceeds the permitted sixth pin class and rests on the undefined phrase "the specified privacy headers" (scope `:358`); `static.ts:102-106` sets the trio only for `/status`; in the root file the trio is fused into the same `it()` (`:340-354`) as the sixth-pin assertions, so the root sixth-pin receipt cannot be green as authored. Test-only; no privacy defect. | Builder returns a delta that isolates the three header assertions in each file into a separately named block labelled as a proposed hardening pending Samuel's disposition of `8392d243`, leaving the sixth-pin cases free-standing; the scope phrase is either defined by that disposition or struck. No edit under this review. |
| C-F2 | P3 | The root test's comment "frozen static.ts omits these" and the producer records overstate the root prediction: helmet at `server/index.ts:268-272` supplies `Referrer-Policy: no-referrer`, so at the root two of the three header assertions are predicted red, all three in static and Vite (no helmet there). | Record correction only. |
| C-F3 | P3 | The combined footprint is undisclosed: a 1,024 MiB child plus the Vitest worker plus the jsdom App file; `vitest.config.ts` sets no pool, worker, file-parallelism or timeout limits, so a default directory run can breach the shared-host one-heavy-job rule and the 1,536 MiB floor. | The future reservation names a single-file invocation (or `--no-file-parallelism` with one worker) and archives resource samples; disclose the footprint in the plan. |
| C-F4 | P3 | Port selection probes `127.0.0.1:0` and releases it while the child later binds `0.0.0.0` on that number; a collision is a boot failure (child exits, `beforeAll` fails, `afterAll` still runs and kills), not a leak. | Note as a flake vector with one documented retry; do not change the runtime bind. |
| C-F5 | P3 | If the Vitest parent dies abnormally (OOM kill, interrupt during boot) the child can outlive it holding the port; within normal failure paths cleanup is bounded and asserted. | Disclose; operator sweeps stray processes after an aborted run. |
| C-F6 | P3 | Executability dependencies with no precedent in the suite: `server/vite.ts` under the Vitest module runner (`import.meta.dirname`; `../vite.config` plugin factories run at import even with `createServer` mocked), `vi.spyOn` on an ESM namespace export, default 5 s timeouts in the static and Vite files, and the `tsx` loader entry resolved from `node_modules` (installed 4.22.4 exports `dist/loader.mjs`). | Run the Vite file first and alone under the reservation; treat a "cannot redefine property" or `import.meta.dirname` failure as a runner incompatibility, not a privacy regression. |

Verifier additions, all P3 or informational: supertest in the static and Vite files binds an ephemeral port on the
unspecified address per request (installed 7.2.2 `app.listen(0)`), which the headers do not state; the root test's
over-2 MiB body probes with `Connection: close` can surface `EPIPE` or `ECONNRESET` when the root answers before the
body is consumed, so the execution plan should classify that as a harness artefact with one retry; boot-time egress
paths in the child were traced and are closed at source (the Replit connector fetch is gated on environment variables
the allowlist does not inherit; the counter seed is in-memory without `DATABASE_URL`; the outbox worker returns when
Supabase is unconfigured); three supporting facts (helmet 8.2.0 default, `tsx` 4.22.4 loader entry, `@vitest/runner`
4.1.10 running `afterAll` after a failed `beforeAll`) are `node_modules` observations, not Git objects.

Record precision: only the Vite file carries the literal label "Composition UNIT test"; the other three state their
mocked boundary in other words, which satisfies the substance of doc 42 E-F11; the root file is correctly not labelled
a unit test. Seven of the 15 frozen-reference entries read "frozen current source4669493" (missing space) and the
coordinator checkpoint's limitation strings read "pending8392d243" / "pending8396609"; values are consistent with the
bytes.

## 5. Disposition C

- Source and tree: `5fd2e4c` / `99ca9ae5…`; scope the four new test files, unchanged through `18bfbcd`.
- **SOURCE: ACCEPT WITH LIMITS** for the test bytes. Doc 36 QO-P2-01's sixth pin class (real `serveStatic` and Vite
  direct navigation: 200, `noindex,nofollow,noarchive`, no canonical `Link`, no reflected query, `/health → 301 /`
  control) is now **authored** in static `:74-93` and `:142-148`, Vite `:80-103` and `:149-155`, root `:340-348`;
  QO-P2-01 becomes 6 of 6 authored and 0 of 6 executed.
- P0/P1: none. P2: C-F1 (header trio beyond the pin, root receipt fused). P3: C-F2 to C-F6 and the verifier notes.
- Predicted reds (source only): 17 cases, all from the unapplied `8392d243`; none from the unapplied provider-journal
  fixture; no other source-predicted red was found by the lens or the verifier after hunting (Access Hub under
  `RESEARCH_INDEXABLE=true`, home links, iOS hint gating, intake fetch silence all read consistent).
- Qualification gaps: everything; the Vite and root files additionally carry runner-compatibility risk.
- Protected and schema authority: no protected file changed by `5fd2e4c`; `8392d243` would change the HARD-pinned
  `static.ts`, which is Samuel's and the protection owner's decision, not this review's.
- Release A: **no**. Release B: **no**.
- Smallest next action: builder splits the header assertions out of the pin cases (C-F1) as a delta; Samuel
  dispositions `8392d243`; the execution reservation names a single-file invocation order (Vite first, root last) and
  resource samples.
