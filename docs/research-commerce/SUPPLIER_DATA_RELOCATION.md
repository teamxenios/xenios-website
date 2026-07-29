# Supplier data relocation notice

Date: 2026-07-29. Task: XCA-W12-SUPPLIER-RELOCATION, executed under Samuel
Boadu's standing release authorization, item 9 (supplier cost data relocation),
recorded at `docs/phase2/SAMUEL_STANDING_RELEASE_AUTHORIZATION.md` on branch
`claude/xca-20260729T0302Z/standing-authorization`.

Four documents that carried the supplier's legal identity, the signer's name,
or signed per-SKU pricing facts were removed from this repository (which is
PUBLIC) and relocated byte-for-byte to the PRIVATE operations repository
`teamxenios/xenios-private-operations`, under `supplier/`, together with a
`PROVENANCE.md` recording source commit and hashes.

Relocated files (former path in this repo, SHA-256 of the relocated copy).
Hashing basis: sha256 over the canonical git blob content (LF form) at source
commit ca52b824158a51eff6d0b0b4d6abc202b1b90a05, reproducible with
`git show ca52b824158a51eff6d0b0b4d6abc202b1b90a05:<path> | sha256sum`.
Do not hash a Windows CRLF working-copy checkout; it yields different values.

| Former path | SHA-256 (git blob, LF) |
| --- | --- |
| docs/research-commerce/signed-supplier-master-facts.json | 0cec31914260e1c237e67754d250295197e9d20a5782a628e06cd7dc57acdb3a |
| docs/research-commerce/SIGNED_SUPPLIER_MASTER_INTAKE.md | 54999b25e19db712631af6675eaf341d259fa972171fae5b999fb2c12379a701 |
| docs/research-commerce/PER_SKU_GATE_REPORT.json | e1113af9a11c52a0412c860b1953a6f265b6388cfd18e813d16b28cb96cb1cf6 |
| docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md | 26d9a74981b6dcbd514864820e0b0c0edc12adb46ba2aa18d1cf56e78e0a078e |

What stayed, and why: `SUPPLIER_FACT_RECONCILIATION.md`,
`SUPPLIER_FACT_RECONCILIATION_FINAL.md`, `SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md`,
`COMMERCE_SUPREME_AUDIT.md`, `API_CONTRACTS_COMMERCE.md`, and
`OPEN_DECISIONS.md` were scanned (count-only) for the supplier's legal name,
brand tokens, and the signer's name: zero hits. The numeric values they contain
are the already-public catalog prices (identical values ship in
`server/research/products-data.ts`), not internal cost basis.

Operational facts that remain true and are safe to state here: per-SKU purchase
eligibility is 0 of 15 (no COAs on file), and the per-SKU gate matrix plus the
eligibility summary now live in the private operations repository.

History note: the relocated files remain reachable in this repository's git
history. History rewrite was NOT performed (assessment only, per the
authorization). See the relocation PR for the residual-exposure assessment.
