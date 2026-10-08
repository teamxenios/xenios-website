# Quick Order doc 58 verifier correction `7a62e64` / `276226f`: bounded delta review

**SOURCE ACCEPT WITH LIMITS.** Doc 58's C-1 and C-2 are closed in source. Every envelope check C-1 named is now
exercised by a case that refuses only through that check, with a valid control:
- the mirrored-key presence check;
- the impossible-date conversion;
- the end-after-start check;
- the path grammar;
- the required kinds;
- the reference grammar;
- the exactly-six artifact count, through a seven-artifact duplicate-kind case;
- the unsafe-path check, which no case could reach before and which four cases now reach.

The SQL is byte-identical to `2d2d958`, and the definition hash recomputes unchanged at `3ca2bab8…`. The replay wording
is corrected. No P0, P1 or P2. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Board task `DOC58-VERIFIER-CORRECTION-DELTA-20261008` r1,
acknowledged at `1fb30a7`. Method: two read-only lenses (C-1 discrimination; C-2, records and definition), each with
an adversarial verifier. Every lens finding was upheld, and each verifier added one more. Lens output archived as
`hl12/63_doc58_verifier_correction_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `7a62e64de1d0120e64aee9a9b04816e5e4c9a1a4`, tree `1d9502428636a5f12196e44adacfe57e42149251` ("fix: distinguish inherited Quick Order publication verifier cases"), parent `b133cd6` (records-only) |
| Delta | the verifier (126 lines added, one replaced: the bindings constant), `rollback.md` (4 added, 1 replaced) and the new `evidence/doc58-verifier-bindings-20261008.json`; the retained case block is byte-identical to `2d2d958` |
| Unchanged | the `.sql` is the same blob at `2d2d958` and `7a62e64`; pre and postchecks, the rollback SQL fence, and the supervisor and manifest are unchanged since `defe073` |
| Records | `276226f4fff3300bae6116bf05693a5b369c806b`; the receipt for `7a62e64` matches 66 of 66 files, and the bindings, source, records and historical-evidence JSON recompute |

## 2. Findings (all P3, verified)

- **V63-1. Five envelope format checks have no case.** Doc 58 did not list them, and they are inherited: the schema
  version literal, the revision id, source commit and bundle digest formats, and the artifact digest format. Removing
  any one would leave the verifier green. Add direct publication-validator cases with the existing control, for
  example a wrong version literal, an uppercase id and a non-hex digest.
- **V63-2. The date round-trip check is still not isolated.** The impossible-date cases are refused by the date
  conversion, so the round-trip check that follows is still not isolated. A case that converts cleanly but is not
  canonical would isolate it. The verifier discloses the limit.
- **V63-3. One unsafe-path branch has no case.** The end-of-string dot segment, such as `synthetic/..`, has no case,
  and the start-of-string branch cannot be reached by construction. This is informational.
- **V63-4. `rollback.md` names the old bindings file.** It still names the doc 53 bindings file as the receipt and
  rollback binding set, while the verifier and receipt now use the doc 58 file.
- **V63-5. Replay behaviour is not asserted.** The corrected replay wording (head re-held, epoch advanced) is accurate
  against the SQL, but no verifier case asserts it.
- **V63-6. Record labels.** The closure labels the presence check as lines 90 to 94; it is lines 90 to 92, and 93 to
  94 is the closed-key check. Three missing-key cases are called compound but are isolated. Some closure lines still
  join words to numbers.

## 3. Disposition

- Subject: `7a62e64de1d0120e64aee9a9b04816e5e4c9a1a4` (tree `1d950242…`), records `276226f`.
- **SOURCE ACCEPT WITH LIMITS.** Doc 58 C-1 and C-2 are closed in source; no P0, P1 or P2.
- **What it unlocks:** `7a62e64` and its receipt replace `2d2d958` as the accepted currentness source and verifier for
  any future proposal. The SQL definition is unchanged. The supervisor manifest's database category should be re-pinned
  to this commit in its next successor.
- **What stays held:** every execution, installation, activation and reserved policy. V63-1 should be added before a
  qualification run relies on those format checks.
- **Smallest next action:** V63-1, V63-2 and V63-4 can travel in the builder's next verifier or records successor. None
  blocks.
