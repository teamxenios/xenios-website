---
title: "NAD+ Source Plan"
type: source-plan
compound: nad-plus
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source Plan: NAD+ and its precursors (NR, NMN)

This document records how the evidence for this Guide was gathered on 2026-07-19, what was
deliberately excluded, and what a human reviewer must still retrieve before publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The scoping decision that governs everything below

"NAD+" is not one intervention. It is at least three, and they do not share an evidence base.
The search was structured to keep them apart, and the Guide must keep them apart too.

| Lane | What it is | Regulatory shape | Evidence density found |
|---|---|---|---|
| 1. Oral precursors | Nicotinamide riboside (NR), nicotinamide mononucleotide (NMN), nicotinamide (NAM), niacin, NADH | Dietary supplement / dietary ingredient | Three retrieved systematic reviews of randomized human trials |
| 2. Intravenous NAD+ | The intact molecule delivered by infusion, typically at wellness clinics | Compounded drug product, not an approved drug | Two retrieved human studies, neither an efficacy trial |
| 3. Injectable and intranasal NAD+ | Subcutaneous, intramuscular, nasal spray | Compounding pharmacies, peptide vendors, research chemical channels | No human evidence retrieved at all |

House rule carried into every other file: precursor data is never presented as evidence for
IV or injectable NAD+. The oral NR and NMN trial literature says nothing about what an
infusion of intact NAD+ does in a person.

## Databases and registries consulted

| Source system | Status this session | Notes |
|---|---|---|
| PubMed / PubMed Central | Consulted successfully | All six peer-reviewed sources in the registry came from here and were read via WebFetch |
| FDA (fda.gov) | Consulted, retrieval FAILED | Every WebFetch to an fda.gov URL returned HTTP 404, across at least six distinct pages. FDA content is known only from domain-restricted search snippets |
| WADA (wada-ama.org) | Consulted, retrieval FAILED | The 2026 Prohibited List PDF and the list page both returned empty content to WebFetch. Only the general S0 definition was obtained, via a domain-restricted search |
| ClinicalTrials.gov | Consulted, query FAILED | The API returned HTTP 400 on two attempts with different field syntax. A third broader query returned mostly irrelevant results matched on incidental text. No reliable trial census exists for this Guide |
| medRxiv | Consulted, retrieval FAILED | The most directly relevant randomized IV comparison returned HTTP 403 and was not read |
| Secondary legal and trade analysis | Consulted successfully | Used only where FDA primaries were unreachable, and marked as secondary everywhere it appears |

## Query lines used

Searches were run along these lines, and refined by route because route is the analytic axis
of this compound.

- Oral precursor efficacy: NMN randomized controlled trial meta-analysis; nicotinamide
  riboside randomized trial; NAD precursor systematic review; NMN glucose lipid metabolism;
  NMN NR skeletal muscle mass function meta-analysis.
- Oral precursor safety and tolerability: NAD supplementation safety systematic review;
  NADH supplementation adverse events.
- Intravenous route specifically: intravenous NAD+ infusion human pharmacokinetics;
  IV NAD+ tolerability; IV NAD+ versus IV nicotinamide riboside.
- Injectable and intranasal routes: subcutaneous NAD+ human study; intramuscular NAD+ trial;
  NAD nasal spray human evidence. These returned nothing usable, which is itself a finding.
- Product quality and identity: NMN supplement label claim analysis; NMN content testing.
- Regulatory: FDA NMN dietary supplement determination; FDA 503A bulk drug substances
  significant safety risks; FDA 503B bulks list; FDA warning letter NAD injection; FDA recall
  NAD+ injection endotoxin; WADA 2026 prohibited list NAD NMN nicotinamide riboside.

## Inclusion criteria

A source was eligible to support a member-facing claim only if all of the following held.

1. It was actually retrieved this session, by WebSearch or WebFetch, and its content was read.
2. It is peer-reviewed human research, an official regulatory record, or (where a regulatory
   primary could not be reached) a clearly attributed secondary legal or trade analysis of a
   specific dated regulatory action.
3. Its route of administration is identifiable, so the claim can be bound to the correct lane.
4. Its population is identifiable, so the claim can be bound to the population it came from.

## Exclusion criteria

The following were excluded, and the exclusions matter more than usual for this compound
because the consumer marketing around it is dense.

- Vendor, retailer, manufacturer, and clinic pages as evidence for anything. Several were
  encountered. None are cited as evidence. Where a vendor claim is relevant it is recorded as
  a market claim, at grade E or G, never as a finding.
- Testing-laboratory blogs and supplement-industry blogs asserting regulatory facts. Two such
  pages asserted that NAD+ and NMN are absent from the WADA Prohibited List. Both were
  rejected. A regulatory claim requires a regulatory source.
- Anecdote, testimonial, podcast, and press summaries used as a substitute for a study.
- Any study whose route could not be determined, since route is the whole analysis here.
- Background knowledge used to fill an empty table. This is the reason the preclinical
  evidence table for this compound is empty rather than populated. The sirtuin and NAD-decline
  aging literature in yeast, worms, and rodents is extensive, but no primary preclinical study
  was retrieved this session, and citing one from memory would risk a fabricated identifier.
  An honest empty table is the correct output.

## What was deliberately not attempted

- Drug interaction, contraindication, and pregnancy searches were not run for any route.
  No one should read the silence in this Guide as evidence of absence of risk.
- No search was run on NAD+ nasal sprays specifically, despite these being a live consumer
  product category.
- No preclinical retrieval was attempted. If the Guide needs a mechanism section grounded in
  animal work, that is a separate, targeted retrieval task with its own source plan.

## Outstanding retrievals for the human reviewer

Ranked by how much each one changes the Guide.

1. The medRxiv randomized placebo-controlled pilot comparing acute IV products in healthy
   adults (DOI 10.1101/2024.06.06.24308565). Returned HTTP 403. This appears to be the most
   directly relevant randomized IV comparison available. It is a preprint, not peer reviewed,
   and the product naming suggests industry sponsorship, so it needs retrieval and
   conflict-of-interest scrutiny together.
2. All FDA primary pages listed in SOURCE_REGISTRY.md. Nothing FDA-attributed may be published
   until a human opens these URLs directly and confirms both the current status and the exact
   wording. This includes the 503A category listing, the 503B ineligibility, both 2026 warning
   letters, and the sterile compounding reminder.
3. The FDA determination letters of 29 September 2025 on NMN. The reversal is currently
   sourced to a law firm client alert, corroborated by trade headlines. No FDA language is
   quoted verbatim anywhere in this Guide because the letters were not read.
4. The WADA 2026 Prohibited List, full text, searched by term for NAD, NAD+, NMN, and
   nicotinamide riboside. No athlete-facing statement may be published before this is done.
   The S0 catch-all for non-approved substances means an unapproved injectable form could
   plausibly fall inside the List whether or not the substance is named.
5. A manual ClinicalTrials.gov search, since no reliable registered-trial census exists for
   this Guide. Two registrations surfaced incidentally and were not verified. They are not
   cited and must not be cited without a human checking their intervention details.
6. The FDA enforcement record behind the Class I recall, to confirm or drop the reported
   patient-harm detail, which currently rests on a secondary summary.
7. A dedicated search on interactions, contraindications, pregnancy, and use in people with a
   history of cancer. The one retrieved IV study excluded people with a personal or family
   cancer history and did not explain why. That exclusion is a signal worth a reviewer's
   attention, and it means the retrieved safety data does not cover that population.

## Reviewer sign-off gate

This Guide may not move out of draft until items 1 through 4 above are closed, or until every
claim depending on them is removed from the member-facing surface.
