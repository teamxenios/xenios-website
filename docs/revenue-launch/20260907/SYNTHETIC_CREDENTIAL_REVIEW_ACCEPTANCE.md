# Independent acceptance of reviewed synthetic credential handling

ASTRA-B accepted the implementation and exact synthetic/local disposition at
`62336a8e0c05eb4d3804cc7e75593aaa4a5246ee`, tree
`a33649f2f27c3178830a8c5994fc43330780a612`, on 2026-09-07. A recorded this
acceptance before changing the registry status from PENDING to ACCEPTED.

B independently ran Node 20.19.0 with:

```text
node --test --test-concurrency=1 scripts/acceptance/reviewed-credential-fixtures.node-test.mjs scripts/acceptance/verify-release-diff-scan.node-test.mjs
```

Result: **35 passed, zero failed or skipped**, duration 6040.9945 ms. A's
separate fixture-only run passed 27 tests. These overlapping counts are not
added together. The actual scanner and strict wrapper both rejected one new
unreviewed generic match while all 102 reviewed occurrences remained valid:
103 raw, 102 reviewed, one unresolved. Synthetic PII inputs in these tests
verify the checker; they are not the required release PII corpus.

B verified immutable Git reads, exact source and candidate file hashes,
20 files / 102 occurrences / 98 unique path-and-line keys, context multiset
equality, generic-only classification, stronger detectors, unchanged legacy
exemptions, explicit raw/reviewed/unresolved counts and fail-closed errors.
All seven reviewed files matched the frozen Git blobs after the tests.

| Reviewed file | LF SHA-256 at the reviewed commit |
| --- | --- |
| Scanner | `ee64fe06000d8384feab4eafd48dbc1f488e52bdb68df35592304c190e003907` |
| Fixture loader | `c386efc31e0703ebd67ac7b3c9bb765c3c675823e31f49b2f6f37ede219fdd47` |
| Fixture tests | `9f8d657b566650f639152a4e98a0a368568f2bb4d80311c8aef082ae2cd133f3` |
| Registry with PENDING status | `adb105e828f56459b1c905b661940e69b87df663679dac51fa9ac8519b20eb74` |
| Context disposition report | `45155077171437fa59fd2ffb92a28b19fb484390cb5c930de899115d3bbe69d0` |

The ACCEPTED registry has a new digest. The actual release scan must bind its
final candidate and print that digest. B's acceptance is limited to this
implementation and disposition; it is not an overall secret/PII gate pass,
migration qualification, or production authorization. The real approved
external PII source remains required.
