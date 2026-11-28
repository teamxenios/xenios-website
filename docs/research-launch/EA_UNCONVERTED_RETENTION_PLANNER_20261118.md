# Unconverted Early Access retention planner

Task: EA-UNCONVERTED-RETENTION-PLANNER-20261118.
Author: existing codex-ea-analytics-20261118.
Base: e6e11c3f923491d55bc2cd221c29da77001a0822.
Scope: exactly this document and retention/unconverted-plan.ts with its test source.

## Approved policy, separate implementation authority

Samuel explicitly approved both scoped policy records in [KAN-149/13461](https://xeniostechnology.atlassian.net/browse/KAN-149?focusedCommentId=13461), linked by [KAN-225/13462](https://xeniostechnology.atlassian.net/browse/KAN-225?focusedCommentId=13462).
The approved Root review-2 document SHA256 is
`3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b`.
Durable policy record: KAN-149/13456, EA-DURABLE-RETENTION-1.0.
Recipient policy record: KAN-149/13457, EA-TRANSACTIONAL-RECIPIENTS-1.0.

The preserved document was prepared with a proposed-status banner; the later explicit approval receipt supersedes that historical status for these exact bytes. Unseen original attachment hashes remain unknown. Do not ask for the same policy approval again.

This source change neither sets an effective cutoff nor binds runtime policy, classifies a real request, authorizes deletion, configures a provider, sends mail or changes an existing request. It imports no DB, Auth, route, outbox, scheduler or environment authority. No caller mounts it in this change.

## Input and result

`planUnconvertedRetention(raw)` is a pure synchronous advisory calculation.
Every input must provide:

- Explicit classification: unconverted, converted, completed or unknown.
- Original submittedAt; explicit closedAt instant or null (known open).
- Explicit evaluation asOf, legalHold and extension knowledge.
- Supplied policy record reference, document hash, duration semantics and positive safe-integer day counts.

For the approved unconverted rule, supply closure days=90 and submission days=180:
`min(original submission +180 elapsed UTC days, actual closure +90 elapsed UTC days)`.
For a known open case, only the original submission cap applies.
A real unconverted closure/cancellation never enters the completed 12-calendar-month class.
The original submission remains the anchor even if closure occurs late.

The supported arithmetic unit is explicitly `elapsed_utc_days`: each day is exactly 86,400,000 milliseconds from the event instant, independent of host timezone and daylight-saving changes. UTC ISO instants are returned at millisecond precision. There is no locale-based date addition. Calendar months/years and completed-request schedules are outside this planner.

Timestamps require a valid calendar date, explicit Z or numeric offset, seconds and at most three fractional digits. Impossible dates, timezone-free dates, leap seconds, hour24, unknown -00:00 offsets, precision loss and UTC years outside1–9999 are refused. Submission/closure cannot be in the future relative to asOf, and closure cannot precede submission.

A planned result returns both candidate clocks, the limiting clock (including equality), the resulting deadline and whether the supplied asOf has reached it. **Every result has mode=advisory, authority=none and automaticDeletion=false**, including a reached deadline. These are not deletion commands.

Unknown classification/hold/extension knowledge returns unavailable. Converted/completed cases are unsupported, rather than borrowing the unconverted schedule. Active legal holds and present extensions return held without a deadline. This slice does not adjudicate extensions or legal holds. Missing facts, unrecognized fields, invalid policy metadata and overflow also return unavailable, with no private input echo.

There are no defaults for policy numbers or a wall clock. Policy metadata is carried for traceability; the pure function cannot authenticate approval or prove that a real request captured that version. A caller must obtain actual approved values and canonical lifecycle facts through Root's later qualified integration.

## Lifecycle and data boundaries

Quotes, email attempts, page views, notes, pending_review and generic updated_at are not input clocks. Extra activity/quote fields are refused. Repeating the same facts produces the same result; moving asOf across a deadline changes only the phase, not the deadline. Inputs are not mutated or cached.

This does not remove the existing immutable request/audit triggers or restrictive foreign keys. Parent erasure, pending/in-flight notice cancellation, dedupe/tombstones, payload-versus-minimal-evidence retention, support linkage, vendor/mailbox residuals and the clinical/provider route remain separate engineering work.

Actual storage currently has no request closure/conversion timestamps; the existing queued/reviewing workflow cannot supply them by inference. The pure planner must remain unmounted until those authorities, approval capture, effective scope, operational erasure and staged acceptance are qualified by Root.

## Verification and next owner

Meaningful test SOURCE covers the90/180 minimum, known-open cap, late closure, equal deadlines, exact millisecond boundaries, classification/hold/extension uncertainty, malformed/missing data, chronology, equivalent offsets, DST elapsed-day semantics, leap years, supplied policy values, overflow, immutable replay/no hidden clock, no quote/activity resets and no private rejection echo.

At source freeze, local test/build execution is **NOT RUN: Root retains the allocation**. Tests written are not tests passed. No dependency install or shared tree mutation occurred. Hosted checks and independent review must bind to the actual pushed successor SHA.

Root owns the next bounded test allocation, exact-source review and future lifecycle/retention integration. This planner changes no production behavior and is not evidence that the complete retention policy, request-to-staff journey or customer acknowledgement is operational.
