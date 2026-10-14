# R7 post-application confirmation

**CONFIRMED.** Core `1911873d` applies exactly the 13 files Doc 154 accepted, byte for byte, under Samuel's actual
13-path grant, and nothing else.

The separate caller postcheck ran as Doc 155 confirmed. Its complete zero-row result supports Root's release of the
R6 operational reservation, and only that reservation.

This is source identity and an operational closure only. It is not counter, browser or release qualification.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only Git blobs,
hashes and records. No query, no run, no agents. Archive: `hl12/156_r7_post_application_confirmation.json`.

## 1. Application

- **Commits.** Applied source `1911873d` (tree `d105aa72`, parent `0409f5c1`). The receipt commit `cd5d775f` (tree
  `9a47ba8a`) adds only `DOC163_R7_CANONICAL_APPLICATION_RECEIPT_20261014.json`, 33,259 B `c9c769f4…`.
- **Exactly 13 paths.** The application makes exactly 13 modifications. They are the 12 R6 paths plus
  `verify-proving-closure.ps1`.
- **Bytes.** Each applied blob is the same Git blob as its R7 `PROPOSED` file at `2ce4992e`, which Doc 154 accepted.
  Each before-state equals the canonical bytes at `240de0df`. Core's worktree bytes equal the blobs.
- **Nothing else changed.** The parent `0409f5c1` added only its postcheck archive. The seven preserved inputs are
  the same blobs at `240de0df` and `1911873d`. The application `8e85daa` (tree `25507c2f`) is untouched.
- **Receipt.** It agrees with every size, hash and blob above, cites Doc 154 at `eccf535`, and records every
  qualification as NOT_RUN.

## 2. Human grant

- **Approval.** Root's approval record is 29,600 B `7cf88c72…`. Its status is approved, with the answer "Approve this
  exact 13-path source exception".
- **Decision.** Root's decision record is 36,673 B `730776a1…`. Its payload identity `754dd394…` recomputes exactly.
  Its 13 targets name these exact before-states and after-images.
- **Scope.** The grant covers local source only. It gives no runtime consent.

## 3. Caller postcheck, checked against the Doc 153 and Doc 155 rule

- **What ran.** The archived binding is byte-identical to the successor `b2660a02…` that Doc 155 confirmed. The
  executed command hashes to the confirmed `c23d2e31…`.
- **When.** It was submitted at 18:19:40.354Z, before the 18:24:27Z last start, and returned exit 0 with no session
  and the token `R6_CALLER_OBSERVATION_WRITTEN`.
- **Result.** One complete query, zero rows, in 305.13 ms, with no error, retry or stop.
- **Meaning.** Under the rule, that closes the caller `46104`. Root's release of only the R6 operational reservation
  is consistent with it.
- **What it does not change.** It says nothing about global absence. R6 stays FAILED, with 0 of 25 cases, the invalid
  caller exit record and the missing EOF.

## 4. Applicable limits for the next counter run, from the applied source

| Layer | Limits |
|---|---|
| Gate | Initialization under 5,000 ms with no API call, then OS under 1,000 ms, then native read with validation under 2,000 ms; all inside a 30 s process-age fence; three 512 MiB floors |
| Supervisor | 32 cases; work 90,000, finalization 10,000, aggregate 120,000 ms; child 5,000 ms and 16,384 B |
| Caller | 180,000; observer 135,000; CMD 125,000; discovery 5,000; closure 10,000; preflight 10,000 ms |
| Executor | Outer 210,000; capture 185,000 ms |
| Attempts | One attempt, no retry, no stop |

The observer gate, the caller's capture and the independent closure stay mandatory.

On source, the R7 counter group stays in the section 6 local-synthetic class compared in Doc 150. The 7 added
cases are stubs or arithmetic, with no network, provider, customer or production action. The actual window and
ticket comparison confirms that mapping for a real run.

## 5. Carried forward

- Any non-finite or negative case-child lifetime fails when I review evidence.
- Real timing fit is unproven for every runner.
- The four classifiers are arithmetic, not measured timings.
- Floors and outer limits are unchanged.

## 6. Exact remaining prerequisite

Root freezes a fresh counter window and a ticket at the fixed path. The ticket must carry the R7 fields
`initBudgetMs` 5,000, `osBudgetMs` 1,000 and `readBudgetMs` 2,000. It must also carry:

- outputs under `ql-doc154-r7-synthetic-proving-20261014`;
- the manifest's seven counter pins;
- the manifest `c389a415…`, the addendum, the caller `7e65bdca…`, the executor `28e5cf85…` and `cmd.exe` as bound
  inputs;
- the Doc 137 native command.

Then:
1. I compare that actual window and ticket;
2. Core acknowledges freshly;
3. Root admits;
4. Core gives final readiness;
5. one call is made.

Core's newer checkpoint `eeb5c17c` adds counter-input metadata that I have not reviewed. I will compare it when the
ticket is delivered.

Not execution consent, not human approval and not test credit.
