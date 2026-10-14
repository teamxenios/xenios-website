# Actual Doc 131 R2 postcheck: evidence disposition

**EVIDENCE ACCEPTED as a complete selected-relation observation. The missing external monotonic timer does not
block Root's R2 reservation decision.** The one admitted query ran inside its window and completed with zero rows.
Its completion is proven by the native exit, the exact terminal marker and the complete record, independently of
any timer. Three separately measured durations agree with one another and sit far under the 10 s envelope. So the
observation, together with the recorded exits, is a sufficient factual basis for Root to decide the R2 reservation,
with the residual Doc 131 already stated. The strict operator binding is still not fully satisfied, and this
disposition does not say otherwise. Whether to accept that deviation, and whether to release the reservation, are
Root's decisions.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; no query
or process action. Archive: `hl12/133_r2_postcheck_actual_evidence.json`.

## 1. What I bound

- **Records.** Core commit `1a63b45e` (tree `11bad566`, parent `cf4ab5cc`) holds six evidence files. Root's
  `DOC131_R2_FAILURE_POSTCHECK_ACTUAL_IMMUTABLE_20261014/` copies of all six are byte-identical to those blobs. The
  observation record is 352 B, `23663c54…`.
- **Admission.** The admission record is `211a5ec9…` at Root `941cfb17`. It names the frozen binding `5fe688ae…`
  that I checked earlier, with one attempt, one query, a 2 s provider timeout, a 10 s total, 32 rows, 16 KiB, no
  retry and no stop. It also references the standing local scope, the same-owner acknowledgment and the held
  exclusive reservation.
- **Command.** The preflight records the native command hash `d0cea4f2…`, which is the hash of the command I
  verified decodes to the reviewed payload. The tool result does not echo the command text. Its identity rests on
  the operator's record, which is the normal form for this transport.
- **Pins.** All nine pins, the binding hash and the admission hash are unchanged after the run, and the source tree
  was clean.

## 2. What the evidence shows

| Fact | Value |
|---|---|
| Admitted window | 03:42:40.367Z to 03:44:40.367Z, last start 03:44:30.367Z |
| Preflight | 03:43:29.156Z, before the call |
| External call, UTC | 03:43:48.868Z to 03:43:49.950Z, 1,082 ms |
| Native tool elapsed | 756.3 ms, exit 0, no session left open |
| Terminal output | exactly `R2_OBSERVATION_RECORD_WRITTEN` plus CRLF, untruncated |
| Query inside the payload, UTC | 03:43:49.3956Z to 03:43:49.7983Z, 402.7 ms |
| Payload stopwatch | 400.2 ms |
| Result | `QUERY_COMPLETED`, 0 rows observed, 0 retained, 1 query, 0 retries, 0 stops |
| Post pins | 03:44:11.522Z, after the call |

- The call started inside the window before the last start, and returned before the window ended.
- The query interval nests inside the external call interval.
- The payload stopwatch, a monotonic counter, agrees with the payload's UTC interval to within 3 ms.
- Retained output totals 383 B, under the 16 KiB cap.

## 3. The timing gap

The binding asked for a separate external monotonic duration, and none was captured because the operator's timer
was unavailable. Two things make the gap immaterial to the reservation question.

- **Completion is not established by timing.** The binding's own completion conditions are native exit 0, no
  open session, the exact untruncated marker, and a complete record reporting `QUERY_COMPLETED` with one query and
  no retries. All of those are met. A hung or partial query cannot produce that combination, because the payload
  writes the marker only after the record is flushed and only when the query completed inside its own 10 s check.
- **The duration bound is not in doubt.** For the true duration to exceed 10 s, the system clock would have to
  step back by about 9 s during the one-second call. The tool's own elapsed figure and the payload's monotonic
  stopwatch would also both have to be wrong in the same direction. The three measurements come from three
  different counters and agree at the sub-second scale.

What the gap does leave is a deviation from the binding's evidence form: one requested field is null. I am not
relabeling the tool elapsed time as that field, and the record should keep `strictBindingFullySatisfied: false`.

## 4. Meaning of zero rows

A WQL query that matches nothing returns an empty set without error. A syntax or provider failure raises an error,
and with `-ErrorAction Stop` that would have produced `QUERY_FAILED_OR_INCOMPLETE`, not `QUERY_COMPLETED`. So the
zero is a real negative.

At 03:43:49Z, about one hour after R2, no process existed with PID 58428 or 55812 and none had either as its parent.
No row needed the PID-reuse or parent-lifetime rule. The residual is unchanged from Doc 131:

- departed transient processes and their descendants were not observed;
- executor 43380 was not covered;
- there is no claim of global absence, cleanup or group closure.

## 5. For Root's decision

Together these are the factual basis Doc 131 described:

- this observation;
- the caller and CMD exits recorded from retained handles;
- the executor exit 1 reported by the native transport;
- the absent `attempt-counter-r1` directory;
- the unchanged R2 pins.

No further invariant from Doc 131 stands in the way of Root deciding the R2 reservation now. The only open items
belong to Root: whether to accept the timing-field deviation, and the release decision itself.

Not a strict-binding PASS, not execution consent, not a release, and not a PASS for R2. No counter, scheme,
browser or control proof is credited. Doc 132's source acceptance of `82fe41df` is unchanged.
