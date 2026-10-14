# R4 private output paths and native telemetry entry, narrow confirmation

**Output paths: CONFIRMED. Native entry: compatible in intent, with one required correction. Remove the quotes.**

- **Output paths.** Core revision `cc7b6756` (tree `e9390248`, parent `149f9fd7`) changes only the private output
  paths from `-cmd-r3` to `-cmd-r4`, the scheme prior-receipt path, and the executor's caller pin. Each proposed
  file is byte-exact against its Doc 135 version.
- **Native entry.** Root's proposal (`ee19acc1…` at `6037035d`) prefixes the executor launch with
  `set "POWERSHELL_TELEMETRY_OPTOUT=1" && `. The R1 record shows the native transport rewrites every double quote
  into a backslash-quote before CMD sees it. CMD would then set a variable with a different name and run pwsh
  without the opt-out, with no error. The quote-free form `set POWERSHELL_TELEMETRY_OPTOUT=1&& ` avoids that. Its
  value is exactly `1`, which is the only single-character value PowerShell accepts.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
applied, parsed or run. Archive: `hl12/136_r4_output_paths_and_native_entry.json`.

## 1. Output paths at `cc7b6756`

- **Bytes.** All nine files in Root's `DOC135_R4_OUTPUT_UNAPPLIED_FROZEN_20261014/` mirror are byte-identical to
  Core. The commit adds that namespace plus the three continuity files.
- **Caller.** Rebuilt from Doc 135's `1ae35909…` with two edits: `$lOutput` becomes `caller-<group>-cmd-r4`, and the
  scheme prior receipt becomes `caller-counter-cmd-r4/caller-receipt.json`. The result is byte-identical to the
  proposed file, 25,487 B, `af0c4241…`. No `cmd-r3` remains.
- **Executor.** Rebuilt from Doc 135's `c80cb8c3…` with two edits: the caller hash becomes `af0c4241…`, and both
  private roots become `-cmd-r4`. The result is byte-identical to the proposed file, 17,208 B, `9044e615…`. The
  25,487 B caller pin is still correct, and no `cmd-r3` remains.
- **Unchanged.** The supervisor `63caac95…` and manifest `8cb217eb…` are byte-identical to Doc 135. The caller still
  pins that manifest. The opt-out key is still present once in each table. The supervisor's `attempt-<group>-r1`
  output is unchanged, and it was never created by R3.

## 2. Bindings carried to the final identities

The final identities are supervisor `63caac95`, manifest `8cb217eb`, caller `af0c4241` and executor `9044e615`.

- **Observer gate.** The Doc 128 addendum `d201070f` (`44413e31…`) applies unchanged to these four identities, as
  Doc 135 bound for the `149f` set. Output paths do not touch the gate logic. Its historical source fields stay
  historical.
- **Requirements and historical fields.** The `82fe41df` requirements and handoff stay historical records, and
  their pins and `-cmd-r3` paths do not apply.
  - The next ticket carries: caller `af0c4241` at 25,487 B, executor `9044e615` at 17,208 B, outputs
    `caller-<group>-cmd-r4` and `executor-<group>-cmd-r4`, manifest `8cb217eb`, addendum `44413e31`, and the scheme
    prior receipt at the r4 path.
  - The fixed fields the code itself checks keep their predecessor values: `doc128 8af08bc…` in the caller and
    `doc129 cab6120…` in the executor. The new dispositions go in `callerSourceDispositionRef` and
    `executorComparisonRef`: Docs 130, 132, 135 and 136 at their commits.
  - All bounds, invocation arrays, guards and the one-attempt, zero-retry, zero-stop policy are unchanged.
- **Ordering.** The scheme group still needs an actual owner-accepted r4 counter receipt first.

## 3. Native entry

- **Purpose.** It is the only way to opt out the executor process itself, which the native transport starts with
  the operator's environment. The scope is right: this invocation and its descendants only, with no `setx`, no
  global setting, no helper and no extra CMD. Everything else in the command stays literal.
- **Required correction.** In R1, the submitted command began with a plain `"`. CMD's own error text shows it
  received `\"C:/…/pwsh.exe\"` instead, two backslash-quote pairs. With the proposed prefix, CMD would receive
  `set \"POWERSHELL_TELEMETRY_OPTOUT=1\"`. That defines a variable named `\"POWERSHELL_TELEMETRY_OPTOUT` with value
  `1\"`. The assignment succeeds, so `&&` launches pwsh, but without the opt-out. Use:

```text
set POWERSHELL_TELEMETRY_OPTOUT=1&& C:/Users/sboad/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe -NoProfile -File C:/xenios-wt/tc25-app-manifest-20261012/docs/health-launch/ql-build-20261012/doc104-baseline-reconciliation-20261013/sequential-synthetic-cmd-binding-successor-proposal/capture-proving-caller.ps1 -ProvingGroup <group> -AdmissionSha256 <fresh ticket hash>
```

  There must be no space between `1` and `&&`. A trailing space would make the value `1 `, which PowerShell does
  not accept, so telemetry would stay on. R2's quote-free native command passed through the transport intact.
- **Placeholders.** The template's `<…>` placeholders are CMD redirection characters. The frozen external admission
  must hold the complete substituted command, as the proposal says, and must never run the template itself.
- **How to see whether it worked.** No new probe is needed. After a run, PowerShell's `telemetry.uuid` should be
  absent under `AppData/Local/Microsoft/PowerShell/` in the three r4 private homes: `executor-<group>-cmd-r4` for
  the caller, `caller-<group>-cmd-r4` for CMD, supervisor, observer and closure, and `attempt-<group>-r1` for the
  fixtures. In R3 that file appeared in both private homes. That shows the three tables took effect. It does not
  cover the executor, whose cache is the operator's own.
- **Optional guard.** To make the executor's opt-out fail closed, the executor could refuse at start when
  `$env:POWERSHELL_TELEMETRY_OPTOUT` is not exactly `1`. Startup telemetry is decided before the script runs, so the
  guard detects a miss rather than preventing it. It would change the executor's bytes and need a re-pin and
  confirmation.

## 4. Remaining

1. Correct the native-entry prefix as above, ideally freezing the corrected text. I will confirm it against this
   disposition.
2. Root's source and manifest permission to apply. After applying, a hash confirmation that the four canonical
   files equal `63caac95`, `8cb217eb`, `af0c4241` and `9044e615`.
3. The Doc 134 G0 question remains open, and this packet does not address it. Any two-way diagnostic needs its own
   binding, with both arms opted out before process start.
4. A fresh counter admission: these identities, the corrected native command, exclusive reservation, finite window,
   real 512 MiB admission, and absent r4 outputs.

Not execution consent, not an application, not G0 or counter credit.
