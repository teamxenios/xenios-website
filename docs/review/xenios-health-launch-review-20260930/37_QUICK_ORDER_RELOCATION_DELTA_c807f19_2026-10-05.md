# Quick Order relocated successor `f1e467f` / `c807f19`: delta review against doc 36

**Decision: relocation ACCEPTED as a pure move.** The 22 Quick Order files at `c807f19` are the doc 36 module bytes
at permitted Research locations; the protection gate no longer reports any Quick Order violation; doc 36 **QO-P1-A is
CLOSED**. The module source therefore moves from "NOT INTEGRABLE as located" to **ACCEPT WITH EXPLICIT LIMITS,
integrable at source** with every doc 36 limit, P2 condition and NOT PROVEN item carried unchanged.

**Regenerated A1 patch `c65d7e49…`: identity VERIFIED, disclosure gap CLOSED (QO-P1-B), still NOT APPROVED.** Applying
it remains Samuel's edit-from-exact-baseline decision on four protected successors, sequenced with GATE-01, and the
patch still carries zero regression pins (QO-P2-01) and no PWA disclosure (QO-P2-02).

Nothing here is real-intake, database, payment, provider, partner, hosted-action or production approval, and nothing
is recorded as an approval Samuel has not given. Reviewer: this session, `claude-fable-5-1`, effort `xhigh`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Relocation commit | `f1e467f74b01ae2ab866bb791a3c11d657a5d69c`, tree `6bc4fd7a7483822d4af87a3c07ab7263c0fbc377` |
| Records-only successors | `7b23247c5292d0e42e8af14d56526cd9712aaf77` → `c807f1913ce95ebcf4113cd4f1ef5bdfb2f45d09` (branch tip at review time, tree `57a8620b800d5da7a76d887f7bb9302d0415962f`); `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package*.json` identical to `f1e467f` (empty `diff --stat`) |
| Predecessor reviewed | doc 36: source `4abd2c5` / handoff `b353092` (commit `2d7533f` on this branch) |
| Coordinator authority for the move | `8aa3f83` `QUICK_ORDER_RELOCATION_DISPATCH.txt` on `codex/xenios-launch-coordination-20261005` (same builder, same lease, narrow relocation only, no semantic fixes, no heavy reservation); coordinator verification `8a4cb5e`; tip `9aeab13` |
| Protected, manifest, SQL, ledger, DAG | unchanged from `756a906` (builder receipt `packet-integrity-relocated-f1e467f.json`: 14 baselines unchanged; my gate run: 34 protected hashes verified, same four inherited mismatches as doc 35) |

## 2. Relocation purity (verified by me from Git objects)

| Check | Result |
| --- | --- |
| Rename set | 22 paths: 7 `client/src/quick-order/` → `client/src/research/quick-order/`, 15 `server/health/quick-order/` → `server/research/health/quick-order/`; `shared/health/quick-order/` had 0 files, none invented |
| Byte identity | 15 files LF-identical (`R100`): all 7 client files, `containment.ts`, `containment.test.ts`, `core.mjs`, `core.d.mts`, `handler.mjs`, `handler.d.mts`, `tests/fixtures.mjs`, `tests/handler.test.mjs` |
| The 7 changed files | `catalog.ts`, `catalog.test.ts`, `legal.ts`, `ports.ts`, `production.ts`, `production.test.ts`, `tests/core.test.mjs`: every `+`/`-` line is a relative import, `vi.mock` specifier or fixture-source path. I resolved each: `../../research/assisted-order/*` → `../../assisted-order/*`, `../../research/policies-data` → `../../policies-data`, `../../research/rate-limit` → `../../rate-limit`, `../../research/master-offerings/model` → `../../master-offerings/model`, `../../../shared/*` → `../../../../shared/*`, and in `tests/core.test.mjs` one additional `../`. Each resolves to the same canonical target as before. No validation, routing, storage, authority or test-assertion change. |
| Old locations | Absent at `c807f19` (`git ls-tree` finds no `client/src/quick-order/`, `server/health/`, `shared/health/`). No re-export left behind. |
| Stale references | `git grep` over `client`, `server`, `shared`, `scripts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts` for the old module paths finds only the public URL literal `/api/health/quick-order` (the API namespace, intentionally unchanged) |
| Lease | `17093695-69b5-4cc0-8b29-aedb82bf6409` extended to the two new prefixes; old prefixes retained "for removal/history"; no other owner's entry changed |
| Builder's static receipt | `relocation-static-source-f1e467f.json` `ok:true`: manifest and verifier byte-identical to `756a906`; 22 rows `oldClass` 14 violation + 8 test → `newClass` 14 allowed + 8 test; `verify-relocation.mjs` applies hunks to strings only and never touches the six targets. It says, correctly, "not a full gate or executed application proof". |

## 3. What I executed independently (worktree `C:/xenios-wt/closeout-review`, detached at `c807f19`, clean before and after)

| Run | Result | Receipt |
| --- | --- | --- |
| Protection gate, bounded `3eaa017..c807f19`, pinned Node 20.19.0 | 139 changed = 51 allowed + 52 infrastructure + 3 seams reported (`App.tsx`, `server/index.ts`, `server/research/index.ts`, inherited) + tests; **zero out-of-zone paths**; hash FAIL only on the three pending-approval Core files plus inherited `static.ts` (**0 new**, the doc 35 standard) | `hl12/37_claude-gate-c807f19.out` |
| `node --test` on the relocated `tests/core.test.mjs` + `tests/handler.test.mjs` | **73 / 73 pass**, exit 0 | `hl12/37_claude-qo-nodetest-c807f19.out` |
| Vitest, the six relocated files, `--maxWorkers=1 --no-file-parallelism --cache=false --reporter=verbose`, heap cap 1024 MiB | **6 files, 116 / 116 pass**, exit 0 (OperatorDeclarations 2, QuickOrderPage 25, contracts 40, catalog 34, containment 10, production 5); executed paths are the new ones | `hl12/37_claude-qo-vitest-c807f19.out` |
| Host receipts around the runs | free RAM 999 → 933 → 1,421 MiB (first pass) and 1,206 → 1,326 MiB (verbose rerun); 26.96 GiB disk; no `tsc`, Vitest, Docker build or other heavy Node job running; the builder's reservation `fc11f54` was already `RELEASED_AFTER_PRECHECK_REFUSAL` | in the receipts' header lines |
| Regenerated patch | sha256-lf `c65d7e49a9f5ec87262d4e3b106ab5e16b1c3d1ecd46a01c8a7ca4699e6d92af`; six before-hashes equal the current bytes at `c807f19` (same blobs as `4abd2c5` and `756a906`); `git apply --check` and `git apply` succeed on a scratchpad copy; after-hashes equal `evidence/mount-proposal-hashes.json` (`App.tsx` `1bc59371… → 1a0ba37c…`, `server/index.ts` `ba5800e6… → cc1d8d4d…`, the other four unchanged from the held table); the diff against the held `6481c2ad…` patch is exactly the two import lines | `hl12/37_mount_patch_c65d7e49_verification.json` |

These are reviewer runs. They prove the seven import rewrites resolve and the suites pass at the relocated paths. They
are not the builder's qualification receipt (the builder's own successor tests are NOT RUN; its precheck refused at
503 MiB and released the slot without retry, which was the right call), not a typecheck (not run by anyone;
free RAM stayed below the 2 GiB rule, so QO-P2-08 stays NOT PROVEN), and not full-App, build, browser or database
proof.

## 4. Doc 36 findings after this delta

| Doc 36 item | Status at `c807f19` |
| --- | --- |
| **QO-P1-A** location violation | **CLOSED** (relocation; gate zero out-of-zone) |
| **QO-P1-B** A1 understated protection impact | **CLOSED as disclosure**: `APPROVAL_MATRIX.md` now carries the per-target class table (tracking/attribution HARD `fileHashes` pins; App/server reported seams already off-baseline; paths/raw-http-policy allowed zones still needing scope and lease), states the request is edit-from-exact-baseline authority only, no successor-hash approval and no manifest re-cut; the held patch is preserved under `history/` with its hash table. **Still open for Samuel's text**: the GATE-01 sequencing point (a re-cut of the App/server seams after A1 could no longer isolate the HL-17 bytes), which the packet does not state. |
| QO-P2-01 patch carries zero regression pins | **OPEN** (the regenerated patch has no test hunks) |
| QO-P2-02 PWA install promotion not suppressed, not disclosed | **OPEN** (not mentioned in `APPROVAL_MATRIX.md` or `RELOCATION.md`) |
| QO-P2-03 containment predicate (case, dot-segment, backslash) | **OPEN**; `containment.ts` bytes identical |
| QO-P2-04 handler root-mount 400 before `ownsPath` | **OPEN**; `handler.mjs` bytes identical |
| QO-P2-05 only the research-use pair is servable | **OPEN** |
| QO-P2-06 negative-filter requestability | **OPEN** |
| QO-P2-07 no rendered evidence in the real shell | **OPEN** |
| QO-P2-08 typecheck | **OPEN**, NOT PROVEN |
| QO-P2-09 to QO-P2-15 (A2 design conditions) | **OPEN**; `PERSISTENCE_PROPOSAL.md` unchanged |
| QO-EV-03 unreceipted 706 MiB figure | **OPEN** (`README.md` at `c807f19` still cites it) |
| QO-EV-04 lease and registry hygiene | partly addressed (lease extension recorded); the retained old prefixes can be dropped at the next records commit |

New P3, records only: the handoff reports that the builder's outgoing coordinator status message was rejected by its own
automatic approval review and that it relied on the pushed packet instead; the coordinator's `8a4cb5e` shows it read
the packet, so no information was lost. Not a source defect.

## 5. The four decisive proofs (unchanged from doc 36)

Real adapters **NOT PROVEN**; durable request/evidence/idempotency **NOT PROVEN**; operator readback **NOT PROVEN**;
actual route proof **NOT PROVEN**. Relocation changes none of them.

## 6. Status for the decisions in front of Samuel

- **A1 on the relocated bytes (`c65d7e49…`)**: decidable now. What he would be approving is edit-from-exact-baseline
  authority on four protected successors, by class: HARD `client/src/lib/tracking.ts` `258eda22… → 8d62f7a1…`, HARD
  `client/src/lib/attribution.ts` `2c406d8a… → 6b1ab473…`, seam `client/src/App.tsx` `1bc59371… → 1a0ba37c…`, seam
  `server/index.ts` `ba5800e6… → cc1d8d4d…`, plus two allowed-zone edits (`shared/care/paths.ts`
  `da51b6c8… → a15adc22…`, `server/research/seo/raw-http-document-policy.ts` `90082298… → 50b80817…`). My advice
  carried from doc 36: if approved, condition it on the same reviewed delta adding the QO-P2-01 regression pins and
  disclosing QO-P2-02, and decide the GATE-01 sequencing first or alongside, since the App/server seams would then
  carry two unreviewed deltas. The successor hashes still need their own review before any manifest re-cut.
- **A2**: unchanged; his decision, with the doc 36 section 7 conditions binding if granted; source-only, unregistered,
  unapplied.

## 7. One next bounded action for the existing owner

In the leased directories only, no protected file, no SQL, no new surface: unify the containment and handler path
derivation and predicate with the case, dot-segment, backslash and `%2e%2e` tests (QO-P2-03); fix the root-mount
`next()` asymmetry with its two tests (QO-P2-04); in the packet, disclose the PWA limitation (QO-P2-02) and the GATE-01
sequencing point, strike or receipt the 706 MiB figure, and drop the removed prefixes from the lease. The builder's
own successor test receipt can be produced when its reservation protocol allows; my receipts above already bind the
relocated bytes to passing runs. No A2 drafting and no mount application until Samuel decides.

## 8. Carried holds (unchanged)

Core hash-pair approval and manifest re-cut; GATE-01 / Access Hub; MC-01 runtime precondition chain; D/E candidate SQL
and qualification; subscription's six buying blockers, PS-R2, PS-R3, 100-versus-50; Finance F1, refund/void/dispute,
ADP-G2/G3/G4, LENS-01, failed aggregate; Core clean-checkout aggregate, native 200 % zoom, keyboard traversal,
forced-colors; integration candidate's full aggregate (DEFERRED), exact-768 and CLS. Production (`79414143…`) untouched.
Real intake NOT READY. Never PRODUCTION READY.
