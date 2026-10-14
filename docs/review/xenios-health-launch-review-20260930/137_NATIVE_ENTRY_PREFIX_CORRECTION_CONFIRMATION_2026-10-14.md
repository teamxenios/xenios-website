# Native telemetry entry, corrected prefix confirmation

**CONFIRMED. The corrected record meets Doc 136's required correction exactly.** Root's
`DOC136_NATIVE_POWERSHELL_TELEMETRY_ENTRY_R2_UNAPPLIED_20261014.json` (5,004 B, `4a8692af…`), committed at board
`72e7cea1`, has the prefix:

```text
set POWERSHELL_TELEMETRY_OPTOUT=1&& 
```

The prefix is 36 bytes and its stated hash `063b76d4…` matches. There are no quotes, and nothing sits between `1`
and `&&`. The quoted record `ee19acc1…` stays historical and rejected. It was never invoked.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing run
or probed. Archive: `hl12/137_native_entry_prefix_correction_confirmation.json`.

## What I checked

- The working copy equals the committed blob at `72e7cea1`.
- The command template contains no double quotes anywhere, no `1 &&`, exactly one `&&`, and no other CMD
  metacharacters outside the placeholders.
- Everything after the prefix is byte-identical to the rejected record: the pinned pwsh path, `-NoProfile -File`,
  the canonical executor path, `-ProvingGroup` and `-AdmissionSha256`.
- The native options (CMD shell, no login, work directory, yield and output limits) and all bounds are unchanged.
- The source binding names the final candidate `cc7b6756` (tree `e9390248`) and Doc 136, which confirmed supervisor
  `63caac95`, manifest `8cb217eb`, caller `af0c4241` and executor `9044e615`.
- No optional guard, helper, source edit, environment query or global setting was added.

## Limits that stay

- Startup and exit behaviour of the corrected command is untested.
- The operator's other inherited environment entries are unknown and uninspected.
- The opt-out shows intent, not proof that no outbound traffic occurs.
- The angle-bracket placeholders are redirection characters. Only a fully substituted command, frozen in the
  external admission, may ever run.
- After a run, the absence of `telemetry.uuid` in the three r4 private homes is the available evidence for the
  child processes, as Doc 136 noted. The executor's own cache is not covered.

## Remaining

1. Root's source and manifest permission to apply. After applying, a hash confirmation of the four canonical files.
2. The Doc 134 G0 question, still open. Root says the PerfOS comparison's native command will carry this same
   corrected prefix; I will check that when it is registered.
3. A fresh counter admission with the four identities, this exact prefix, the substituted command, exclusive
   reservation, finite window, real 512 MiB admission, and absent r4 outputs.

Not execution consent, not an application, not G0 or counter credit.
