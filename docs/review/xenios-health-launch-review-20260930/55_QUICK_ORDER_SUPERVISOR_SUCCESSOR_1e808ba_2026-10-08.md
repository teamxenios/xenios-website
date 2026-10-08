# Quick Order qualification supervisor successor `1e808ba` / `8e462da`: bounded delta review against doc 52

**SOURCE: REVISION REQUIRED.** The successor is a large and mostly sound correction. It corrects in source SV-2, SV-4,
SV-5 and most of the P2 list, binds approval to records as doc 52 section 6.1 asked, and adds the 512 MiB subject-job
limit beside the unchanged 1,536 MiB host floor. Its holds are honest and enforced before anything is consumed.

But three blocking defects would stop every group from ever being accepted:
- a new environment allowlist refuses all nine Vitest commands;
- five expected names store escape sequences where Vitest renders real line breaks;
- a missed admission still consumes the group after its first command, the residue of SV-6.

Even with these fixed, the manifest's own holds keep every group, G0 included, from running. So the source supports no
execution proposal yet. Everything is NOT RUN; the window is expired; this review authorises no execution,
reservation, observation or window.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`DOC52-SUPERVISOR-REPAIR-DELTA-20261008` r1, acknowledged at `4a028dc`).

Method:
- four read-only lenses, each with an adversarial verifier: names, inventories and reporting; commands, admission and
  receipts; approval, memory and the Job Object; integrity, records and closure;
- a completeness check against every doc 52 item;
- my own read of the approval code and my own confirmation of all three blocking defects against the source and the
  pinned Vitest 4.1.10 runner.

Every verifier upheld every lens finding. The subject was never executed, imported or compiled. Lens output archived as
`hl12/55_supervisor_successor_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `1e808bab28fac90437de93628a15a7fb0322d53e`, tree `0fd769d844228c7b9a9352935b25c214cb572493` ("fix(quick-order): bind qualification evidence and execution authority", 2026-10-08 11:52:18 -0500), parent `5a49ef0` |
| Delta | exactly `qualification-supervisor.mjs` (718 to 1,340 lines, sha256 `9f67ce94…`, no CR bytes) and `evidence/qualification-manifest-20261008.json` (1,826 to 31,704 lines, sha256 `367f740f…`); nothing else changed, including the currentness and decision-input files and the `e90d464` receipt |
| Records | `8e462da35b4319dc6d0c53b0d7b431d0b2c6f562`, records-only: packet, closure map, bindings, records and source JSON; the builder checkout is clean |
| Recomputed | both hashes; 820 assertions in 813 file and name rows across G2 to G5; 21 predicted failures; G1's 40 TAP and 46 containment cases; 30 target pins and HTTP snapshots equal to `90f4ebd`; all 17 dependency pins (Vitest, runner and utils 4.1.10; Vite 7.3.5) |
| Not recomputable | the dependency-tree totals (37,928 files, 346,897,984 bytes) and their digest; no row inventory is retained (CR-28) |

## 2. What is corrected in source (inspected, NOT RUN)

| Doc 52 item | State |
| --- | --- |
| SV-1 rendered names | **Partial.** All 21 predicted failures and every sampled row (over 250) render byte-equal, with quoting, 37-character truncation and U+2026. Five rows are wrong (CR-02) |
| SV-2 duplicate titles | **Closed.** Exact file and name multisets; a missing or extra instance refuses |
| SV-3 skips, todo, hooks, totals | **Partial.** Reporter totals reconciled; todo refuses; skips must match; file, hook, unhandled and import errors refuse. The route cannot complete while CR-01 stands |
| SV-4 tsx | **Closed.** |
| SV-5 production build | **Closed.** |
| SV-6 admission | **Partial (CR-03).** |
| P2: Path/PATH case, execution policy, Job memory, run lock, authority with `--prepare`, sticky drain, G7 order | **Closed in source**, with the P3 precision items below |
| P2: Git pinning, input drift | **Partial (CR-04, CR-18).** |
| P2: Add-Type warnings | **Partial.** The pragma scope is correct, but the compile proof falls inside a consumed G0 |
| P2: G0 TAP fixture, bootstrap step, bootstrap process limit | **Holds, honest and enforced.** The TAP item is labelled corrected but is a hold (CR-08) |
| Section 6.1 approval binding | **Closed in source.** The decision text must literally contain the manifest hash, source commit and tree, supervisor hash, each group id, start and end. Raw decision and window digests are bound into every receipt. Later groups need a committed reviewer record bound to the real G0 receipt, not five booleans, and G0 itself is not circular |
| Section 6.2 memory | **Partial.** The subject Job sets the 512 MiB committed-memory limit, reads it back before resume and queries the peak; the 1,536 MiB host floor is unchanged and distinct. No G0 case exercises the cap, and a limit hit is detected only through a notification that Windows does not guarantee (CR-25) |

No cap was raised. The process ceilings, the G0 one-minute wall and the G7 shared wall stay as doc 52 found them, with
the departures held, not granted. Nothing runs at import, and there is no shell, network, deletion or PID-kill path.

## 3. Blocking defects (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| CR-01 | The new environment allowlist (`supervisor:989-990`) refuses any command key except `NODE_ENV` and `NODE_OPTIONS`. All nine Vitest commands declare `XENIOS_QO_SUITE_REPORT` (manifest lines 2045, 2916, 4578, 5170, 8227, 16667, 16833, 17451 and 18081), so each throws before launch. G0 is consumed by its in-process self-tests and then refused at its Vitest baseline, so G0 can never be accepted and no later group can start. The P2-02 correction introduced it; the key is redundant, because `supervisor:993` sets it. | Remove the key from the nine command environments, or allow exactly that key with its literal value. Add a G0 in-process check that every manifest command environment passes the rule. Re-hash. |
| CR-02 | Five G3 notification names store a backslash followed by `n` or `r`. The tests pass real line breaks through `%s` (`quick-order-notifications.test.ts:241-250` at `f581b6b`), and Vitest 4.1.10 inserts `%s` strings unchanged (`@vitest/utils` `display.js`, `case "%s"`). G3 is therefore refused even when it fails exactly as predicted, which blocks G6 and G7. | Encode those names so that they decode to U+000A and U+000D, in both the group rows and the static inventories, and record the rendering rule. Re-hash. |
| CR-03 | G0's in-process fixtures consume the group (`supervisor:1163-1185`) before any child's admission handshake. After that, a missed, stale or mismatched admission, or a real resource refusal, leaves the group consumed and partial: the request at `supervisor:1186` throws, and the non-consuming branch at `supervisor:1206-1216` applies only before any command has run, ending in `HELD_PARTIAL_GROUP_NO_AUTOMATIC_REPEAT` (`supervisor:1240`). The same holds for G1 commands 2 to 4, G4 commands 2 and 3, and G7 commands 2 to 6. This is the case doc 52 SV-6 named, and it contradicts `resourceRefusalConsumesGroup: false` and doc 49 Q-3. | Keep per-command admission. Make the in-process fixtures non-consuming or run them after the first child handshake. On a later miss, write a non-consuming paused receipt and resume at the next unexecuted command, never repeating one; otherwise qualify the manifest rule and Q-3 explicitly for approval. Re-hash. |

## 4. Other findings (verified)

**P2, fix before any execution decision:**
- **CR-04.** Input attestation trusts the snapshot's own `.git`, which the subject can write. There is no
  `GIT_NO_REPLACE_OBJECTS`, so a planted replacement tree hides tracked drift. Repository filters run during
  `git status` outside the Job after every child. Read the tracked inventory from the source repository or from the
  inventory frozen at preparation, and drop the uncompared status call.
- **CR-05.** The Vitest failure-stack format that red-cause matching relies on is never observed before G1's single
  mandatory attempt. Add a bounded G0 fixture with one intended failure, or hold the affected groups.
- **CR-06.** Full-input inventories run at every command boundary and are charged to group walls with no slack in G1 to
  G6. Nothing checks the remaining time before consuming. Inventory once per group, refuse without consuming when the
  remaining time is below the next ceiling, and add a G1 to G6 wall-fit hold.
- **CR-07.** The approval timing forces the window commit, the coordinator verification, the policy observation and my
  window comparison inside the window and its 140-minute aggregate. The coordinator's operational path expects me to
  compare a proposed committed window before any run. Allow decision, verification and review to precede the window
  start, or document and budget the rule.

**P3, precision:**
- **Holds without a lift route (CR-08).** Holds lack a defined lift route, and P2-07 is labelled corrected although it
  is a hold.
- **Red cause and case identity (CR-09, CR-12).** Red cause matching works at assertion level only, and cause fields
  the supervisor never reads remain in the manifest. Case identity uses the space-joined full name only.
- **Self-test coverage (CR-10).** Missing parser negatives, an unreconciled supplemental assertion tree, and no G0 case
  that observes `it.each` rendering.
- **Hold check ordering (CR-11).** Command-level holds are checked only after earlier commands may have consumed the
  group.
- **Handshake reads (CR-13).** The handshake treats a partly written response as final.
- **Receipts and dispositions (CR-14, CR-15).** Receipts omit several raw digests. An unused verdict disposition is
  whitelisted.
- **Timing and approval scope (CR-16, CR-17).** The G0 wall starts after control hashing. The approval scope omits the
  G5 `0.0.0.0` listener disclosure.
- **Git binary pin (CR-18).** Only the Git launcher is hash-pinned, not the binary that reads the repository.
- **Run lock (CR-19).** The run lock is kept after any consumed failure, ending the run.
- **Admission records (CR-20).** Floors are compared without type checks or an observation authority reference.
- **CLI invocation (CR-21).** Case-variant or 8.3 invocation exits silently instead of refusing.
- **Committed records and prepare (CR-22, CR-23).** A committed record may be any tree-ish in the shared object store.
  `--prepare` accepts a window that execution must refuse.
- **Decision literals (CR-24).** The decision text need not name the run id, attempt budget or preparation.
- **Memory-limit detection (CR-25).** A memory-limit hit relies on an unguaranteed notification, and no G0 case
  exercises the cap.
- **Reviewer record templates (CR-26).** The reviewer record templates lack key-order, timing and byte rules, and the
  preparation entry point omits `--window-review`.
- **Execution policy (CR-27).** The execution-policy check is a deny-list that admits AllSigned.
- **Dependency inventory (CR-28).** The dependency-tree totals cannot be recomputed from retained evidence.
- **Currentness pin (CR-29).** The database category still pins the `f581b6b` currentness receipt as pending, while
  doc 53 has since accepted `e90d464`.
- **Protection anchor and date (CR-30).** The protection cause cites a blank line, and `authoredAt` is unchanged.
- **Closure map wording (CR-31).** Several closure-map rows overstate the source.

## 5. Execution path: none supportable yet

Even if the three P1s and four P2s were fixed, the manifest's prerequisites refuse every group before any lock:
- **Every group:** bootstrap-interruption proof, and an exact inherited-handle allowlist.
- **G0:** the three-process contract, and the one-minute all-work fit.
- **G1:** its TAP calibration.
- **G7:** its shared-wall allocation.

Only preparation would pass the stage check, and it produces no qualification evidence. I do not recommend proposing
it alone.

When the source is accepted, the first proposal would be preparation plus G0 only. It would need all of the following:
- **Your verbatim decision**, naming the manifest hash, `f581b6b` and its tree, the supervisor hash, G0, preparation,
  the run id, the window start and end, the process caps, the one-minute wall or an approved change, the 512 MiB
  committed and 1,536 MiB available measures, and `Add-Type`.
- **Coordinator records:** the coordinator's committed window and verification, the effective-policy observation, a
  separately authorised pre-window observation, a reservation and an admission.
- **My two committed records:** this reviewer's source disposition naming the eligible modes, and my window comparison.

G1 and later stay held until I commit an acceptance of the actual G0 receipt.

## 6. Disposition

- Subject: `1e808bab28fac90437de93628a15a7fb0322d53e` (tree `0fd769d8…`), records `8e462da`.
- **SOURCE: REVISION REQUIRED** on CR-01 to CR-03. The records pass, with the CR-28 and CR-31 limits. No P0.
- **What does not change:**
  - Doc 52's findings are superseded only where section 2 marks them closed.
  - Doc 53 stands; the decision-input source is accepted with limits.
  - The expired window stays expired. Automation stays paused.
- **Smallest next action for the same builder:** one successor on the same two files plus refreshed records.
  - Fix CR-01 to CR-07.
  - Define a lift route for each hold, naming the bounded G0 case or separately approved action and the review that
    lifts it. For the handle hold, either add the exact handle list or keep the hold.
  - Fold in the P3 items it touches, and re-pin the currentness category to `e90d464` (CR-29).
  - Then return the exact successor here.

  The builder holds the lease, and the work is inside the existing qualification-preparation assignment.
