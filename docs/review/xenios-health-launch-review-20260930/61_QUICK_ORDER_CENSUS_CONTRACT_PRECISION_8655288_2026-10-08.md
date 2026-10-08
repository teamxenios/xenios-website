# Quick Order census contract precision amendment (coordinator `8655288`): bounded review against doc 58

**CONTRACT PRECISION: ACCEPT WITH LIMITS.** The amendment answers doc 58's census items C-6 and C-8 to C-10 precisely,
and records the C-7 lineage correctly. It is a records-only proposal: it creates no census, chooses no policy and
changes no source. CF-11 stays open until a populated census is frozen at an exact source snapshot and I disposition
that artifact. Two P3 precision items remain. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Delivered through the coordinator-led queue (board task
`DOC58-CENSUS-CONTRACT-PRECISION-20261008` r1). Method: a direct read of the 47-line amendment against the proposal at
coordinator `9600645` and doc 58. I recomputed the synthetic vector's digest and compared every restated bound with the
original table. No lens was needed for a contract text of this size.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Subject | `docs/coordination/launch-coordination-20261005/DOC58_CENSUS_CONTRACT_PRECISION_AMENDMENT_20261008.md` at coordinator `8655288a1059a9fbd0ae985161db440481b9f9fa`, 8,870 bytes, sha256 `c29e14e3…` (recomputed, equal to the board) |
| Supplements | the census preimage proposal at `9600645` (unchanged) and doc 58 at `202ed1a` |
| Synthetic vector | 847 bytes, sha256 `9b3fb211fc60c04752a0357b8266b5b6c92ebe2138ae9044d78fb4052c95b440`, recomputed equal; printable ASCII only |

## 2. Item by item

- **C-6, bounds: closed.** Every restated bound equals the original table: identifiers, field names, rule text, repository
  paths, integers, the 8,388,608-byte ceiling and the array sizes. The amendment only adds spacing and names both
  projection arrays explicitly. No limit changes.
- **C-7, lineage: closed in records.** The scope record pinned at `7b1e606` stays the bound version, and the appended
  paragraph is cited at `81a32af`. Future amendments, including this one, use separate files.
- **C-8, hashing and lines: closed, one gap.** The rule is the SHA-256 of the exact blob payload bytes at the census
  source commit. There is no Git header and no decoding, BOM removal, line-ending conversion or normalisation.
  - Lines are delimited by LF only, and CR is an ordinary byte.
  - An unterminated final segment counts as a line, and a terminal LF adds no phantom line.
  - An empty blob has zero lines and admits no anchor.

  This is unambiguous. Gap M-1 is below.
- **C-9, path, equality and vector: closed.**
  - **Fixed path.** The census artifact path is `docs/coordination/launch-coordination-20261005/QUICK_ORDER_READER_CENSUS_V1.json`.
    It must not itself be a reader path, and it is ancillary evidence, not a seventh publication artifact.
  - **Source equality.** The census, decision and publication source commits must all equal the same snapshot S, and
    every reader resolves at S. The decision's census digest must equal the one recorded in a separate external
    binding.
  - **Vector.** The synthetic vector follows the contract's key order, and its no-reader rules hold: an `OUT` relation,
    empty projections and selectors, a non-empty exclusion reason and empty reader ids. The three negatives (swapped
    top-level keys, a duplicated key, a duplicated relation) are defined byte-exactly, and each is refused by
    byte-for-byte reconstruction or by strict set ordering.
- **C-10, no recursion: closed.** The order of dependencies is S, then the census bytes and hash, then the decision and
  delivery commit, then the external receipt. The expected digest comes only from the published decision or its exact
  external receipt, never from a value compiled into a reader file the census pins.

## 3. Findings (P3)

- **M-1. A symlink or submodule would hash the wrong thing.** C-8 does not require each reader path to be a regular
  file at S. For a symlink, the blob payload is the link target string, and a submodule entry has no blob at all.
  Require the tree entry to be a regular file (mode 100644 or 100755), and refuse symlinks, submodule entries and
  missing paths.
- **M-2. No worked line-count example.** Line counting is the subtle part, and the amendment gives no worked example.
  Add a small byte-exact table:

  | Blob bytes | Lines |
  | --- | --- |
  | empty | 0 |
  | `a` | 1 |
  | `a` LF | 1 |
  | LF | 1, empty |
  | `a` CR LF `b` | 2 |
  | `a` LF LF | 2 |

  This lets a future harness check its counter before relying on it.

## 4. Disposition

- Subject: coordinator `8655288`, amendment sha256 `c29e14e3…`.
- **CONTRACT PRECISION: ACCEPT WITH LIMITS.** Doc 58's C-6 and C-8 to C-10 are closed at contract level, and C-7 in
  records. M-1 and M-2 may be folded into the populated-census submission.
- **CF-11 stays open.** Closing it needs four things, in order:
  1. a frozen snapshot S;
  2. a populated census at the fixed path that meets this contract and M-1;
  3. its external binding receipt;
  4. my disposition of that exact artifact.
- **What does not change:**
  - The census does not authorise a runtime comparison. The SQL validator still checks only the digest's format, and
    any runtime comparison belongs to held work.
  - The referral family stays out.
  - Nothing here is a policy, an installation or execution readiness.
