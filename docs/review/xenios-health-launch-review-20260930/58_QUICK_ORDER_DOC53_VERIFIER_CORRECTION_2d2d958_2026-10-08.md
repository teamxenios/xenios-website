# Quick Order doc 53 verifier and records correction `2d2d958` / `0d417a9`: bounded delta review

**SOURCE ACCEPT WITH LIMITS.** CF-1 and CF-2 from doc 53 are closed in source. Each new verifier case refuses only
through the check it targets, which I traced by removing that check: the case would then be accepted, and nothing
earlier refuses it first. Each has a paired valid control. The SQL change is four header-comment lines outside both
hashed blocks. The definition hash is unchanged at `3ca2bab8…`, which I recomputed. The rollback wording for CF-3, CF-5
and CF-6 matches the SQL, and the records recompute.

The same blind spot CF-2 named still exists in older envelope cases, including the exactly-six artifact rule. That is
inherited from the accepted source, not a regression, and must be fixed before a qualification run relies on those
checks. The census preimage proposal for CF-11 needs three precision fixes before I can disposition it. No P0, P1 or
P2. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`DOC53-VERIFIER-RECORDS-DELTA-20261008` r1, acknowledged at `7219ac3`).

Method:
- two read-only lenses, each with an adversarial verifier: verifier discrimination and SQL; records, closure and the
  census proposal;
- a completeness check;
- my own recomputation of the definition hash.

Every verifier upheld every lens finding. Lens output archived as `hl12/58_doc53_verifier_correction_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `2d2d958f5c45259d5d1134665f3eb5b8caf9c172`, tree `b7826387a6868bd86501804ba152e861b5e442c4` ("fix(quick-order): discriminate Doc53 verifier boundary fixtures"), parent `8e462da` |
| Delta from `e90d464` | the `.sql` (header lines 4-7 only), `rollback.md`, the verifier and the new `evidence/doc53-verifier-bindings-20261008.json`; the supervisor and manifest are byte-identical to `1e808ba` |
| Records | `0d417a918a45ee9e4015f41abba8976e9660c3dd`, records-only |
| Recomputed | definition `3ca2bab8…`, unchanged; the receipt for `2d2d958`, 66 entries, all match; the bindings; historical evidence unchanged |

## 2. What is closed (hand-simulated, NOT RUN)

- **CF-1, the octet ceiling.** It is now tested with an otherwise valid canonical document of 8,388,609 bytes, refused
  only at the ceiling check. The at-ceiling control of exactly 8,388,608 bytes (392 offer rules) is valid and canonical
  and must be accepted, which also catches an off-by-one. Building it is feasible within the verifier's existing
  bounds.
- **CF-1, nested key order.** A swapped quantity key pair keeps the parsed value identical and is refused only by the
  byte-for-byte rebuild.
- **CF-2, envelope cases.** The repeated-path, 33-source-reference and 33-applicability-reference cases each build
  their own decision from the altered envelope. Each is refused only at the path-distinctness or 1-to-32 check, with a
  valid control.
- **Records items.** The CF-8 header is corrected. The CF-3, CF-5 and CF-6 statements in `rollback.md` match the SQL.
  CF-12's packet wording is corrected. CF-4, CF-9 and CF-10 are recorded by the coordinator at `81a32af`. CF-7 stays
  deferred to the next definition change.

## 3. Findings (all P3, verified)

**Fix before a qualification run relies on these checks:**
- **C-1. Older envelope cases have CF-2's blind spot.** They still pair an altered envelope with the original
  decision, so the decision layer refuses them first, and the envelope checks they target are never isolated:
  - mirrored keys;
  - an impossible date;
  - an end not after its start;
  - two further envelope checks;
  - most importantly, the exactly-six artifact count.

  Removing the exactly-six check would admit a seven-artifact envelope with a duplicate kind, against item 16. One
  further check can be reached by no fixture. Apply the CF-2 pattern to each, or assert the publication validator
  directly, and add a seven-artifact duplicate-kind case and the unsafe-path cases.

**Records precision:**
- **C-2. "Idempotent" overstates a replay.** `rollback.md` calls an identical republication an "idempotent replay".
  The revision row is preserved, but the head is re-held and its writer epoch advances.
- **C-3. A hashed comment is now out of date.** It still says the v1 refinement "requires exact-successor review",
  which doc 53 has since given. Changing it would change the definition, so disclose it and refresh it at the next
  definition change.
- **C-4. Header scoping.** The corrected header calls `authority_` a prefix without saying it applies to relations
  and types only.
- **C-5. A count with no stated basis.** The records give a line-ending difference count of 9 without saying it is a
  working-tree observation. The Git-object count is 0.
- **C-6. Missing spaces.** Spaces between words and numbers are missing throughout the packet and the coordinator
  addendum. In the census proposal's normative bounds this matters, so fix it there first.
- **C-7. A pinned record was edited in place.** The coordinator appended CF-4, CF-9, CF-10 and CF-11 to the scope
  record, which other records pin at `7b1e606`. Cite both commits, and put future addenda in separate files.
- **C-11. Informational, inherited.** Two binding rows carry a predecessor hash from an older generation; the verifier
  does not read that field.

**The census preimage proposal (CF-11, coordinator `9600645`): not yet ready for disposition.**

It is a proposal, and it closes most of doc 53's gap: closed keys, order, types and set encodings. Before I can
disposition it:
- **C-8. Ambiguous hashing.** Say exactly what "raw Git blob SHA256" means: the SHA-256 of the exact blob bytes, with
  no header and no normalisation, lines delimited by LF, and an unterminated final line counted.
- **C-9. Missing rules and vectors.** Add the fixed census artifact path, an explicit rule that the census source
  commit must equal the decision's, and one canonical test vector with its digest, plus reordered and duplicate
  negatives.
- **C-10. A possible fixpoint.** State that the runtime's expected census digest comes only from the published decision
  or an external receipt. If it lived in a reader file the census itself pins, the digest would depend on itself.

CF-11 stays open until a populated census is frozen and dispositioned.

## 4. Disposition

- Subject: `2d2d958f5c45259d5d1134665f3eb5b8caf9c172` (tree `b7826387…`), records `0d417a9`.
- **SOURCE ACCEPT WITH LIMITS.** No P0, P1 or P2. Doc 53's CF-1 and CF-2 are closed in source.
- **What it unlocks:** `2d2d958` and its receipt replace `e90d464` as the accepted currentness source for any future
  proposal. The definition is unchanged.
- **What stays held:**
  - the C-1 discrimination work, before a qualification run relies on those checks;
  - the census contract, until C-6 and C-8 to C-10 are fixed and I disposition the exact text;
  - a supervisor manifest pin, because the manifest still pins `f581b6b`;
  - every execution, installation, activation and reserved policy.
- **Smallest next action:**
  - Builder, one more verifier-and-records successor: C-1, C-2 and C-5, with C-3 and C-4 disclosed.
  - Coordinator: the census contract fixes, and C-7.
