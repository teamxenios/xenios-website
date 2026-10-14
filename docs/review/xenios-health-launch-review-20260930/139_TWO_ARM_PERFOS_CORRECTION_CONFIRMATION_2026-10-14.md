# Two-arm PerfOS diagnostic corrections, narrow byte confirmation

**CONFIRMED. Both Doc 138 corrections are made exactly, and nothing else of substance changed.** The diagnostic
source at Core `0bc62fe7` (tree `d4d43d1b`, parent `3121696e`) is now source-compatible with the limits it records.
It is not runtime-proven and grants no execution.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
parsed, run or queried. Core blobs bound directly; Root had not registered the commit when I checked. Archive:
`hl12/139_two_arm_perfos_correction_confirmation.json`.

## What changed against `3121696e`

| File | Bytes | SHA-256 | Change |
|---|---|---|---|
| `collect-two-arm-perfos.ps1` | 15,798 | `d8e990cb…` | line 92 now checks `'ordinary\|rebuilt'`; line 100 loops `@('ordinary','rebuilt')` |
| `query-perfos-arm.ps1` | 5,023 | `c4dbfc0b…` | line 66 now sets `status='QUERY_FAILED'`, `failure=$null`, exit 0 for a non-CIM query exception |
| `ACTION_CONTRACT.json` | 14,970 | `e4b53989…` | arm order, admission arms and source pins updated; text adjusted to match |

- **Scripts.** No other line in either script differs. Each arm's environment definition is unchanged.
- **Contract.** It now lists `ordinary` as arm 1 and `rebuilt` as arm 2, in both `arms` and
  `futureAdmission.arms`. Its source pins equal the two scripts' actual sizes and hashes. Bounds, the quote-free
  native command and native options are unchanged.
- **Contract text.** The timing note now says rebuilt starts after ordinary. The failure-output note matches the
  new child behaviour: CIM fields are filled only for CIM exceptions, and a row-cap overflow stays incomplete. The
  interpretation table reflects ordinary-first, and the contract records the three fidelity limits from Doc 138
  plus the remaining order and transient caveat. Its source base is now `3121696e`, and a `doc138Correction` block
  records the review.

## Remaining

1. Root's admission:
   - the ticket at `TWO_ARM_PERFOS_DIAGNOSTIC_ADMISSION_20261014.json`, binding the new contract hash and arms
     `ordinary, rebuilt`;
   - the three authority references, citing Docs 138 and 139 for the source disposition;
   - exclusive reservation, a window of at most 20 minutes, and an absent output directory;
   - the fully substituted quote-free native command with the real prelaunch timestamp.
2. After a run: the two arm records, the pair summary and the native result, judged against the Doc 138 table.
   Any outcome is a diagnostic reading, not a cause proof, a G0 result or counter credit.

Not execution consent.
