# Quick Order doc 63 verifier format cases `935aaf1` / `a828501`: bounded delta review

**SOURCE ACCEPT WITH LIMITS.** The seven new case and control pairs each refuse only through the check they name:
- the schema version literal;
- the revision id, source commit and bundle digest formats;
- the artifact digest format;
- the start date's round-trip check;
- the end date's round-trip check.

The round-trip negatives count only after ordinary queries confirm the date converts cleanly, so a failed conversion
fails the verifier instead of passing as a refusal. The SQL is byte-identical to `2d2d958` and `7a62e64`, and the
definition hash recomputes at `3ca2bab8…`. Removing the new block and the bindings change reproduces the accepted
verifier byte for byte, so nothing retained changed. No P0, P1 or P2.

**Execution eligibility: none.** Seven authored pairs are not seven working pairs. In particular, how the pinned
PostgreSQL handles a 24:00 timestamp has not been observed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC63-VERIFIER-FORMAT-DELTA-20261008` r1, acknowledged at
`ab1d43f`. Method: one read-only lens with an adversarial verifier, which upheld every lens finding and added two. Lens
output archived as `hl12/65_doc63_verifier_format_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `935aaf1a679aa67d013133521dd7110f66db74a3`, tree `3a7b5d11f2c5b8d8e472185f1fe1136313c3eae6` ("Add bounded Doc63 publication format cases and receipt bindings"), parent `6c3a883` |
| Delta | the verifier, `rollback.md` and the new `evidence/doc63-verifier-bindings-20261008.json`; the `.sql`, precheck and postcheck are unchanged; the supervisor and manifest are unchanged from `f98c416` |
| Records | `a8285015c2f63748f6e76f1ab4c8a01b5dde8fa1`, records-only; the receipt for `935aaf1` has 66 entries, all matching, and does not list itself; the bindings, closure, source and preservation records recompute |

## 2. Doc 63 items

| Item | State |
| --- | --- |
| V63-1, five format checks with no case | **Closed in source.** Five direct pairs, each isolating its line |
| V63-2, date round-trip not isolated | **Closed in source.** Start and end pairs, guarded by conversion pre-checks |
| V63-3, end-of-string dot segment | Carried as a limit, as the assignment directed |
| V63-4, old bindings name in `rollback.md` | **Closed** |
| V63-5, replay behaviour not asserted | Carried as a limit, as the assignment directed |
| V63-6, record labels | **Closed** in the new closure, with a typography residual (D65-2) |

## 3. Findings (all P3, verified)

- **D65-1. Sub-terms of the format lines are not isolated.** Each new case isolates its format line, but not the line's
  type terms, anchors or length bounds. Some of those are the only refuser for reachable inputs.
- **D65-2. Typography in the new bindings.** The new bindings still join words to numbers. That file is receipt-pinned,
  so a fix belongs in a source successor, not records.
- **D65-3. A stale supervisor status.** The source record lists the supervisor as pending under doc 64, although doc 64
  had already been published.
- **D65-4. A stale timestamp.** The closure's timestamp predates the commit it names.
- **D65-5. A superseded output sentence.** The verifier's output still carries doc 58's sentence that the date
  round-trip remains a compound limit, which these pairs now supersede.

## 4. Disposition

- Subject: `935aaf1a679aa67d013133521dd7110f66db74a3` (tree `3a7b5d11…`), records `a828501`.
- **SOURCE ACCEPT WITH LIMITS.** No P0, P1 or P2.
- **What it unlocks:** `935aaf1` and its receipt may replace `7a62e64` as the accepted verifier for any future
  proposal. The SQL definition is unchanged. The supervisor manifest at `cc584f9` still pins `7a62e64` and lists
  `935aaf1` only as pending. That is correct until this disposition, and a later successor may re-pin.
- **What stays held:** every execution, installation, activation and reserved policy. D65-1, D65-2 and D65-5 may travel
  in the builder's next verifier successor. None blocks.
