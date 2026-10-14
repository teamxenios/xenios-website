# Invoking-owner clock exception: exact payload confirmation

**CONFIRMED. The prepared payload implements Doc 142's correction exactly and changes nothing else.** Root's
`DOC144_EXACT_INVOKING_OWNER_CLOCK_EXCEPTION_AND_NEW_WINDOW_DECISION_READY_20261014.json` (12,565 B, `e60ce3cd…`,
board `521ccafb`) carries the payload identity `60ee8959…`. I recomputed it as SHA-256 of the compact UTF-8
serialization, and it matches. It is prepared, not approved: there is no human approval, no window and no admission
yet.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only. Archive:
`hl12/143_invoking_owner_clock_exception_confirmation.json`.

## What I checked

- **Unchanged against the Doc 141 approval.** Field by field, these are identical:
  - the immutable diagnostic source `0bc62fe7` and the current execution source `bb3f8e62` / `072488c8`;
  - owner, session, task, lease and worktree;
  - contract `e4b53989`, collector `d8e990cb`, child `c4dbfc0b` and pwsh `362a356c`;
  - bounds, both arms, output, operation, allowed output and local effects;
  - the command template, with no quotes and only its two placeholders, the native options and the quote rule.
- **The one procedural change.** The old `substitution` clause, under which Root sampled the timestamp, is gone.
  Two clauses replace it:
  - `rootFreezes`: Root issues the admission and freezes its hash, the command, the options and the anchor rule,
    substituting only the ticket hash.
  - `invokingOwnerClockException`: Core samples real, unadjusted UTC in strict millisecond format as its last action
    in the same orchestration step immediately before the native call, and substitutes only that value. There is
    no offset, no backdating or forward-dating, no second model turn, and no helper, read, write, poll or query in
    between. Core does not issue or alter the admission.

  That is exactly the Doc 142 correction. The removed descriptive fields (`status`, `doc136`,
  `actualStartupOptoutProven`, `noEnvironmentReadOrPersistentChange`) change no behaviour. The operation and local
  effects still forbid environment inspection and persistent changes.
- **Evidence and collector.** The `evidence` clause keeps all of these distinct after the call, with external
  monotonic null: the substituted command, the sampled UTC, the external start and return, the native chunk,
  session, exit and wall time, the full output, and the input post-hashes. The `unchangedCollector` clause keeps
  every collector check and file unchanged.
- **Precision correction to Doc 142.** Doc 142 said forward-dating is impossible because the collector refuses an
  anchor later than its process start. The payload's `timestampLimitations` is more accurate:
  - that check alone does not prove the sample came before the external call;
  - a forward-dated anchor could still fall inside the short gap between the call and the collector's start.

  That is why the payload's requirement of a real, unadjusted last-action sample, with the command and start/return
  evidence retained, is the right control. I adopt its wording in place of Doc 142's sentence.

## Review timing

Root keeps my comparison of the actual approval and window before admission, and does not adopt Doc 142's
after-the-fact option. That is Root's call, and it preserves a review gate.

The consequence is that my comparison sits on the 20-minute critical path, which starts at Root's acknowledgment.
This session wakes only when a message is delivered. Root should deliver the approval record here immediately after
acknowledging it. My earlier comparisons took about 10–14 minutes from acknowledgment, mostly delivery.

## Remaining, in order

1. Samuel's direct approval of this exact clock exception and one new 20-minute window.
2. My comparison of the actual approval and window against this payload.
3. Root's slot and fixed ticket.
4. Core's FINAL READY on the ticket hash and current head.
5. Root's frozen hash-bound command.
6. Core's last-action sample and single call.
7. Then evidence review against Docs 138 and 140.

No approval, window, admission, execution or credit is created here.
