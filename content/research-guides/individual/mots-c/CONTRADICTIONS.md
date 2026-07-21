---
title: "MOTS-c: Contradictions and Disagreement in the Evidence"
type: research-guide-contradictions
compound: mots-c
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# MOTS-c: contradictions and disagreement

Where sources disagree, where mechanism outruns evidence, and where the popular account
does not match what was actually measured.

## 1. The human observational literature contradicts itself on direction

This is a genuine, unresolved conflict, not a nuance.

| | Position A | Position B |
|---|---|---|
| Source | PMID 29691953 | PMID 41004666 / PMC12468430 |
| Population | 97 participants, obese children and adolescents, Hubei Province, China | 85 adults, 48 with BMI at or above 30, 37 with BMI 18.5 to 24.9 |
| Finding | Circulating MOTS-c **lower** in obese males, **negatively** correlated with insulin-resistance markers | Serum MOTS-c **positively** correlated with HOMA-IR, and **no significant difference** between obese and normal-weight groups |

**Assessment.** The two point in opposite directions. The populations differ (children
versus adults), and the authors of the second paper explicitly flag that MOTS-c
measurement methods are unstandardized across the literature, which undercuts
cross-study comparison and may itself explain the disagreement.

**Why this matters to a member.** The popular story runs: low MOTS-c means metabolic
dysfunction, therefore supplement it. That story is not consistently supported **even at
the correlational level**, let alone causally. One of these two studies has to be
describing something other than a stable biological relationship.

Neither study administered anything. Both measured a naturally occurring molecule in
blood. So neither can speak to what giving MOTS-c does, in either direction.

## 2. Whether an active human trial exists

| | Position A | Position B |
|---|---|---|
| Claim | No active IND and no active human MOTS-c trial as of 2026; registry hits point only to the CB4211 analog | A Phase 2a MOTS-c trial is registered and recruiting: NCT07505745, Hudson Biotech, start February 2026, estimated enrollment 120 |
| Source type | Secondary and vendor pages encountered in general search | ClinicalTrials.gov API, queried directly |

**Assessment. Resolved in favour of B on the registry record**, which was retrieved
directly. An adversarial control query using a fabricated NCT ID correctly returned
HTTP 404, confirming the retrieval was genuine rather than a hallucinated record.

But note carefully what that resolves. It establishes only that a trial is **registered
and recruiting**. No results are posted. A registration is a statement of intent, not
evidence of effect or safety. **Neither position supports any efficacy claim.**

It is worth recording that the sources on both sides of this dispute in general web
search were vendor and marketing pages. That is precisely why the registry was queried
directly rather than relying on either account.

## 3. Mechanism outruns evidence, and the review that describes it says so

The mechanistic story (AMPK-dependent nuclear signalling improving glucose handling)
comes from mouse and cell-culture work. The 2023 review that lays out that mechanism
also states plainly that **no effective method of clinical application has been
developed**.

So the most cited mechanistic source is not in tension with the sceptical reading here.
It agrees with it. The tension is between the literature and the marketing.

## 4. An analog is being cited as though it were the compound

CB4211 is a **modified MOTS-c analog**, a different molecule, developed by CohBar. It
completed a Phase 1a/1b trial (NCT03998514, 88 participants). It has **no posted
results**.

Two problems compound here:

1. Vendor and marketing pages routinely blur the MOTS-c and CB4211 distinction, treating
   analog trial activity as evidence for MOTS-c. It is not. An analog is a different
   molecule with its own pharmacology.
2. The widely repeated claim that the drug was "safe and well tolerated" traces to
   **sponsor communications, not to posted trial results**. It cannot be verified from
   the registry record, and it is not repeated as fact in this Guide.

The sponsor has since ceased independent operations, which does not itself bear on the
science but does mean no further data is likely from that programme.

## 5. Reported adverse effects are anecdote, not trial data

Effects circulating online (palpitations, injection site irritation, insomnia, fever) are
**aggregations of self-report**, not adverse event data from a controlled trial. They are
recorded because a member will encounter them, and they are labelled for what they are.

The absence of trial adverse event data is not reassurance. USADA states outright that it
is unknown under what conditions, if any, MOTS-c is safe to use, because no clinical
trials have been completed.

## 6. What is not in dispute

- No completed human interventional evidence exists for administering MOTS-c.
- MOTS-c is not FDA approved for any human use.
- It is prohibited in sport as an AMPK activator, with no therapeutic use exemption
  available.
- Any material obtained comes from an unregulated channel.

## Verification debt on this document

FDA primary-source pages returned HTTP 404 on every attempt during research, so all
FDA-specific statements reach this Guide **secondhand via USADA**. A human must verify
them against the FDA record directly before publication. This is recorded in
`REGULATORY_STATUS.md` and in the editorial checklist.
