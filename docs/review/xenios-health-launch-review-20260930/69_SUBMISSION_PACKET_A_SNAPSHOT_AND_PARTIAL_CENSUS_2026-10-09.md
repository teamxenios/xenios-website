# Submission packet, disposition A: snapshot S and partial census (`SNAPSHOT-S-CENSUS-PACKET-REVIEW-20261009` r1)

**FACTUALLY CORRECT AS PARTIAL.** Proposed S `25858ad` is composed correctly. Every non-records path at S matches the
blob of the latest accepted commit that changed it, so no unreviewed source bytes are present.

The partial census is byte-canonical under the accepted contract. Its 8 rows are all exclusion rows with no readers,
and each exclusion is true at S. The 17 unpopulated relations are honestly absent; none appears as a placeholder.

The census binding keeps the expected digest outside the measured material, appears in no blob at S, and is acyclic.

**One limit matters most.** `25858ad` cannot be the snapshot the complete census measures, and the packet does not
claim it is. Treat it as the implementation base. Its partial census is a format dry run.

**On the proposed order of work:** acceptable with one required amendment. The new snapshot must freeze the five
approved input artifacts together with the implemented code (A-1). Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task acknowledged at `b39905f`.

Method: two read-only lenses, each with an adversarial verifier:
- the census content against the contract;
- the snapshot composition and the order of work.

The verifiers upheld every lens finding, lowered one P2 and added one P2. Artifacts, recomputed:
- the packet (`.md` `145d0d22…`, `.json` `c8bb1979…`, `d007162`);
- the partial census (`5fcbe47b…`, `d007162`);
- the binding (`b6056e18…`, `e6494ba`);
- the review request (`19ed1a4`).

Lens output archived as `hl12/69_packet_A_snapshot_census_lens_findings.json`.

## 1. What holds (recomputed from Git objects)

- **Composition.** History from `3e82154` to S is linear, and each component is at its accepted bytes: application
  (doc 48), decision inputs (`e90d464`, doc 53, and `2d2d958`, doc 58), verifier `935aaf1` (doc 65) and supervisor
  `25858ad` (doc 68). The customer assembly `cad2c4d` (doc 62) is correctly excluded. It shares no paths with S, and
  the Quick Order journey does not use it.
- **Canonical bytes.** No BOM, no trailing newline, printable ASCII only, and the contract's key order. Re-serialising
  the parsed census reproduces it byte for byte. Its relations are strictly increasing by bytes.
- **Exclusion rows.** All eight have the required no-reader shape. Each is true at S. Quick Order code reads none of
  those relations, the server mounts only containment, and referral handling stays declaration-only.
- **No fabrication.** The binding is marked partial and not operational. The complete expected digest, the complete
  census, my disposition and the delivery commit are all null. The complete census at the fixed path does not exist.
- **Acyclic.** The census embeds only S, the binding follows the census commit, and no digest appears anywhere at S.
  `5fcbe47b…` and the historical `4f6c39ac…` must never be admitted as the reader-census digest.

## 2. The order of work

The proposed order:
1. prospective design and exact source scope;
2. your source grant;
3. disabled implementation;
4. a frozen implemented successor;
5. a complete census;
6. separately authorised qualification;
7. installation and activation decisions.

The direction is right. The 17 missing rows need readers that do not exist yet, and the contract requires S to be
frozen before the census. So requiring a census of unwritten code before drafting it would be circular. The order
waives no census. It needs these changes before it is adopted:

- **A-1 (P2): step 4 must freeze the five approved input artifacts at the same S.** The contract (decision-input item
  21, census contract C-9) makes S the snapshot of both the reviewed readers and the five inputs. It requires the
  census, the decision and the publication to share that one S. As written, step 4 freezes only the implemented code.
  The Health legal and configuration artifacts also have no named path, writer or review yet. Sequence your class-4
  decisions and the artifacts' construction and review before the freeze, or state that any later input-bearing commit
  needs a fresh census.

**P3 additions:**
- **Stock predicate first.** Put your stock-predicate decision (any allocatable witness, or sufficient quantity) before
  step 3. It fixes the commit's lock footprint on inventory lots and that census row.
- **An explicit acceptance gate.** Add one for the implemented successor between steps 3 and 4.
- **Census records in the right order.** In step 5: populate at the fixed path with doc 61's M-1 and M-2, then commit
  the census and a separate census binding, then my disposition. The operational receipt and the delivery commit come
  after the decision.
- **Name the comparison source.** Step 1's design must say where the runtime gets the expected census digest, so a
  reader cannot compile it in (doc 61, C-10).
- **Re-derive every row.** All 25 rows, including the 8 exclusions, must be re-derived at the real S. Any change to S
  needs a fresh census.
- **Re-pin and blob-check.** Re-pin the supervisor manifest to the real S, and require blob equality with S at
  qualification and at installation, since later commits will differ from S.

## 3. Other findings (all P3)

- **A-2. The evidence is pinned at the superseded commit.** It names `f98c416` rather than S, although the bytes are
  identical.
- **A-3. Binding field names differ from the contract.** The binding names S as `proposedSourceCommit` rather than
  `sourceCommit`. It also lists the census among the material excluded from measurement, although its hash measures
  exactly that file.
- **A-4. A pinned binding was edited in place.** The historical binding is called "unchanged", yet it was edited
  twice after it was issued, against doc 58 C-7's separate-file practice.
- **A-5. Stale status and lineage.** The binding's source-review status is stale: S was accepted in doc 68 after the
  binding was written. The packet's component list also omits `e90d464` and the chain before `3e82154`.
- **A-6. Two exclusions need explicit dispositions at the real S.** The product-media exclusion rests on a refinement
  of doc 51 that doc 53 accepted only in aggregate. The nonce exclusion's wording will become inaccurate once the
  owner gate checks that table's owner.
- **A-7. A partial digest could pass the format check.** The partial file has a fully contract-valid shape, so its
  digest would pass the format-only decision check. Its partial status lives only outside the file.

## 4. Disposition

- **FACTUALLY CORRECT AS PARTIAL.** No P0 or P1. No packet bytes need revision; carry doc 68's acceptance by overlay.
- **Order of work: acceptable with amendment A-1** and the P3 additions above. It is a proposal for your adoption, not
  a gate the coordinator may adopt silently.
- **CF-11 stays open** until a complete census at the real S is populated, bound and dispositioned.
- **What it enables under existing authority:** the coordinator can amend the records and the proposed order. Nothing
  is accepted for operation.
