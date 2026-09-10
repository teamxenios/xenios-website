# Managed recovery projection prerequisite

Parent: `792f34ba264ae82ad2fa78a58db127c0f101ce73`.
This corrects a concrete managed-boundary defect, not a new recovery scheduler,
provider activation, migration or production operation.

Previously discovery coerced null to an empty page, accepted a singleton in
place of an array, and discarded uninterpretable rows. The common managed
mapper also supplied null for missing first-attempt timestamps. The pure mapper
and in-memory references are preserved; managed reads now require the complete
selected projection before mapping. Safe positive money, identities, operation
keys, timestamp precision and provider-result shapes are checked without
inventing defaults. Canonical decimal bigint strings remain supported within
JavaScript's safe range. Additional SQL columns are allowed.

Member/request, provider-reference and transition execution identities are
rechecked. A malformed replay result remains uncertain, not a definitive
conflict that could justify compensating a possibly committed execution.
Transition arrays cannot silently select the first ambiguous row.

Discovery requires an actual bounded array and validates every row before the
sweep can act. Invalid/mixed, unordered, duplicate, terminal or out-of-horizon
pages refuse as a whole. Cursor timestamps keep all six PostgreSQL fractional
digits, including equivalent timezone spellings. An explicit [] alone means
empty discovery. Read errors remain errors. No payment operation was added.

Main authored runtime; `/root/product_review_filters` authored regression tests
and only completed the old managed fixture's SQL-generated fields. All 32 old
tests passed in the before run. Main added four final ambiguous/foreign
transition cases, read the full changed tests and controlled the broad run.
`/root/native_finish_review` independently accepted the final exact two-file
source delta; this is source acceptance, not managed-environment qualification.

| Actual check | Result |
| --- | --- |
| New regressions against unchanged runtime | 373 total: 87 passed, 286 failed, exit 1; failure preserved. |
| First corrected focused run | 373 passed, zero failed, exit 0. |
| Final broader commerce and policy run, including four added transition cases | 1,905 passed, three skipped, zero failed; exit 0. |
| Final typecheck | Exit 0; tool receipt f5b0b3. |
| Final build | Exit 0; 2,299 client modules; existing warnings retained. |

Pinned Node 20.19.0, TypeScript 5.6.3 and Vitest 4.1.10. One test/build run at a
time. No full suite is relabeled as this source.

Final runtime LF SHA-256: `f7830e67b007b9d8bdd16fc6fc815ad754e62a2e83bcf8c5dcaa41fe1747b017`.
Final test LF SHA-256: `67ad3c7d8b7a19e6e3c458812f4beff4db53c39a26b95a24b439cc0ab3bde652`.
External receipts under `C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`:

- `recovery-projection-before.json`: `1b0766839dfd6976d6ba025b8c1a4fae9e4f41329493ffcff4e6d4da30741c92`.
- `recovery-projection-after.json`: `06cd997e14bbce7d537ebfdff5b161717e68f8c6fa4ec699ed0bfca213a65446`.
- `commerce-recovery-projection-final.json`: `368012a9a579517ebecf3b7eccdd33a1cd2b1aa2a5e3073d2a768e84e0297780`.
- `build-recovery-projection.log`: `1f34476ae84999b70245145697beb489270fe37b60f250c6d8db58f04baa555d`.

Next: implement durable unattended recovery intent/outcome/cursor ownership.
No general job/checkpoint authority was found in tracked source; the existing
idempotency once() is not a safe substitute. Preserve canonical financial
authority and qualify recovery effects separately. Managed staging SQL access,
checkout-specific synthetic/provider configuration and authorized effects still
gate connected qualification. No migrations, provider calls, notifications,
deployment or activation occurred. The full platform goal remains incomplete.
