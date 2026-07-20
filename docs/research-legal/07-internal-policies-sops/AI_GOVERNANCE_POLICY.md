# AI Governance Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-034 |
| Title | AI Governance Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applied to every use of an AI tool in drafting, operations, or member-affecting work |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | AI tool register entries, review records, and correction logs per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent; the member-facing disclosure and its handling are covered by XR-MEM-013) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-013, XR-MEM-014, XR-MEM-015, XR-MEM-016, XR-MEM-024, XR-MEM-025, XR-POL-004, XR-POL-005, XR-POL-010, XR-POL-012, XR-POL-032 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC guidance on AI claims and endorsements |
| Review date | 2026-07-19 |

## 1. Purpose and position

Xenios Research uses AI tools to draft, organize, and monitor. It does not use AI to decide, diagnose, or publish. This policy states where AI is allowed, the human review rule that gates everything member-facing, the hard limits, how members are told, how member data is protected from unapproved tools, and how errors are found and corrected. "AI tool" here means any model-based system that generates or transforms content, including large language models and the internal Infinity layer (XR-POL-032).

## 2. Where AI is used

Permitted uses:

1. Drafting plans: preliminary Blueprint drafts and Xenios 30 / Xenios 90 plan drafts (XR-MEM-014, XR-MEM-015, XR-MEM-016), always as input to human review, never as output to a member.
2. Drafting answers: proposed responses in the question system (XR-MEM-024), reviewed before sending.
3. Drafting Guides: educational Guide content (XR-MEM-025), reviewed for accuracy and claims discipline before publication.
4. Internal operations: Infinity's classification, summarization of safe fields, task creation, SLA monitoring, and response drafting, under XR-POL-032.

Not AI's job: application approvals, identity verification decisions, plan publication decisions, refunds, member account changes, and anything on the Infinity approval-required list. Those are human decisions made by the named accountable person. AI may organize the material a human decides on; it may not make the call.

## 3. The human review rule

Nothing AI-drafted reaches a member without named human review.

1. During the founding phase, Samuel Boadu personally reviews every initial and monthly plan before delivery, within the 48-elapsed-hour review commitment, weekends included.
2. Question answers and Guides carry the same rule: a named human reviews, edits, and takes responsibility before anything is sent or published. Accountability always attaches to a named person, never to "the system" or "the model".
3. Review is real review: the reviewer is expected to correct, and the correction loop in section 7 depends on those corrections being recorded.
4. If review capacity fails (illness, volume), the output waits. A missed SLA is reported honestly; skipping review is not an option.

## 4. Hard limits

These apply to every AI use, in every channel, with no exceptions:

1. No automated diagnosis, no prescribing, no dosing instructions, no medication direction. An AI draft containing any of these is corrected before review completes, and the occurrence is logged (section 7).
2. Emergency language in any member message routes the person to emergency services (911 in the US) under the support rules (XR-POL-031); no AI tool attempts remote care.
3. No AI-generated claims outside the approved claims registry lane for the product or service concerned. AI drafts must respect the classification posture: research products are described as research products whose classification and permitted marketing lane are under formal review, and nothing is called "FDA approved", "clinically proven", or "safe for everyone".
4. No outcome promises in any AI-drafted text.
5. AI output never authorizes an action. Consequential actions run through the approval packet model in XR-POL-032, where only Samuel's explicit approval executes.
6. No fabricated facts: an AI draft that asserts a business, legal, clinical, or scientific fact the reviewer cannot verify is corrected or discarded.

## 5. Member disclosure

Members are told plainly that AI assists in preparing their materials. The member-facing instrument is the AI-Assisted Recommendation Disclosure (XR-MEM-013), presented before or at delivery of AI-assisted recommendations. The disclosure makes clear that a named human reviews AI-assisted output, and that the human, not the model, is accountable. Internal practice must keep that statement true: if a workflow ever bypasses human review, either the workflow stops or the disclosure is wrong, and the workflow stops.

## 6. Model and data handling

1. Approved tool register: AI tools may be used only if listed on the approved tool register [CONFIG: approved AI tool register and owner], reviewed under the vendor risk process (XR-POL-010) before listing.
2. No member data to unapproved tools. No member personal data, health data, assessment content, media, or identifiable support content is entered into any tool not on the register. This includes "just pasting" a question into a consumer chatbot; that is a reportable policy violation.
3. Minimum necessary even in approved tools: use opaque references instead of names where the task allows (mirroring the payload rules of XR-POL-032), and never include passwords, tokens, keys, or payment data in any prompt.
4. Training use: member data must not be used to train third-party models. Vendor terms must confirm no training on submitted content, or the tool is not approved. [COUNSEL: confirm the contractual standard required of AI vendors for training, retention, and confidentiality of submitted content]
5. Voice notes and media go only through the approved processing path in the Media Handling SOP (XR-POL-033); transcription requires the member's consent under XR-TRK-005.
6. Data classification (XR-POL-004) governs: the higher the class, the narrower the permitted tool set.

## 7. Evaluation and correction loop

1. Every reviewer correction of an AI draft is a data point. Corrections are recorded with the draft, the correction, and the reason category (accuracy, claims, tone, safety, hallucination).
2. Member signals feed in: answer ratings (XR-MEM-024), plan-change requests, and complaints are reviewed for AI-attributable error.
3. Periodic review [CONFIG: cadence; working target monthly during the founding phase]: Samuel reviews the correction log, updates prompts and templates, and removes a tool from the register if its error pattern warrants it.
4. Corrections supersede without erasing: the record keeps the original, the correction, and the timestamp, consistent with the program's memory and audit discipline (XR-POL-012).
5. An AI-caused error that reached a member (wrong content delivered, disclosure missed, data mishandled) is handled as an incident under XR-POL-007, including the notification analysis where personal data was involved.

## 8. Records

The tool register, review sign-offs, correction log, and periodic review notes are retained per XR-POL-005. For any member-delivered artifact, the record must show which tool assisted, who reviewed, and when it was approved for delivery.

## Open items for counsel

- [COUNSEL: confirm the retention period for AI review and correction records (metadata table)]
- [CONFIG: approved AI tool register, its owner, and its review cadence (section 6)]
- [COUNSEL: confirm the contractual standard required of AI vendors for training, retention, and confidentiality of submitted member content (section 6)]
- [CONFIG: periodic evaluation cadence; working target monthly during the founding phase (section 7)]
- [COUNSEL: review XR-MEM-013 against this policy so the member disclosure matches actual practice, including Infinity's internal drafting role]
- [COUNSEL: advise whether any state AI transparency or automated-decision law applies to the founding-phase workflow, given that no member-affecting decision is automated]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
