# Submission packet, disposition B: input applicability (`SNAPSHOT-S-CENSUS-PACKET-REVIEW-20261009` r1)

**INPUT MAP FACTUALLY CORRECT, WITH LIMITS.** Every identity, raw SHA-256, size, count and lineage claim in the
specialist's map recomputes from Git objects at the proposed snapshot S, `25858ad`, and is byte-identical at the
previous snapshot `f98c416`.

The map and the packet keep four things separate: identity, historical approval, currentness, and Health Quick Order
applicability. They choose no legal term, quantity, region, audience or commercial policy. They present no candidate
row as an approved offer, and they treat no Research approval as Health approval.

Three corrections should reach the records before you are asked to decide anything (B-1 to B-3). None needs new
analysis. No P0 or P1. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task acknowledged at `b39905f`. Method: one read-only lens with an
adversarial verifier, which upheld the lens and added one P2. I confirmed that P2 myself from the reconciliation file's
history. Artifacts: the specialist map (`.md` `92e61b6c…`, `.json` `c31966bb…`, coordinator `2bac0c8`), its result
record, the decision packet (`d007162`) and the existing register `RECOVERY_DECISIONS_20261007.md`. Lens output
archived as `hl12/70_packet_B_inputs_lens_findings.json`.

## 1. The five inputs

| Input | Identity at S | Historical approval | Currentness | Health Quick Order applicability | What remains |
| --- | --- | --- | --- | --- | --- |
| Catalog | `member-safe-master-offerings.generated.json`, raw `09bfb1d1…`; 424 canonical rows from 426 workbook rows | Research catalog provenance, through the 21 August founder reconciliation | Generated 1 October; no live or deployed readback | Not approved. Current Quick Order projection code admits at most 23 rows by family: 20 supplements and 3 topicals | Your decision on which offers; a source change for any row outside the 23 (B-2) |
| Bindings | `master-offering-bindings.generated.json`, raw `f2df5364…`; 415 bound and 9 unbound, covering all 424 rows exactly | A reviewed predecessor subset, with readback on 15 August | No current readback | Not approved. The 9 unbound rows are refused by the validator and by the projection | Technical: those 9 have no identity. A refreshed readback. Your choice of which bound rows apply |
| Reconciliation | `master-catalog-reconciliation-20260821.json`, raw `d63eade1…` (from `9c3358b`, 1 October) | Your 21 August decision covers the version at `e1a0d05` (`8ee32f7e…`). The 1 October version adds only a 4-line identity annotation for GRP-0422; every price is identical | The lineage matches the catalog and bindings bytes at S | Lineage compatible; applicability not yet approved | Technical binding as the reconciliation artifact; the B-3 records correction |
| Health legal | **No Health legal artifact exists.** Research sources exist, including XR-LEGAL-06 and XR-LEGAL-13, hash-pinned twice | Research package v1.0, effective 22 July (counsel letters not opened) | Unchanged since import | Not adopted for Health. The adapter serves only `early_access_terms/v1`, and only once it is in the approved Health pairs, which stay empty until you approve | Your (or counsel's) decision on applicability and the complete required set; the artifact's content schema must be defined (B-1) |
| Configuration | **No configuration artifact exists.** Related Research records are restrictive or historical | None | None | None supplies Quick Order offer rules | A missing artifact, plus your decisions on offers, workflows, quantity bands, audience subset, regions, effectivity, and stock, revocation and refusal policy |

The nine unbound rows split into 1 shipping service, 2 quote-only and 6 pending binding (GRP-0421 to GRP-0426). All
nine are also refused by current code: seven as research-only, and two as non-merchandise.

## 2. Findings (verified)

**P2, correct in the records before you are asked:**
- **B-1. One required legal document is missing from the candidates.** The Health legal candidates show XR-LEGAL-06
  and XR-LEGAL-13 but leave out XR-LEGAL-14, the other required checkout document. The package rules refuse a
  designation that drops a required document of its stage. List every required document per stage with its hash.
- **B-2. The offer question omits a code limit.** Current projection code admits at most 23 of the 424 rows by family.
  Choosing a Health offer from the 503A or research families therefore needs a separately scoped source change, not
  just a value. Say so in the offer question.
- **B-3. Approval is attached to the wrong bytes.** The records attach your 21 August reconciliation approval directly
  to the S bytes. Record the S identity (`d63eade1`, `9c3358b`) separately from the approved content (`8ee32f7e`,
  `e1a0d05`), and state that the only difference is an engineering identity annotation.

**P3:**
- **B-4. GRP-0365 is non-merchandise.** It sits in the shipping-and-fulfilment family, so a quote workflow for it
  would also need a pathway-authority change.
- **B-5. The Health legal status labels differ.** Harmonise them to: "Research sources exist; the Health legal
  artifact is missing and needs an owner".
- **B-6. The register additions are thin.** They duplicate no question, but they carry no recommendation or
  consequence, and they are whitespace-collapsed. Update the existing offer and native rows instead.
- **B-7. Agreement identifiers are capped at 64 characters.** Carry doc 53's CF-9: an identifier of 65 to 128
  characters needs a reviewed schema change and must never be truncated.
- **B-8. The catalog and bindings are paired only indirectly.** When the decision is constructed, bind both hashes
  together.
- **B-9. Two construction limits are missing.** The reference grammar, and the 32-entry cap on references across the
  whole publication.
- **B-10. Quantity is capped at 100 by source.** The catalog quantity band is fixed at 1 to 100 in source, so any
  Health maximum above 100 has no effect without a source change.
- **B-11. A draft supplement acknowledgment exists.** XR-COM-015 is draft and not reviewed. Mention it to counsel as
  information only; it is not a candidate.

## 3. Disposition

- **INPUT MAP FACTUALLY CORRECT, WITH LIMITS.** No P0 or P1. A records-only amendment for B-1 to B-3 should precede the
  questions to you.
- **What this enables under existing authority:** the coordinator can correct the records and present the questions.
  Nothing is bound or approved by this review.
- **Your decisions, from the existing register (class 4):**
  1. Which Health offers, within the 23 family-eligible rows or with an explicit source change.
  2. The complete Health legal set and its applicability, with counsel.
  3. Workflows, quantity bands (at most 100 under current source), audience subset, regions and effectivity.
  4. Stock, revocation and refusal policy.
- **Engineering, not yours:** construct the configuration and Health legal artifacts once their content schemas are
  defined in the source scope (disposition C), bind the reconciliation, and refresh the bindings readback.
