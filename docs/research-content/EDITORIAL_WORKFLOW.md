---
title: Xenios Research Editorial Workflow
type: canonical-specification
status: approved-for-internal-use
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Xenios Research Editorial Workflow

This document defines how a Guide moves from an idea to published member-facing content, who
owns each gate, what evidence must exist to leave each gate, and what happens when something
goes wrong after publication.

It is the companion to `CONTENT_ARCHITECTURE.md`. That document defines what the content is.
This one defines how it earns the right to be read by a member.

The governing principle: content advances by evidence, not by confidence. A gate is passed
when a named human records specific evidence, never when the material merely looks finished.

---

## 1. Scope

This workflow governs Guides (individual and blend). It also governs product records and goal
pages, with the gate exemptions noted in section 9.

It applies to content written by a human, content drafted by an AI system, and content
assembled from both. The origin of a draft changes nothing about the gates it must pass.

---

## 2. The lifecycle

Twelve states, in this exact order. State names are written exactly as listed. They are
recorded in the `status` field of the file's YAML frontmatter.

```text
idea
  → researching
    → draft
      → scientific_review
        → claims_review
          → quality_review
            → legal_review
              → founder_review
                → approved
                  → published

published → correction_pending → (back to the gate that failed) → published
any state → withdrawn
```

### 2.1 Forward movement only, with one exception

A record advances one state at a time. States are never skipped, and no gate is bypassed
because a deadline is close or because the material seems obviously fine. The single backward
path is `correction_pending`, defined in section 6.

### 2.2 Rejection

Any gate owner may return a record to `draft` with written reasons. A returned record starts
its gate sequence again from `scientific_review`. Gates already passed do not carry forward,
because the substance the earlier gates reviewed has changed.

---

## 3. Gate owners

Every gate has exactly one accountable named human. Never "the team". Never "the system".
Never an AI.

| State | Gate owner role | Named holder |
| --- | --- | --- |
| idea | Content lead | NOT CONFIRMED, held by Samuel Boadu until assigned |
| researching | Researcher (author) | NOT CONFIRMED, held by Samuel Boadu until assigned |
| draft | Author | NOT CONFIRMED, held by Samuel Boadu until assigned |
| scientific_review | Scientific reviewer | NOT CONFIRMED, requires a qualified named reviewer |
| claims_review | Claims reviewer | NOT CONFIRMED, held by Samuel Boadu until assigned |
| quality_review | Quality reviewer | NOT CONFIRMED, held by Samuel Boadu until assigned |
| legal_review | Legal reviewer | NOT CONFIRMED, requires qualified counsel |
| founder_review | Founder reviewer | Samuel Boadu |
| approved | Founder reviewer | Samuel Boadu |
| published | Publisher | Samuel Boadu |
| correction_pending | Correction owner | Samuel Boadu, until reassigned per correction |
| withdrawn | Publisher | Samuel Boadu |

Notes on this table:

- Named holders are recorded as `NOT CONFIRMED` rather than invented. A gate owner is a real
  accountable person, and naming one who has not accepted the role would defeat the purpose of
  the gate.
- Until a holder is assigned, the gate is held by Samuel Boadu. This makes the workflow
  operable immediately without pretending a review capability exists that does not.
- `scientific_review` and `legal_review` are the two gates where the default holder is a
  stopgap rather than a solution. Both require qualified people. Until those are appointed, a
  record may reach `founder_review` but any claim that would need genuine scientific or legal
  judgment is held rather than approved. See section 7.
- One person may hold several gates. When the same person holds consecutive gates, each gate is
  still recorded separately, with its own evidence, on its own date. Passing two gates in one
  sitting is allowed. Recording them as one event is not.

---

## 4. Exit evidence per gate

A record leaves a gate only when the listed evidence exists, is recorded in the file's review
log (section 8), and is signed by the named gate owner. "It reads well" is never exit evidence.

### 4.1 idea

**Question the gate answers.** Should this Guide exist at all?

**Exit evidence required.**

1. The proposed subject, stated in one sentence.
2. The identifier slot it will occupy (`GDI-NN` or `GDB-NN`), reserved in the inventory register.
3. The goal pages it is expected to serve.
4. A stated reason it belongs in the member library.
5. Confirmation that no existing Guide already covers the subject (one subject, one individual
   Guide).

**Cannot leave without.** A reserved identifier and a confirmed absence of a duplicate.

### 4.2 researching

**Question the gate answers.** Does a real, retrievable evidence base exist?

**Exit evidence required.**

1. A source list where every entry was actually retrieved this session, with WebSearch or
   WebFetch, and carries its exact retrieved URL and a `VERIFIED <YYYY-MM-DD>` marker.
2. For each source, the study type and the population or model (human, animal with species, in
   vitro).
3. A gaps list naming every claim that could not be supported by a retrieved source. The gaps
   list is a required deliverable, not a sign of failure.
4. A written statement of what the evidence base does not cover.

**Cannot leave without.** At least one retrieved and verified source, or an explicit decision
recorded by the content lead that the Guide will proceed as an unknowns-focused Guide with its
claims graded `G`.

**Absolute rule at this gate.** No PMID, NCT number, DOI, author, year, journal, or URL is ever
invented, guessed, reconstructed from memory, or reasonably inferred. If it was not retrieved,
it does not exist for our purposes. A plausible-looking fabricated citation is a more serious
failure than a missing one, because a missing citation is visible and a fabricated one is not.

### 4.3 draft

**Question the gate answers.** Is there a complete piece of writing that conforms to the
architecture?

**Exit evidence required.**

1. Complete YAML frontmatter with all required keys from `CONTENT_ARCHITECTURE.md` section 3.4.
2. Every claim written as a claim row with a grade assigned, defaulting to `G` or `D`.
3. Every preclinical finding carrying its species or model in the same sentence as the finding.
4. The verbatim line `Dosing information is intentionally excluded.` present in the safety block.
5. A gaps list carried forward from `researching`.
6. Every background-knowledge line labelled exactly
   `[UNVERIFIED - background knowledge, requires human source check]`.
7. An authorship note recording whether the draft was written by a human, by an AI system, or
   by both.

**Cannot leave without.** All seven items. A draft missing the dosing exclusion line, or
carrying an unlabelled background-knowledge claim, is returned rather than reviewed.

### 4.4 scientific_review

**Question the gate answers.** Does each statement accurately represent what the cited source
actually found?

**Exit evidence required.**

1. Every citation opened and checked against the sentence it supports. The reviewer records
   that each was checked, by identifier.
2. Confirmation that no citation is fabricated, and that every URL resolves to the work
   described.
3. Confirmation that every preclinical finding names its species or model in the same sentence,
   and that no animal or in vitro result is worded so a reader could take it as a human result.
4. Confirmation that each claim's grade matches its evidence, with any over-graded claim
   downgraded and the change recorded.
5. Confirmation that no dosing, protocol, regimen, timing, cycle, titration, loading, stacking,
   reconstitution, technique, or route content is present, including in indirect or narrative
   form.
6. For blend Guides, confirmation that combination evidence is described honestly, and that
   component evidence is not presented as combination evidence.

**Cannot leave without.** Item 2. A single fabricated or unresolvable citation returns the
record to `draft` and triggers a full citation re-verification of the whole file, not just the
failing line.

### 4.5 claims_review

**Question the gate answers.** Is every claim permitted to be made, at the grade assigned, in a
member-facing surface?

**Exit evidence required.**

1. Each claim graded against the scale in `CONTENT_ARCHITECTURE.md` section 9, with the grade
   and its basis recorded per claim.
2. Confirmation that no prohibited outcome language appears anywhere ("will", "proven to",
   "restores", "cures", "eliminates", "reverses").
3. Confirmation that no unsupported safety claim appears ("safe", "well tolerated", "no side
   effects" stated as general fact).
4. Confirmation that "research use only" is not used as a device to imply human benefit.
5. Confirmation that no claim reads as medical, legal, financial, or clinical advice, as a
   diagnosis, or as self-treatment framing.
6. Any claim that cannot be substantiated is either downgraded to `G`, marked `PROHIBITED`, or
   removed, and the decision is recorded. See section 7.

**Cannot leave without.** A recorded grade and basis for every claim in the file. An ungraded
sentence that functions as a claim is treated as a claim, not as prose.

### 4.6 quality_review

**Question the gate answers.** Is the file structurally correct, internally consistent, and
written in house style?

**Exit evidence required.**

1. Cross-reference integrity check from `CONTENT_ARCHITECTURE.md` section 11, all ten items,
   recorded as passed.
2. Confirmation that every link identifier resolves and every link is reciprocated.
3. Confirmation that every unknown field reads exactly
   `NOT CONFIRMED - see open supplier questions`, with no invented product facts anywhere
   (composition, ratios, concentration, fill volume, vial size, shelf life, storage temperature,
   sterility, purity, COA content, supplier identity, price, margin, inventory).
4. House style check: plain direct English, zero em dashes, no hype, no sales language, no
   flattery, no exclamation marks, "xenios" lowercase in internal prose and "Xenios Research"
   as the member-facing brand form.
5. Originality check: no copied or lightly paraphrased competitor, retailer, or manufacturer
   marketing text.
6. Access check: `access: member-only` set on Guides, and no member-only substance reproduced in
   any goal page or product record.

**Cannot leave without.** Items 1, 3, and 5. A single em dash fails item 4 and is fixed before
the gate is recorded as passed.

### 4.7 legal_review

**Question the gate answers.** Does this content create regulatory, liability, or authorization
exposure?

**Exit evidence required.**

1. Every regulatory statement carries a date, a jurisdiction, and a source URL. A statement
   missing any of the three is removed, not reworded.
2. Confirmation that no content states or implies that Xenios is authorized to resell,
   distribute, or sell anything, absent cited written evidence.
3. Confirmation that commerce approval state in any linked product record reads `blocked` or
   `pending_written_approval`, consistent with `CONTENT_ARCHITECTURE.md` section 7.2.
4. Confirmation that no content constitutes medical, legal, financial, or clinical advice.
5. Confirmation that the content does not read as an offer, a solicitation, or a purchase
   inducement.
6. Confirmation that no third-party rights are implicated by quoted or adapted material.

**Cannot leave without.** Items 1 and 2.

**Standing limitation.** Until qualified counsel holds this gate, it is held by Samuel Boadu as
a stopgap. In that condition, any content raising a genuine regulatory question is held at this
gate rather than passed. A stopgap holder can catch an obvious problem. A stopgap holder cannot
clear a real one.

### 4.8 founder_review

**Question the gate answers.** Is this what Xenios Research should say?

**Owner.** Samuel Boadu.

**Exit evidence required.**

1. All six preceding gates recorded as passed, each with its named owner and date.
2. The gaps list reviewed, with a decision recorded on each gap (publish with the gap stated,
   hold, or remove the associated claim).
3. Every claim graded `PROHIBITED` confirmed as absent from the file.
4. Voice and positioning judgment recorded: does this read as calm, premium, honest, and
   unmistakably ours.
5. Explicit confirmation that the member-facing terminology rule is followed, with the approved
   labels used and the prohibited forms absent from every member-facing surface.

**Cannot leave without.** Samuel Boadu's recorded decision. This gate is never delegated and
never inferred from silence. No response is not approval.

### 4.9 approved

**What this state means.** The content is cleared to publish and has not yet been published.

**Exit evidence required to move to `published`.**

1. A recorded approval from Samuel Boadu, dated.
2. A version number assigned (section 6.2).
3. A snapshot of the approved file content stored in version history, so what was approved can
   later be compared with what is live.

**Rule.** `approved` is a real, separate state, not a formality between review and publication.
It exists so that approval and publication are two distinct recorded events by the same
accountable person, which is what makes an unauthorized publication detectable.

### 4.10 published

**What this state means.** Live and readable by active members.

**Owner.** Samuel Boadu, as publisher.

**Ongoing obligations while published.**

1. `last_reviewed` reflects the date of the most recent completed review.
2. Any Guide whose `evidence_last_searched` is older than twelve months enters
   `correction_pending` for an evidence refresh, whether or not anything is known to be wrong.
   Evidence goes stale silently, so the trigger is the calendar, not a complaint.
3. Any report of an error moves the record to `correction_pending` within one working day of the
   report reaching a gate owner.

### 4.11 correction_pending

Defined in full in section 6.

### 4.12 withdrawn

**What this state means.** Removed from member-facing surfaces and not to be republished in its
current form.

**Owner.** Samuel Boadu.

**Entry conditions.** Any of:

- a claim was found to be unsubstantiated and cannot be corrected in place
- a fabricated citation was found after publication
- a regulatory or legal position changed
- the subject is no longer appropriate for the member library

**Exit evidence required to enter.**

1. The reason, stated plainly and dated.
2. Confirmation that the content is no longer reachable on any member-facing surface.
3. A record of what members were shown, and for how long, so the exposure is known.
4. A decision on whether members who read it require notification.

**Rule.** A withdrawn record is never deleted. The file and its version history remain, marked
`withdrawn`. Deletion would destroy the evidence of what was published, which is exactly the
record a withdrawal exists to preserve.

---

## 5. AI drafts never publish automatically

This is absolute and has no exception, no fast path, and no trusted mode.

1. An AI system may propose an idea, conduct research, and produce a draft. It may reach
   `draft` and no further.
2. An AI system never advances a record into or through `scientific_review`, `claims_review`,
   `quality_review`, `legal_review`, `founder_review`, `approved`, or `published`.
3. An AI system is never recorded as a gate owner. Named human accountability means a human.
4. Model output never authorizes publication. A model stating that content is accurate, safe,
   compliant, or approved carries no authority whatsoever.
5. Every AI-drafted file records its origin in the authorship note, and that note persists
   through every subsequent state. Origin is not scrubbed once a human has edited the file.
6. No automation publishes content. Publication is a deliberate act by Samuel Boadu.
7. An AI system may run mechanical checks (em dash detection, identifier resolution, link
   reciprocity, presence of required strings) and report the results. Reporting a check result
   is not passing a gate. A human still records the gate.

The reasoning is specific rather than general caution. The failure modes that matter most here
(a fabricated citation, a preclinical result worded as a human result, a dose reproduced from a
source) are precisely the failures a language model produces most fluently and least visibly.
Fluent and invisible is exactly what a human gate is for.

---

## 6. Corrections and version history

### 6.1 Every record carries version history

Version history is a requirement, not an option, and it is retained for the life of the record
including after withdrawal.

Every version records:

- the version number
- the date
- the states passed and their named gate owners
- what changed from the previous version
- who made the change
- whether the change was substantive (affects a claim, a grade, a citation, or a safety line) or
  editorial (wording, formatting, links)
- a snapshot of the approved content

### 6.2 Version numbering

```text
MAJOR.MINOR

MAJOR increments on a substantive change: a claim added, removed, or re-graded,
       a citation changed, a safety line changed, or a scope change.
MINOR increments on an editorial change that touches no claim, grade, citation,
       or safety line.
```

A `MAJOR` increment requires the full gate sequence from `scientific_review`. A `MINOR`
increment requires `quality_review` and `founder_review`. Nothing published changes without at
least one recorded human gate.

### 6.3 The correction path

```text
published
  → correction_pending  (recorded, with the reason and the reporter)
    → the failing gate, and every gate after it, re-run
      → founder_review
        → approved
          → published (version incremented)
```

Entering `correction_pending` requires:

1. The reason, stated plainly.
2. The source of the report (internal review, member report, scheduled evidence refresh,
   external source).
3. The date.
4. A severity judgment.

### 6.4 Severity and the take-down rule

| Severity | Definition | Action |
| --- | --- | --- |
| Critical | A fabricated citation, a dose or protocol present, a preclinical result reading as human, an unsupported safety claim, or an authorization claim without evidence. | Content comes down immediately, before the correction is written. Correct offline, then re-run the gates. |
| Substantive | A claim over-graded, a citation that does not support its sentence, a stale evidence base. | Content may stay live while corrected, at Samuel Boadu's discretion, recorded. |
| Editorial | Wording, formatting, a broken link, a style breach. | Content stays live, corrected at the next `MINOR` increment. |

A critical correction is never handled by editing the live file quietly. It comes down first.

### 6.5 Corrections are visible, not erased

A correction supersedes the old claim. It does not erase that the old claim was made. The
version history retains the superseded wording, the date range it was live, and the reason it
changed. Silent editing of published claims is prohibited, because the record of what members
were told is the only way to know what members may have acted on.

---

## 7. Escalation when a claim cannot be substantiated

This is the most common decision in this workflow, so the path is fixed rather than judged case
by case.

### 7.1 The ladder

```text
Step 1  Search again, properly.
Step 2  Downgrade to what the retrieved evidence actually supports.
Step 3  If nothing retrieved supports it, grade G and state the uncertainty in the text.
Step 4  If it cannot be stated at grade G without misleading a reader, remove it
        and log it in the gaps list.
Step 5  If it is the kind of claim that should never be made, mark it PROHIBITED.
Step 6  If steps 1 to 5 do not resolve it, escalate to Samuel Boadu with the options
        and a recommendation. Samuel Boadu decides.
```

### 7.2 The rules that make the ladder work

1. **Omission is always available and always acceptable.** A Guide that says less because the
   evidence is thin is a correct Guide. There is no completeness requirement that competes with
   accuracy.
2. **Never fill a gap with a fabricated source.** If a claim needs a citation that cannot be
   retrieved, the claim goes, not the citation requirement.
3. **Never soften a prohibited claim into an acceptable one.** "May help restore" is the same
   claim as "restores" with a hedge attached. Prohibited claims are removed, not reworded.
4. **Never substitute a preclinical finding for the missing human one.** If the human evidence
   is absent, that is what the Guide says. An animal result is not a smaller version of a human
   result.
5. **Never let a supplier statement stand in for evidence.** It is graded `E`, attributed to the
   named party, and labelled as reported.
6. **Every gap is logged.** The gaps list travels with the file to `founder_review`, where a
   decision is recorded on each entry. Gaps are not quietly dropped when the file looks finished.

### 7.3 Escalation record

An escalation to Samuel Boadu records the claim, what was searched and what was retrieved, why
steps 1 to 5 did not resolve it, the options with consequences, a recommendation, and Samuel
Boadu's decision with its date. The decision is written into the file's review log, so a future
reviewer finds the reasoning rather than repeating the work.

---

## 8. The review log

Every content file carries a review log in its frontmatter. It is the audit record. Gate
evidence lives here.

```yaml
review_log:
  - state: scientific_review
    owner: <named human>
    date: <YYYY-MM-DD>
    outcome: passed | returned
    evidence: <what was checked, specifically>
    notes: <returns require written reasons>
version_history:
  - version: <MAJOR.MINOR>
    date: <YYYY-MM-DD>
    change_type: substantive | editorial
    changed_by: <named human>
    summary: <what changed>
gaps:
  - claim: <the claim that could not be supported>
    searched: <what was searched>
    resolution: omitted | graded_G | prohibited | escalated
    decided_by: <named human>
    date: <YYYY-MM-DD>
```

A gate with no review log entry did not happen, regardless of what anyone remembers.

---

## 9. Application to product records and goal pages

Product records and goal pages use the same lifecycle with these differences:

**Product records.**

- `scientific_review` applies only to claim rows. A record with no claims skips the substance of
  this gate, and the skip is recorded with its reason.
- `legal_review` is mandatory and never skipped, because commerce approval state and
  authorization language live here.
- Changing `commerce_approval_state` is always a substantive change requiring `legal_review` and
  `founder_review`, and never moves to `approved` without cited written evidence.
- Changing `catalog_state` does not require the full sequence and never affects
  `commerce_approval_state`. The two states are independent by design.

**Goal pages.**

- `scientific_review` applies to any claim in the framing text.
- `quality_review` additionally verifies the member-facing terminology rule, that the approved
  label is used and no prohibited form appears.
- `legal_review` verifies that the page does not read as a recommendation or an inducement.

**Guides.** All twelve states, all gates, no exemptions.

---

## 10. Definition of done

A Guide is done when all of the following are true. Not most of them.

1. Status is `published`.
2. All eight review gates are recorded as passed, each with a named human owner and a date.
3. Every citation was actually retrieved and is marked `VERIFIED <YYYY-MM-DD>` with its exact URL.
4. Every claim carries a grade and a recorded basis.
5. Every preclinical finding names its species or model in the same sentence.
6. The line `Dosing information is intentionally excluded.` is present, and no dosing, protocol,
   or technique content exists anywhere in the file.
7. No prohibited outcome language and no unsupported safety claim appears.
8. Every regulatory statement carries a date, a jurisdiction, and a source URL.
9. Every unknown reads exactly `NOT CONFIRMED - see open supplier questions`.
10. Cross-reference integrity passes all ten checks.
11. The file contains zero em dashes.
12. Version history is complete and the gaps list is resolved with recorded decisions.
13. Samuel Boadu has recorded approval and publication as two separate dated events.

---

## 11. Open questions

1. Named holders for `scientific_review`, `claims_review`, `quality_review`, and `legal_review`.
   Until appointed, all gates default to Samuel Boadu, which concentrates risk in one person and
   is a stopgap rather than a working review structure.
2. Qualified counsel for `legal_review`. Regulatory statements cannot be genuinely cleared
   without it.
3. Whether member notification is required for a critical correction, and through what channel.
4. Where version history snapshots are stored, and their retention period.
5. Whether the twelve-month evidence refresh interval is right for fast-moving subjects.
6. Whether an external scientific reviewer is required for any subject class before publication.

---

## 12. Change control

This document changes only with Samuel Boadu's approval, recorded by updating `last_reviewed`
and noting the change below.

| Date | Change | Approved by |
| --- | --- | --- |
| 2026-07-19 | Initial canonical version. | Samuel Boadu (pending founder review) |
