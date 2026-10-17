# KAN-31 Doc455 SQL source-identity successor: changed literals only

**ACCEPTED.** The DB-owner successor (10,836 B, SHA-256 `a58aace0d6a9e94de278cab85f6fc258d1db71d6305a9a55eb0973bbd6c4364e`)
differs from the Doc 212-accepted template (`6a4a66e4859767734c23dd4853c0f395699b203966ccc6e13e130cefc049726f`) only
in its source identity, now `8efa9a9e…` / `0c92fdc6…`.

- **What this is not.** Not SQL execution authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. The request came from KAN-31 comment 10088.

## Re-derivation

I took the frozen template from Root `c0278ba7` and applied exactly the two stated replacements:

- line 16: `source_sha` `e33c12a9…` becomes `8efa9a9ef4e94773c446e7fa2a17cf00c6592d85`;
- line 17: `source_tree` `ab4415f0…` becomes `0c92fdc66b122c5128d3904936c85ba9c912a5cc`.

The result is **byte-identical** to the stated successor: 10,836 B, `a58aace0…`. `diff` shows only those two lines.

- **Nothing else changed.** All logic, gates, vectors, roles, limits and output flags are unchanged, so Doc 212's
  findings and executable conditions carry over.
- **Consistent with the harness.** The source identity now matches the anonymous harness `APP_SHA` and `APP_TREE`
  (Doc 223), so the envelope's `source_sha` gate can pass.
- **Snapshot ordering.** Comment 10088 places the snapshot **after** settled browser receipts and **before** any staff
  read. That matches Doc 208 and Doc 212.

## Still required, per Doc 212

- the actual executor role against the `postgres` literal;
- the version pin;
- the populated query with its hash;
- separate SQL approval;
- negative controls, separately authorized.

NOT LIVE.
