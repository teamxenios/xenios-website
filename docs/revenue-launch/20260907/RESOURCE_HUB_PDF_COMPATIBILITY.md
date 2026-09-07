# Resource Hub PDF compatibility receipt

Prepared from completed receipts only; no PDFs were reread and no validator run was repeated.

The unchanged validator accepted the package's **1 of 1 PDF**. A separate fresh Downloads census processed **1,133 file occurrences: 1,034 accepted and 99 refused**, representing **905 unique content hashes**. There were no enumeration, read, or validator errors, and no files changed while being read.

## Source binding

- Function: `validatePdfUpload` in `server/research/resource-hub/service.ts`.
- Requested candidate and package run: `8e125ca7cbd300a7e96e4dbca8f5eca654558bfe`.
- Observed Downloads run HEAD: `0c1ad35c81513a07f5ecbee2fb018c149bd9d52d`.
- Both commits resolve the scanner to Git blob `8a66a45ea0872e8b67bcba3f56cd2d5665ecff8e`.
- Scanner LF SHA-256: `40ad433313f44c64289d42536e1da5acd43593f1f7b9a0a7098e67ad646af789`.
- Scanner bytes stayed unchanged during both runs. This binds the scanner measurement; it does not independently qualify every file in either application tree.

## Scope and results

| Measurement | Package | Fresh Downloads census |
|---|---:|---:|
| PDF file occurrences | 1 | 1,133 |
| Accepted | 1 | 1,034 |
| Refused | 0 | 99 |
| Excluded links/junctions | 0 | 3,830 |

Package observation: `2026-09-07T23:14:16.746Z`. Its PDF SHA-256 is `b88b0bc5df4139d8f7631b3190a72d8abb3e43f5b341d2b93fe636a66544e1bc` (95,599 bytes).

Downloads observation: `2026-09-07T23:19:06.209Z` through `2026-09-07T23:23:16.510Z`. The explicit new rule was every regular case-insensitive `*.pdf` recursively under the founder's `C:/Users/sboad/Downloads`, without traversing symlinks/junctions/reparse links and with no other exclusions. The census visited 64,879 directories and read 1,592,842,819 bytes sequentially. Counts include duplicate bytes at separate paths. Two content hashes had both accepted and refused occurrences because the validator also checks each original basename.

## Existing-policy refusals

| Refusal category | Occurrences |
|---|---:|
| Filename outside the allowed simple-PDF-name policy | 44 |
| File exceeds 15 MiB | 27 |
| Embedded-file feature | 18 |
| OpenAction feature in outer syntax | 7 |
| OpenAction feature in a compressed stream | 2 |
| Encryption | 2 |
| JavaScript feature | 1 |

The 101 reason occurrences overlap across 99 refused files. These are existing intake/format-policy verdicts, not findings that a document is unsafe. No scanning rules or controls were weakened.

## Evidence and limitations

The compact receipt is [RESOURCE_HUB_PDF_COMPATIBILITY_RECEIPT.json](RESOURCE_HUB_PDF_COMPATIBILITY_RECEIPT.json); its SHA-256 is `dc43610a9c49e3e0775a19114529610bee19c84013fa7e456940d18cfaedbab1`. It binds the full external census receipt by hash. The full external receipt retains only ordinals, content hashes, byte sizes, verdicts and reasons. PDF filenames and content were not retained in the evidence. PDFs were neither modified nor uploaded; production and real accounts were untouched.

Original basenames were supplied only in memory, with declared MIME type `application/pdf`. This was not an HTTP upload, human content review, publication approval, security certification, or complete upload/download workflow test. The census is a point-in-time snapshot.

The design's historical 494-file result (483 accepted, 11 refused) and the coordinator's unverified 521-file count have unrelated, unrecorded traversal scope. Neither was reproduced or qualified here; this report measures the fresh explicit rule above.

[RESOURCE_HUB_PDF_COMPATIBILITY_HASHES.json](RESOURCE_HUB_PDF_COMPATIBILITY_HASHES.json) records SHA-256 hashes and byte sizes for this report and the compact receipt, avoiding a self-referential report hash.
