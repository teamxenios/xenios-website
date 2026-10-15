# Morning independent report: mixed request-intake release

**NOT LIVE.** No release candidate has been deployed, and no customer-path evidence exists. No candidate is ready for
the established release decision.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session, under Samuel's overnight
brief (prompt 3).
- **Method.** Read-only: committed Git objects only. Nothing run, queried or deployed; no credentials; no agents.
- **Overnight job.** Deleted at 07:47 local (`35c5a7a1`).
- **Prepared.** 2026-10-15T12:47–12:48Z.

Archive: `hl12/187_morning_independent_report.json`.

## 1. Release evidence I verified (docs 164–186, all committed and pushed on this branch)

| Area | What I verified | Doc (commit) |
|---|---|---|
| Source | 40-path application `47f49adf`, then its six-path correction `84178ce1` (keyed by `member.cartScope`) | 166–168, 174 (`f7bee698`) |
| Build | Literal `npm run render-build` on `84178ce1`, Node 20.19.0/npm 10.8.2: **PASS**, archive `2d502f0a` | 176 (`dbb7b899`) |
| Focused tests | 16 files, **220/220 passed**, 0 failed or skipped, archive `1155dfd2` | 177 (`d0a5be85`) |
| Generic typecheck | `npm run check -- --incremental false`: **exit 0, 0 diagnostics**, archive `824c97d4` | 177 (`d0a5be85`) |
| Browser test mechanism | Mixed request-intent harness over two synthetic rows and volatile RPC: mechanism accepted, **not run** | 178 (`72a2647a`), 181 (`c0aabe63`) |
| Input inventory | 3,909 source + 37,927 dependency pins, current for `84178ce1` | 179 (`798fc9b3`) |
| Browser attempts | Both **REFUSED** at the external 2,048 MiB G0 floor (host capacity; available 1,623 and 1,700 MiB); no browser started | 180 (`92c7eb90`), 182 (`ca78a508`) |
| Release-control check | Literal `npm run check:release-control-plane` on `84178ce1`: **PASS**, compiler only, receipt `09d0e45e` (`aa521d7`) | 183 (`66da5feb`) |
| Three-file regression | `84178ce1`: **FAILED**, 61 passed, 1 failed, 1 named PG16 skip, receipt `1985e96a` (`47164e7`). Five `NON_API_ROUTE_PATH` findings for the directly mounted request-intent router, a release-control coverage gap | 183 (`66da5feb`) |
| Successor `e33c12a9` | Two-path scanner/test fix applied byte-exact under the human-approved Doc 318/324 exception; custody returned and acknowledged | 183, 184 (`8ae7c41a`) |
| Current-66 runner | Runner, profile, entries, G0, 91 pins and window sufficient. Reuse of build/focused/generic-tsc credit accepted as unchanged-input evidence only | 185 (`e4929c37`) |
| e33 preparation | Fresh full-history source and donor dependency copy verified: 4,893 source blobs, 91 pins, zero reparse points. First copy attempt 340 stays FAILED | 186 (`1dc11e10`) |

## 2. Steps that actually passed, with receipts

- **Build: PASS.** `84178ce1` render-build, archive `2d502f0a…` (Doc 176).
- **Focused tests: PASS.** 220/220 across 16 files, archive `1155dfd2…` (Doc 177).
- **Generic typecheck: PASS.** 0 diagnostics, archive `824c97d4…` (Doc 177).
- **Release-control compiler check: PASS.** On `84178ce1`: Core `aa521d7`, receipt `09d0e45e…`, log `e8c95d04…`
  (Doc 183). Compiler only, and it does not carry over to `e33c12a9`.
- **Qualification steps, not tests.** The input inventory (Doc 179) and the `e33` preparation verification (Doc 186).

Nothing else passed. The regression (309) FAILED, both browser attempts were REFUSED and never ran, and the `e33`
compiler and current-66 regression are NOT RUN.

## 3. Conditions that remain unverified or open

1. **The successor's fresh controls.** `e33c12a9` was prepared and Doc 186 confirmed the preparation at 12:18Z. But
   the release-control compiler and the current-66 regression were never admitted or run before Root 328's window
   closed at 12:30Z. Root/Core have made no commits since 12:11Z. Root's DOC344 records reviewer transport as blocked
   ("Claude minimized"). A new window, fresh READY, tickets and G0 are required. The owned `source7` worktree removal
   is still owed.
2. **Mixed browser journey: NOT RUN.** It needs a concrete host resource change from Samuel, with Chrome preserved,
   then a fresh 2,048 MiB G0.
3. **Full suite, static checks, release diff and final manifest:** not done.
4. **Hosted DB.** The Doc 247 staging restore is pending human approval (Root DOC333). SQL cases (Doc 228) are NOT
   RUN. Managed persistence, Auth and PostgREST have not been exercised.
5. **Privileged staff reads:** HELD until the security exposure is closed and service-role rotation is confirmed.
6. **Phase A.** The 40-path lease `abb400e5` is still active, and its return and finalizer are PENDING.
7. **Production state.** These facts are Root-recorded provider metadata (DOC332/339); I did not query Render.
   - The live service runs commit `7bba4b6e`, a 2026-09-21 docs commit, through manual deploy `dep-db83lo8n…`
     created at 02:30:57Z.
   - The actor and the reason are unknown, and that deploy is not any candidate.

## 4. Security (kept separate)

- **What is reported.** A replacement Supabase key was saved in Render.
- **Not confirmed by any artifact I have seen:**
  - runtime verification that production uses it;
  - other consumers of the old key;
  - old-key revocation;
  - closure.
- **Owner.** The security owner must confirm these. The security exposure stays **OPEN**, and nothing in this report
  infers closure.

## 5. Readiness for the established release decision

- **`47f49adf`: NOT READY.** Superseded. Its focused and typecheck failures led to the `84178ce1` correction.
- **`84178ce1`: NOT READY.** Its release-control regression FAILED.
- **`e33c12a9`: NOT READY.** Its source and tooling are reviewed and its environment is prepared, but the mandatory
  compiler and current-66 regression are NOT RUN. The browser journey, DB, security, staff, phase A, full suite and
  manifest conditions are open.

## 6. Live deployment and customer path

**Not proven.** No candidate has been deployed. Production runs `7bba4b6e`, per Root's provider record. There is no
customer-path evidence: no real request saved, read back or reviewed on a live candidate.

**NOT LIVE.**

Not execution, admission, push, deployment or production consent; not human approval.
