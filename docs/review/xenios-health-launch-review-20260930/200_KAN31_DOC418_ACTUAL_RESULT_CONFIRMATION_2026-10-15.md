# KAN-31 Doc418 actual result: confirmation against Doc 199

**CONFIRMED: the evidence closes Doc418** (LIGHT resource, parent parse and path comparison, and independent closure of
the parse process's identity) **with no material gap.** The limits below are disclosed.

- **What this is not.** Not offline15 admission, and no browser, setup, staging, SQL or production credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
file hashes and evidence text; no new query or execution; no agents. Accepted source and docs 195 and 197–199 are not
reopened.
- **Timing.** Compared at 2026-10-15T22:19–22:22Z.
- **Jira.** Root relays.

Archive: `hl12/200_kan31_doc418_actual_result_confirmation.json`.

## 1. Identity

- **Evidence commit.** Core `98ce20e1` (tree `3cf2137a`, parent `db03e216`), local only. It adds exactly three files
  under `correction-e33c12a-parent-parse-doc418-actual-20261015/`:

| File | Size | Hash |
|---|---|---|
| `EXECUTED_RESULT_AND_LIMITATIONS.json` | 6,118 B | `4379bbf2…` |
| `NATIVE_TOOL_RECEIPTS.json` | 21,788 B | `c63b391c…` |
| `RENDERED_CLOSURE_COMMAND.txt` | 3,358 B | `77c13069…` |

  These match Root's Doc419 (3,879 B, `cd083609…`).
- **Binding directory unchanged.** The offline binding directory is unchanged from `db03e216`. The tc25 worktree is
  clean with `core.longpaths`.

## 2. Against the Doc 199 conditions

1. **Shell and argv.**
   - Each receipt records the pinned pwsh path, `login: false`, and the requested command text.
   - The requested texts hash exactly to the pins: resource `406360be`, parse `fc975d1a` and closure `77c13069`.
   - **Limit:** the operating system's argv, and whether `-NoProfile` was passed, were not observed independently.
     This is not material: each output is exactly the literal's single expected JSON line, with nothing a profile
     could add.
2. **Window and freshness**, from the actual outputs:
   - **Resource.** Requested 22:17:37.637Z. Its process started about 22:17:37.69Z (`at` 22:17:39.4608 minus
     `counterAfterOuterMs` 1,768). Both are after the window start and before the last start.
   - **Parse freshness.** Parse `creationUtc` 22:17:39.6527Z minus resource `at` is **191.9 ms**, under 30,000 ms.
   - **Parse timing.** It returned at 22:17:40.213Z, a creation-to-return upper bound of 561 ms, which is under the
     15 s lifetime and the 14 s wait.
   - **Closure.** It ran 22:17:54.153–22:17:55.791Z. Everything finished before 22:28:59.810Z.
3. **Clean tree.** The before and after checks report clean, full history, all 19 pins and the parent matching. I
   re-checked HEAD `98ce20e1` with long paths: clean.
4. **Substitution.**
   - The rendered closure equals the template with exactly the three substitutions: PID `120584`, creation
     `2026-10-15T22:17:39.6526552Z`, and stop `2026-10-15T22:28:59.810Z`.
   - It was retained before invocation, and its bytes and hash match the requested command.
   - The PID and creation time come from the parse's complete output, after an exit of 0. The parse output with its
     raw CRLF terminator hashes to the recorded `3bb73212…`.
5. **Failure rules.**
   - All three native exits are 0, and each completed response is one expected JSON line.
   - The resource readings are 2,275 / 2,275 / 8,008 MiB, against the 512 MiB floor, with initialization 941 ms, OS
     326 ms and read 95 ms.
   - The parse has 0 errors, accepts the same path, refuses a different path, and dispatched nothing.
   - The closure observed PID `120584` as `KNOWN_IDENTITY_ABSENT` twice, 817 ms apart, with queries of 306 and 296 ms
     and a total of 1,502 ms, under 10 s.
   - No retries, stops or reuse.
6. **Offline15.** Not run. It still needs its own fresh exact ticket.

## 3. Disclosed limits (not material)

- **Combined output.** Output was combined, not separate stdout and stderr files. Empty stderr is supported only
  because each response contains nothing but the expected line. No independent empty-stderr artifact is claimed.
- **No exact exit time.** It is bounded instead by the tool return and the two absence observations.
- **Parse identity only.** Closure covers the parse identity, not a global process guarantee. The resource and closure
  processes are covered by their exit-0 completion only.
- **LIGHT only.** The 2,275 MiB observation gives no browser admission or qualification.

## 4. Going forward

- **Source.** Any future ticket must bind the records-only successor `98ce20e1`/`3cf2137a`, not `db03e216`. The
  binding directory and the 19 pins are unchanged.
- **Offline15.** It still needs Root's separate fresh exact ticket and prerequisites, an exclusive light slot,
  independent closure, and the rule that a non-zero exit is a failure.
- **Browser holds.** The browser holds are unchanged. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Doc418 actual result (Core 98ce20e1 / tree 3cf2137a, 3 evidence files 4379bbf2/c63b391c/77c13069; Root Doc419 cd083609) | reviewer 6abf1edf | CONFIRMED, Doc418 CLOSED, no material gap: requested texts hash to pins 406360be/fc975d1a/77c13069 on pinned pwsh login:false; exits 0/0/0, one expected JSON line each; resource 2275/2275/8008 MiB vs 512 floor (init 941/os 326/read 95 ms); parse 0 errors, same accepted, different refused, 0 dispatches; parse creation - resource at = 191.9 ms; parse return <=561 ms; closure rendered = template + 3 substitutions (PID 120584), absent twice, 1.5 s; all before 22:28:59.810Z; clean (longpaths) before/after, 19 pins + parent | limits: OS argv not observed, combined output only, no exact exit UTC, parse-identity closure only | future tickets bind 98ce20e1; offline15 needs its own ticket | doc 200.`

Not execution, admission, approval, push, deployment or production consent; not human approval.
