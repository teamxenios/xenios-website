# KAN-31 offline15 R1 fresh ticket and 16-identity closure template: operational comparison

**MATCH: no material mismatch** between Root's actual conditional ticket, the accepted parent (`6488fba2`) and plan
(`205cbe0d`), the actual window and the 16-identity closure template.

- **What this is.** An operational comparison only. Not admission or dispatch, and not a source review.
- **Who decides.** Root's final dispatch decision is Root's.
- **Nothing executed.** I ran nothing.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: file hashes,
Git state and literal text; no agents. Docs 195 and 197–200 are not reopened.
- **Timing.** Compared at 2026-10-15T22:24–22:26Z.
- **Jira.** Root relays.

Archive: `hl12/201_kan31_offline_r1_ticket_and_16_closure_comparison.json`.

## 1. The ticket against the parent's own checks

The parent's checks are on lines 53–74 of `6488fba2`.

- **Identity.** The ticket is 3,921 B, SHA-256 `8f7736fe…e178`, matching the packet and the `-AdmissionSha256`
  argument. It sits at the parent's fixed `$qualTicketPath`, committed in records `d316f5d`, which is clean.
- **Exact fields.** Every field the parent compares matches:
  - `approved true`, mode `KAN31_OFFLINE_51962B3_R1`, one attempt, 0 retries, exclusive window, timeout stop only on a
    fresh owned handle;
  - owner `01a0e098…`, `planSha256 205cbe0d…`, `output` exactly the parent's `$qualOut`, `sourceCommit 51962b33…`.
- **Paths.** `parentPin.path` equals the `-File` path, so the line 59 normalization from Doc 197 passes. The parent pin
  is 27,053 B, `6488fba2`.
- **Window.** 22:23:44.700Z to 22:43:44.700Z on 2026-10-15: exactly 20 minutes, which is within the ≤ 20 minute limit.
  `lastStart` 22:37:59.700Z is exactly end − 345,000 ms, as line 61 requires. All three timestamps use the strict
  3-fraction format.
- **Source state.**
  - The tc25 HEAD and tree are `98ce20e1`/`3cf2137a`, matching `recordsHead` and `recordsTree`.
  - `git -c core.longpaths=true status --porcelain=v2 --untracked-files=all`, which the parent itself uses, is empty.
  - All 19 plan inputs currently match their bytes and hashes, and the plan has exactly 15 cases.
- **Fresh output.** The output directory does not exist yet, as required.
- **Attestation.** `resourceOwnerExclusiveAttestation` is present: fresh turn `01a141a7…`, parent 300 s plus closure
  45 s.
- **Authority.**
  - The human message `01a1419b-4b12` covers the offline checks under existing controls. I rely on Samuel and Root's
    reading.
  - Doc 200's consumed scope is not reused.
- **Extra fields.** The parent tolerates the ticket's extra fields (`closure`, `limits`, `prerequisites`), because it
  does no exact-key check.

## 2. The 16-identity closure template: 5,165 B, `802baa69…`

- **Placeholders.** Exactly three: the compact 16-entry JSON, the SHA-256 of its exact UTF-8, and the 3-fraction stop.
  - The template recomputes the SHA-256 and refuses on a mismatch.
  - The stop must be the new window end, `2026-10-15T22:43:44.700Z`.
- **Compatible with what the parent records.** The template gets exactly what the parent's receipt contains:
  - `parentPid=$PID` and `parentCreationUtc` (line 264);
  - each row's `pid` and `creationUtc` from the owned handle (lines 279 and 282);
  - executables from the plan's `command[0]`, which is the pinned pwsh path or the node path for every case.
- **Formats.** `ToUniversalTime().ToString('o')` produces the 7-fraction `…Z` form the template requires. The
  executables match its two-entry allow-list after lowercase and slash normalization.
- **Shape checks.** It requires exactly 16 objects, each with exactly the keys `creationUtc`, `executable` and `pid`. A
  PID must be a positive integer within `int`. Duplicate PID and creation pairs are refused, and PID reuse across
  different creations is allowed.
- **Queries and timing.** One query over the unique PIDs, run twice, each with a 1 s timeout and checked under 1 s,
  500 ms apart. Process age plus elapsed time must stay under 10 s, and it stops at the window end.
- **Identity.** A row matching a known PID with creation within 1 ms throws `KNOWN_IDENTITY_STILL_PRESENT`, or throws
  executable mismatch. Otherwise the row is reused, which counts as absent.
- **Output and claims.** Output is capped at 8,192 B, with no stop, kill or retry. It claims
  `independentGitHelperPidProof false` and `globalGuarantee false`.
- **Runtime.** `Convert.ToHexString` and `SHA256.HashData` need .NET 5 or later, which the pinned pwsh 7 provides.
- **Fit.** The parent may take up to 300 s from the last start, which leaves about 45 s before the window end for the
  closure's under-10 s run. If it runs late, it fails closed.

## 3. Dispatch conditions (not mismatches)

1. **Invocation.** The inner invocation must name the full pinned pwsh path, or the parent refuses
   `PINNED_PARENT_RUNTIME`.
   - The outer transport shell process is outside the 16 identities, consistent with "no global family claim".
   - Collect the parent's exact native exit code, for example with `exit $LASTEXITCODE`. A generic 1 from the wrapper
     still counts as FAIL.
2. **Tuples.** Build the 16 tuples only after a complete native parent exit of 0, a receipt showing all 15 rows passed,
   and owned-handle closures.
   - Take the PID and creation strings from the raw receipt text. Do not round-trip them through a date parser.
   - Order: the parent, then the 15 rows in plan order.
   - Record the receipt hash, the exact tuple JSON bytes and hash, and the rendered closure hash before the one closure
     call.
3. **Failure rules.** Any non-zero exit, late result, unknown result, `KNOWN_IDENTITY_STILL_PRESENT`, executable
   mismatch or receipt and exit disagreement is a FAIL, whatever the receipt says (Doc 196 limit 1). No widened limits.
4. **Re-check at dispatch.** Root's final dispatch must re-confirm, at that time:
   - the HEAD, tree and clean state;
   - the 19 pins and the parent;
   - that the output directory is absent;
   - that no competing jobs are running.

The browser 2,048 MiB floor, setup, staging and Doc399 holds are unchanged. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | offline15 R1 fresh ticket 8f7736fe (records d316f5d) + 16-identity closure template 802baa69 | reviewer 6abf1edf | MATCH, no material mismatch: every parent-checked ticket field exact (mode, owner, plan 205cbe0d, output, source 51962b33, parentPin = -File path 6488fba2); window 22:23:44.700-22:43:44.700Z = 20 min, lastStart = end-345 s exactly; tc25 98ce20e1/3cf2137a clean (longpaths, untracked all), 19 pins match, 15 cases, output absent, fresh owner attestation; template: three placeholders with self-hash check, 16 exact {creationUtc,executable,pid} tuples compatible with parent receipt (parentPid/parentCreationUtc, row pid/creationUtc 'o' 7F, executables = pinned pwsh/node), two 1 s queries 500 ms apart, <10 s, stop at window end, 8192 cap, no kill, no Git-helper/global claim. Conditions: inner call names full pinned pwsh and returns exact native exit; tuples only after exit 0 + all 15 passed, raw strings, hashes recorded before call; any non-zero/late/unknown/still-present FAIL; Root re-confirms state at dispatch | not admission or dispatch | doc 201.`

Not execution, admission, dispatch, approval, push, deployment or production consent; not human approval.
