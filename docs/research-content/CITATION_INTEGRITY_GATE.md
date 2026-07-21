---
title: Citation Integrity Gate
type: editorial-control
status: standing gate, required before any Guide publishes
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Citation integrity gate

A standing review control. It exists because the automated checks miss a real defect
class, and we found three live instances of it.

## The three layers, and what each one cannot see

| Layer | Catches | Blind to |
|---|---|---|
| 1. Fabrication scan | Invented PMIDs, NCTs, DOIs, URLs | A real source cited for a claim it does not support |
| 2. Orphan cross-check | A citation in a draft that is absent from its registry | A citation present in the registry but misused |
| 3. **Permitted-use cross-check** | **A claim resting on a source its own registry forbids** | Errors upstream in the research record itself |

Layers 1 and 2 are mechanical and already run. **Layer 3 requires a human reading and
cannot be automated with the tooling we have.** This document defines it.

## The defect: a claim resting on a source its own registry forbids

Every `SOURCE_REGISTRY.md` row carries a permitted-use column stating what that source may
and may not support. A tertiary encyclopedia entry, an unretrieved page, or a vendor page
is recorded so the reader knows it was seen, with its permitted use narrowed accordingly,
often to "documents a gap only" or "carries no claim here".

The defect is a `CLAIM_TABLE.md` row or a `GUIDE_DRAFT.md` sentence that cites such a
source **for a claim its own permitted-use column excludes**.

**Why the mechanical layers pass it cleanly:**

- the identifier is **real**, so the fabrication scan is satisfied
- the source **is** in the registry, so the orphan cross-check is satisfied
- the prose is **hedged**, so a language scan finds nothing assertive

It is only visible by reading the permitted-use column of each weak source against every
row that cites it. Nothing shorter than that finds it.

## The three instances found on 2026-07-21

All three were fixed by **removing the attribution and stating the point unverified**. No
citation was repaired by substituting a better-looking source, which would have converted
a citation defect into a fabrication.

**1. `blends/klow/GUIDE_DRAFT.md`.** The preclinical section asserted GHK-Cu animal
wound-healing findings in named species (rabbits, rats, mice, pigs) with named effects
(increased collagen production, blood vessel formation), resting solely on a tertiary
encyclopedia entry. That source's own registry row stated its cited animal findings
"carry no claim here".

The sharpest signal: **the sibling packet `bpc-157-tb-500-ghk-cu` handled the identical
source correctly** and declined to publish those figures. The corpus disagreed with
itself about the same source, which is exactly the kind of inconsistency that survives
review when each packet is read alone.

**2. `blends/klow/CLAIM_TABLE.md`, row KLOW-R-07.** The same tertiary entry was cited for
a regulatory claim about approval and compounding status. A general encyclopedia entry
supports nothing regulatory.

**3. `blends/thymosin-alpha-1-kpv-ll-37/CLAIM_TABLE.md`, row BL-R-01.** A claim that the
three-component combination is not an approved medicine in any jurisdiction cited an FDA
meeting-materials page that **returned HTTP 404 and was never read**. A page nobody
retrieved cannot support a claim about what it says.

## The gate

Before any Guide leaves review, a named human performs this check and signs for it.

1. **List every weak source** in the packet's `SOURCE_REGISTRY.md`. A source is weak if
   its kind is tertiary (encyclopedia, aggregator), or its retrieval status is NOT
   RETRIEVED, 404, or UNVERIFIED, or it is a vendor, retailer, manufacturer, or forum page.
2. **For each weak source, read its permitted-use column.** Note precisely what it may
   support. Usually the answer is "documents a gap only".
3. **Find every citation of that source** across `CLAIM_TABLE.md`, `GUIDE_DRAFT.md`,
   `CONTRADICTIONS.md`, `REGULATORY_STATUS.md`, and `QUALITY_AND_DOCUMENTATION.md`.
4. **Confirm each citation stays inside the permitted use.** A weak source may appear
   only to document a gap (grade G), or inside a PROHIBITED row, or as an attributed
   market claim at grade E.
5. **Where a citation exceeds permitted use, remove the attribution and state the point
   unverified.** Do not substitute a different source to keep the sentence. If the claim
   cannot stand without an impermissible source, the claim goes, not the caveat.
6. **Check cross-packet consistency.** Where the same source appears in more than one
   packet, confirm every packet treats it the same way. A disagreement between packets
   means at least one is wrong.
7. **Record the outcome** in the packet's correction history with a version bump.

## What this gate does not cover

**Errors upstream in the research record.** If a research JSON records a source's
metadata incorrectly, a Guide faithfully reproducing that record inherits the error and
this gate will not catch it, because the Guide is internally consistent.

One live example: a source cited as `PMID 27186127, J Exp Pharmacol 2012` carries a year
inconsistent with that PMID range. The Guide reproduces the research record faithfully, so
the defect is upstream. It was deliberately left rather than "corrected" by guessing,
because inventing a plausible year is the exact failure this whole control set exists to
prevent.

**Resolving it requires opening the source**, which is the separate per-citation human
verification step in every packet's editorial checklist. That step remains mandatory and
is not replaced by this gate.

## Where this is enforced

- Every `EDITORIAL_REVIEW_CHECKLIST.md` carries the per-citation verification requirement.
- This gate is an additional named step in the claims review role.
- It fails closed: an unchecked box blocks publication, and there is no partial publish.
