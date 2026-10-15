# KAN-31 secure-input helper parser correction and actual syntax evidence

**CONFIRMED: no gap in this delta.**

- **The correction.** The corrected helper (`human-private-staging-input-once.CORRECTED.ps1`, 15,033 B, `6a86664d…`)
  differs from the Doc 198 original (`d3e2fd97…`) **only** by joining the 23 newline-and-indent breaks that came before
  existing `-and`/`-or` continuations.
- **The parse evidence.** The actual pinned PowerShell 7 static parse shows the original with 24 errors, including
  line 45, which matches Samuel's failure report, and the corrected file with 0.
- **What this is not.** Not setup, invocation or browser authority. The changed helper needs a newly bound decision,
  approval, window and command; Doc431 is not reusable.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
hashes and my own byte comparison; no execution; no agents. Docs 202 and 203 and unchanged application and browser
source are preserved.
- **Timing.** Compared at 2026-10-15T23:43–23:41Z.
- **Jira.** Root relays.

Archive: `hl12/204_kan31_secure_input_helper_parser_correction.json`.

## 0. Reviewer correction to Doc 198

Doc 198 gave the original helper `d3e2fd97` **PASS (source only), no material defect**. That was wrong.

- **What I missed.** The file did not parse. PowerShell does not continue an expression onto a new line that begins
  with `-and`/`-or`, even inside parentheses, so 23 multi-line `SI-Require (…)` conditions were syntax errors.
- **Consequence.** The helper failed with `ParserError` at line 45 before any prompt.
- **Effect of the miss.** Nothing unsafe happened: no prompt was reached, no secret was entered and no setup ran. But the
  earliest material defect in Doc 198's scope was this operability defect, and I did not identify it.
- **What still stands.** Doc 198's semantic findings (recipients, authority binding, secret handling, window, closure
  and compatibility) are unaffected, because the correction changes no token.
- **Practice from here.** Before a PASS on a PowerShell source, I will require real static-parse evidence or do an
  explicit line-continuation reading.

## 1. The correction delta

- **Commits.** Core `b86d0178` (tree `127ad853`, parent `413dd712`) adds the corrected helper. Successor `ba237e11`
  (tree `224b1867`) adds the evidence. Both are in tc25, which is clean with long paths.
- **What I checked.** I re-derived the corrected bytes from the original:
  - Replacing every newline plus indentation that comes before `-and`/`-or` with one space yields **exactly**
    `6a86664d` (15,033 B).
  - There are exactly 23 such joins. The size drops by 94 B, and the line endings are LF in both files.
  - With all whitespace removed, the two files are **byte-identical**.

  So no guard, limit, recipient, permission, pin or path changed. All Doc 198 findings carry over unchanged.
- **Original preserved.** The original remains at its sibling path: 15,127 B, `d3e2fd97`.

## 2. Actual syntax evidence

- **Admission.** Root's Doc433 (1,219 B, records `1051e25`) admits one static-parse call only:
  - window `notBefore` 23:37:20.162Z, `latestStart` 23:41:20.162Z, `reservedUntil` 23:42:20.162Z;
  - literal `71961473`, pwsh `362a356c`, original and corrected hashes bound;
  - one attempt, no retry.
- **The literal.** `SYNTAX_ONLY_LITERAL_PROPOSED.ps1.txt` is 2,385 B and hashes to `71961473`.
  - It pins each file's bytes and hash before and after.
  - It runs only `Parser.ParseFile` twice, with no dot-sourcing or invocation.
  - It has a 30 s cooperative budget.
  - It passes only if the original has more than 0 errors and the corrected file has exactly 0.
- **The actual run.** Native `ec2e50`, requested 23:38:02.549Z and returned 23:38:03.028Z: inside the window, wall
  0.28 s, exit 0, one attempt, no stops.
  - The raw output is one JSON line: the original has 24 errors, the first being `MissingEndParenthesisInExpression`
    at line 45, column 85, which matches Samuel's report.
  - The corrected file has 0 errors, and `passed` is true.
- **Limits, disclosed.** Static parse only, which proves syntax, not runtime behavior. The outer channel was combined,
  there was no independent process census, and the budget is cooperative.

## 3. Remaining conditions

1. **New decision.** A new decision record whose `snippetPin` is the corrected path and `6a86664d`. The helper requires
   that its own path, normalized, equals `snippetPin.path`, and that the hash matches.
2. **Superseded records.** The Doc431 decision, grant and command, which were bound to `d3e2fd97`, are withdrawn and are
   not to be reused.
3. **Concrete authority.** Samuel's newly bound, concrete approval for setup and invocation, a fresh window, a fresh
   2,048 MiB G0, and a new exact command.
4. **Separately controlled.** The full staging scope and the deferred populated Doc399 query.
5. **Afterwards.** My final-result review.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | secure-input helper parser correction (Core b86d0178 / tree 127ad853; evidence ba237e11 / tree 224b1867; Doc433) | reviewer 6abf1edf | CONFIRMED, no gap in delta: corrected 15033 B 6a86664d = original d3e2fd97 with exactly 23 newline+indent-before -and/-or joins (re-derived byte-exact; whitespace-stripped identical), so no guard/limit/recipient/permission changed; actual pinned PS7 static parse ec2e50 in Doc433 window, exit 0: original 24 errors (first line 45 col 85, matches Samuel's report), corrected 0, pre/post pins. REVIEWER CORRECTION: Doc 198 PASS missed that the original did not parse (operability defect); its semantic findings stand | needs new decision with snippetPin = corrected path/6a86664d, Samuel's new concrete setup/invoker approval, fresh window, fresh 2048 G0, new exact command; Doc431 not reusable; staging scope and Doc399 separate | doc 204.`

Not execution, setup, invocation, approval, push, deployment or production consent; not human approval.
