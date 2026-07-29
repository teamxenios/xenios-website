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

Relocated files (former path in this repo, SHA-256 of the relocated copy):

| Former path | SHA-256 |
| --- | --- |
| docs/research-commerce/signed-supplier-master-facts.json | cc2e6b3f4e1f8fb2851438cf84953d7526c151d6b22922631bb979413fd409aa |
| docs/research-commerce/SIGNED_SUPPLIER_MASTER_INTAKE.md | 1237a3ff734df94114f1864654467b1872a893cb72fbb31477adce691700b2bd |
| docs/research-commerce/PER_SKU_GATE_REPORT.json | 250a694a656f2fb4e28c1238596b58f11909a86e3732fbb4df0743b00c4839ce |
| docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md | 25ebdd770f7b3f6120421e4fb53123855251438d548a41d60c6fbbf6e095dbb5 |

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
