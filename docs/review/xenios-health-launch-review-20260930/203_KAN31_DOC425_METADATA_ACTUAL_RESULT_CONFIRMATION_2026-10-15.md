# KAN-31 Doc425 actual metadata preparation: result and usability confirmation

**CONFIRMED: no material gap.**

- **The run.** The actual metadata preparation ran once, within Doc425's authority and window, and produced the
  inventory with exit 0.
- **The inventory.** `INPUT_PINS_PREPARED.json`, 11,533,052 B, `5f55d4c1…`, passes every acceptance check the frozen
  launcher (`94a02e3f`) applies to it. It is usable in the existing browser-binding procedure once a grant pins it.
- **What this is not.** Metadata only: no browser, application, TLS, provider, SQL, setup or staging credit, and no
  2,048 MiB admission.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
file hashes, and JSON parsing of the produced files with my own reader; no new query or execution; no agents. Doc 202
and accepted source are not reopened.
- **Timing.** Compared at 2026-10-15T22:58–22:59Z.
- **Jira.** Root relays.

Archive: `hl12/203_kan31_doc425_metadata_actual_result_confirmation.json`.

## 1. Identity and authority

- **Core commits.** Core `ba1493b4` (tree `ce2e8399`) over `e105902d` adds:
  - `a88c926f`, the source-only literal bindings;
  - `323d8319`, the namespace allocation record;
  - `ba1493b4`, the receipt `EXECUTED_NATIVE_AND_POSTCHECK_RECEIPTS.json`, 5,691 B, `8023be6d…`.

  The tc25 worktree is clean with long paths.
- **Root records.** All three are committed in records `05613ba`:
  - ticket: 5,591 B, `6ee93ddc…`;
  - final dispatch: 1,251 B, `b61c2039…`, which binds the ticket and capture hashes;
  - Doc426: 1,721 B, `a2929855…`.
- **Authority.** The authority is existing ordinary test-preparation consent (Doc223/239, reconciled Doc407) under the
  Doc285 metadata-only procedure. Core's fresh FINAL READY came at 22:45:14Z, and the resource owner acknowledged the
  quiet slot 22:44:26.381–23:24:26.381Z (turn `01a141bd…`).
- **Helper correction.** It touched only a read-only comparison helper: it now reads timestamps with `DateKind String`.
  The frozen capture (`b966c594`) and the ticket are unchanged, and no invocation was consumed. That correction is not
  material.

## 2. Actual run against the ticket

- **Window.**
  - Native run 22:46:09.203–22:55:31.994Z: after the start, before the last start of 23:08:56.381Z, and ending before
    the stop at 23:24:26.381Z.
  - Wall time 562,793 ms, under the 930,000 ms envelope.
  - Exit 0, one attempt, no stops.
- **Transport.** 19 chunks: the 18 polls carry managed session `69187`, and the final chunk is the completion response
  with `exit_code 0`. No interleaving is recorded.
- **Capture file.** `metadata-native-capture.json` (568 B) shows stdout 277,290 B with hash `e751cd7d…` and stderr 0 B.
  I re-hashed the actual stdout and stderr files, and they match.
- **Stdout content.**
  - 121 JSONL records: 1 START, 9 STAGE, 109 PROGRESS, 1 COMPLETE and a final summary line.
  - The COMPLETE record shows:
    - git 7/7, tracked 4,893, excluded tests 984;
    - 3,909 source files and 37,927 dependency files, completed;
    - 0 failures.
  - The COMPLETE hash `5f55d4c1…` and its 11,533,052 output bytes equal the actual inventory file.
- **Postcheck** `d74208`: exit 0, `METADATA_PREPARATION_QUALIFIED_NOT_EXECUTION_ADMISSION`; source7, canonical and
  records unchanged; the 7 selected pins and 14 mappings match; `independentProcessCensus false`.

## 3. Usable under the existing browser binding

I applied the frozen launcher's own checks (launcher lines 148–161) to the actual inventory:

- **Identity fields.** The schema is `ql_durable_browser_input_pins_prepared_v1`, with status
  `PREPARED_NOT_EXECUTION_ADMISSION`.
  - The candidate and tree are `e33c12a9`/`ab4415f0`, and `sourceRoot` equals the launcher's `ROOT` (source7).
  - Node is `v20.19.0`.
  - `pre` and `post` are identical, with the e33 commit and tree and an empty status.
  - `applicationImported`, `engineStarted` and `executionApproved` are all false.
- **Pin placement.** All 3,909 source pins are inside `ROOT` and outside `node_modules`. All 37,927 dependency pins are
  inside `ROOT/node_modules`. No path is duplicated, and every pin has a path, byte count and a 64-character hash.
- **Bytes.** The pin bytes sum to 530,997,210, which equals `bytes` and is under 536,870,912.

The launcher reads the inventory only through the grant's `inputMetadataPin`, so this file is usable only when an actual
grant pins exactly 11,533,052 B and `5f55d4c1…`. The launcher then re-hashes every pinned file at run time and refuses
on any drift.

## 4. Limits and conditions (not material)

- **Combined output.** Outer output is combined; the native files are separate.
- **No independent closure.** There was no independent process census. A terminal exit 0 is not a global family closure.
- **Cooperative limits.** The producer and capture limits are cooperative, not a hard wall.
- **Test exclusion.** It rests on Doc285's static-import claim, not on proof about runtime filesystem reads.
- **Custody until the browser run:**
  - the inventory exists only in private scratch, so its bytes must stay pinned there;
  - source7 must remain unchanged and exclusive, otherwise the launcher refuses;
  - engine and served-dist pins remain separate.
- **Namespace.** `997a4d89…` is `DESIGNATED_NOT_CONFIGURED`; nothing about setup or staging follows from it.
- **Still required:**
  - the 2,048 MiB browser admission;
  - secure setup and invoker authority;
  - the exact staging effects;
  - populated Doc399 authority;
  - a browser grant carrying this `inputMetadataPin`;
  - my final-result review.
- **Not live.** NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Doc425 actual metadata (Core ba1493b4 / tree ce2e8399; receipt 8023be6d; ticket 6ee93ddc, dispatch b61c2039, Doc426 a2929855) | reviewer 6abf1edf | CONFIRMED, no material gap: one native run 22:46:09.203-22:55:31.994Z in window (562.8 s < 930 s), exit 0, session 69187 polls, stdout 277290 B e751cd7d / stderr 0 re-hashed; 121 JSONL, 1 COMPLETE 0 failures, git 7/7; inventory 11533052 B 5f55d4c1 = COMPLETE hash; postcheck d74208 exit 0. Inventory passes frozen launcher 94a02e3f acceptance (schema/status, e33/ab4415, sourceRoot = source7, node v20.19.0, pre=post clean, all flags false, 3909 source pins in root not node_modules, 37927 dependency pins in node_modules, no duplicates, bytes 530997210 = sum < 512 MiB) -> usable once a grant pins it; launcher re-hashes at run. Helper DateKind correction not material | limits: combined outer channel, no census/family closure, cooperative limits, test exclusion via static scan, private-scratch custody | browser 2048, setup/invoker, staging effects, Doc399 still held | doc 203.`

Not execution, admission, approval, push, deployment or production consent; not human approval.
