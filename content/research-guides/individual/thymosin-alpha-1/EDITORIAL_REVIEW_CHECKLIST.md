---
title: "Thymosin Alpha-1: Editorial Review Checklist"
type: research-guide-review-gate
compound: thymosin-alpha-1
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Thymosin Alpha-1: Editorial Review Checklist

**This is a publication gate. Every box below starts unchecked and must be checked by a named
human before any file in this folder reaches a member-facing surface.**

**AI drafts never publish automatically.** No automated process, scheduled job, deployment
pipeline, or agent may move any file in this folder from `workflow_state: draft` to published.
The transition requires a named human reviewer in each role below, a date, and a signature line
filled in.

Files covered by this gate:

- `GUIDE_DRAFT.md`
- `FAQ_DRAFT.md`
- `QUALITY_AND_DOCUMENTATION.md`

---

## Section A. Content safety

- [ ] A1. No dosing anywhere. No amounts, mg, mcg, IU, mL, units, concentrations, frequency,
      timing, cycle length, titration, loading, stacking, reconstitution, injection technique,
      or route of administration appears in any file.
- [ ] A2. Where a reader would expect dosing, the exact sentence "Dosing and administration
      information is intentionally excluded from Xenios Research Guides." appears instead.
- [ ] A3. No treatment directions, protocols, or regimens. Nothing in any file could be
      followed as instructions.
- [ ] A4. No sourcing or acquisition guidance. No supplier, vendor, marketplace, pharmacy, or
      purchase route is named or hinted at.
- [ ] A5. No medical advice, no diagnosis, no self-treatment framing.
- [ ] A6. The phrase "research use only" does not appear as a device to imply human benefit.

## Section B. Outcome and benefit claims

- [ ] B1. No guaranteed outcomes. The words "will", "proven to", "restores", "cures",
      "eliminates", and "reverses" do not appear as claims about what this compound does.
- [ ] B2. Every efficacy statement uses permitted framing: "has been studied for", "reported
      in", "investigated as", or "associated with in [named population]".
- [ ] B3. Every efficacy statement names the population it applies to, and no statement about
      a seriously ill trial population is written in a way that reads as applying to healthy
      adults.
- [ ] B4. The null result of the 2025 phase 3 sepsis trial leads the evidence discussion, and
      the 2013 single-blind trial is never presented without it.
- [ ] B5. No subgroup finding is presented as evidence of benefit, including the low-flow
      oxygen subgroup in the COVID-19 pilot and the age and diabetes subgroups in the phase 3
      sepsis trial.
- [ ] B6. No biomarker change is presented as a clinical outcome. The biomarker versus outcome
      distinction is explicit wherever a biomarker is reported.

## Section C. Safety claims

- [ ] C1. No unsupported safety claims. The words "safe", "well tolerated", and "no side
      effects" do not appear as general statements of fact about this compound.
- [ ] C2. Every safety statement carries the setting it came from (short-term, acutely ill,
      medically supervised, pharmaceutical-grade product).
- [ ] C3. The absence of long-term elective-use safety data in healthy adults is stated
      explicitly as a gap, not implied by silence.
- [ ] C4. The manufacturer-derived tolerability characterisation is labelled as
      manufacturer-derived and graded E, and is not repeated as independent evidence.
- [ ] C5. The immunosuppression and transplant contraindication is present and prominent.
- [ ] C6. The interactions section is framed as categories requiring professional review, and
      does not assert established interactions that were not retrieved.

## Section D. Preclinical and species labelling

- [ ] D1. Every preclinical or mechanistic finding carries its species or model in the same
      sentence as the finding. No bare mechanism sentence reads as human fact.
- [ ] D2. The preclinical section correctly states that no primary preclinical study was
      retrieved, and does not imply that none exists.
- [ ] D3. The proposed mechanism section is labelled as proposed throughout, with hedging
      intact, and the receptor-level attribution carries the exact marker
      "[UNVERIFIED - background knowledge, requires human source check]".
- [ ] D4. No finding about thymosin beta-4 or TB-500 is presented anywhere as a finding about
      thymosin alpha-1.

## Section E. Citation integrity

- [ ] E1. Every citation has been independently opened and confirmed by a named human
      reviewer. This is the single highest-risk item on this checklist.
- [ ] E2. Every PMID, DOI, NCT number, journal name, author list, and year has been checked
      character by character against the actual source.
- [ ] E3. Every URL resolves to the source it is attributed to.
- [ ] E4. No citation was reconstructed from memory or inferred. Any citation that cannot be
      opened is removed and logged as a gap rather than published.
- [ ] E5. Every reported number (percentages, hazard ratios, risk ratios, odds ratios,
      confidence intervals, p-values, sample sizes, I-squared) has been checked against the
      source.
- [ ] E6. The Cochrane record is correctly described as a protocol only with no pooled
      results, and no effect estimate is attributed to it. If a completed review has since been
      published, it has been retrieved and the Guide updated.
- [ ] E7. Every source in the References section is marked VERIFIED with the retrieval date
      and the exact retrieved URL.
- [ ] E8. Sources that could not be retrieved appear only in the gaps list and support no
      claim anywhere in any file.

## Section F. Claim grades

- [ ] F1. Every graded claim carries a grade from the approved scale (A, B, C, D, E, F, G,
      PROHIBITED), and grades are applied to individual claims rather than to the compound as
      a whole.
- [ ] F2. Each grade has been checked against the retrieved evidence supporting that specific
      claim, and grading errs conservative where there is doubt.
- [ ] F3. Any claim of benefit in healthy adults is graded G, because no retrieved study
      addresses healthy adults.
- [ ] F4. Any claim of mortality benefit in sepsis is marked PROHIBITED as a benefit claim.
- [ ] F5. No claim graded PROHIBITED appears on any member-facing surface.

## Section G. Regulatory status

- [ ] G1. Every regulatory statement carries a date, a jurisdiction, and a source URL.
- [ ] G2. The regulatory section has been re-verified against primary regulatory sources
      immediately before publication, not relied on from the 2026-07-19 research date. The
      draft's own statements rest on secondary reporting because every fda.gov URL returned an
      HTTP 404 error during research.
- [ ] G3. The `last_reviewed` date in every file's frontmatter has been updated to the actual
      re-verification date, and the dates inside the regulatory section match it.
- [ ] G4. The current United States compounding status has been confirmed against primary
      sources. This is flagged as unsettled in the draft and could directly influence a
      purchasing decision if stated wrongly.
- [ ] G5. The distinction between approval in another country and United States approval is
      stated explicitly and is not blurred anywhere.
- [ ] G6. Orphan drug designation is stated as a development incentive and never as approval,
      and no designation number or date is published without a retrieved primary record.
- [ ] G7. No World Anti-Doping Agency status claim appears anywhere, and athletes are directed
      to check the current Prohibited List or their anti-doping authority directly.
- [ ] G8. Vendor assertions about a February 2026 reclassification appear only as unverified
      commercial claims being corrected, never as fact.

## Section H. House style and tone

- [ ] H1. Zero em dashes in any file.
- [ ] H2. Plain, direct English. Every technical term is glossed the first time it appears.
- [ ] H3. Calm and premium tone. No hype, no sales language, no flattery, no exclamation
      marks.
- [ ] H4. Original wording throughout. No text copied or lightly paraphrased from competitor,
      retailer, manufacturer, or any other source. Verified by a human reviewer, including
      spot checks against the cited sources.
- [ ] H5. Section order in the Guide matches the required structure.

## Section I. Disclosure and quality position

- [ ] I1. The Guide states clearly that it is not medical advice and not a recommendation.
- [ ] I2. `QUALITY_AND_DOCUMENTATION.md` accurately states that Xenios has confirmed nothing
      for this compound and that every checklist item is unmet.
- [ ] I3. The FAQ answer on availability from Xenios is accurate as of the publication date.
- [ ] I4. Research limitations are disclosed to the reader, including the failure to retrieve
      any primary regulatory document.
- [ ] I5. Correction history is present, seeded, and dated, and will be appended to on every
      subsequent change.
- [ ] I6. Every file's frontmatter `status` and `workflow_state` has been advanced
      deliberately by a named human, not by an automated process.

---

## Named reviewer sign-off

No file publishes until all five roles are signed. A blank line is a blocking condition.

### Scientific review

Confirms Sections B, D, E, and F. Confirms that every evidence statement is supported by the
retrieved source, that species labelling is intact, and that the null result is correctly
weighted.

- [ ] Signed off
- Reviewer name: _______________________
- Date: _______________________
- Notes: _______________________

### Claims review

Confirms Sections A, B, C, and F. Confirms that no dosing, no guaranteed outcome, no
unsupported safety claim, and no prohibited claim appears on any member-facing surface.

- [ ] Signed off
- Reviewer name: _______________________
- Date: _______________________
- Notes: _______________________

### Quality review

Confirms Section I2 and the whole of `QUALITY_AND_DOCUMENTATION.md`. Confirms that the
unmet-item status is accurate and that no supplier documentation has been silently accepted.

- [ ] Signed off
- Reviewer name: _______________________
- Date: _______________________
- Notes: _______________________

### Legal review

Confirms Section G in full, plus Sections A4 and I. Confirms the current jurisdiction-specific
regulatory position on the actual publication date, and confirms no statement could be read as
an offer, an availability signal, or acquisition guidance.

- [ ] Signed off
- Reviewer name: _______________________
- Date: _______________________
- Notes: _______________________

### Founder review

Final gate. Confirms the Guide reads as honest, calm, and in house voice, and that a member
finishing it would trust Xenios because it told them the truth, including where the truth is
that very little is known.

- [ ] Signed off
- Reviewer name: _______________________
- Date: _______________________
- Notes: _______________________

---

## Publication record

- [ ] All Section A through I boxes checked
- [ ] All five reviewer roles signed with names and dates
- [ ] Regulatory section re-verified within 7 days of publication
- [ ] `last_reviewed` updated in all files
- [ ] `status` and `workflow_state` advanced by a named human
- [ ] Correction history entry added recording the review and the publication decision

Publication date: _______________________

Approved by: _______________________

**Reminder: AI drafts never publish automatically. This checklist is the only route to a
member-facing surface for this compound.**
