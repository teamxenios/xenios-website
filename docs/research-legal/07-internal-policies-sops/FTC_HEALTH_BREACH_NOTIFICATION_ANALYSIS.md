# FTC Health Breach Notification Analysis and SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-008 |
| Title | FTC Health Breach Notification Analysis and SOP |
| Audience | internal, counsel |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; invoked by any incident under XR-POL-007 that touches tracker, assessment, media, or other health-adjacent data, and re-run before any health-data feature launch |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | applicability analyses, incident classifications, and notification records per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal analysis and SOP; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-007, XR-POL-009, XR-POL-010, XR-POL-012, XR-TRK-001, XR-TRK-002, XR-TRK-010 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule page; FTC guidance on health apps and the HBNR |
| Review date | 2026-07-19 |

## 1. Purpose and posture

This document gives Xenios Research a working framework for the FTC Health Breach Notification Rule (HBNR): whether the rule reaches the program, what counts as a breach under it, and the step-by-step procedure if one occurs. Every legal conclusion in this document is a working position that counsel must confirm. Nothing here is relied on to send, or to withhold, any notification.

Why this rule matters here: Xenios is not a HIPAA covered entity on the current working analysis (XR-POL-009). The HBNR is the federal breach regime built for exactly the gap Xenios occupies: consumer-facing, non-HIPAA platforms that hold identifiable health information. The FTC has stated that it reads the rule broadly to cover health and wellness apps. A 21+ health and performance membership with an assessment, a tracker, plans, and progress media should assume it is squarely in the FTC's field of vision.

## 2. The rule in plain English (subject to counsel confirmation)

Stated generally: the HBNR requires a vendor of personal health records (a business that offers consumers a repository of identifiable health information drawn from multiple sources) that is not HIPAA-covered, and certain related entities, to notify affected individuals and the FTC, and in larger cases the media, after a breach of security involving unsecured identifiable health information. A breach of security includes unauthorized disclosure, not only intrusion by an outside attacker. Service providers to these businesses must notify the business when they discover a breach. Exact definitions, thresholds, and timing come from the current rule text and FTC guidance, which counsel must read at the time of any analysis. This document deliberately cites no deadlines or section numbers.

## 3. Applicability framework

Counsel works these questions, in order, for the program as built at the time of analysis:

1. Does Xenios offer or maintain a personal health record: an electronic record of identifiable health information that can be drawn from multiple sources and is managed primarily by or for the consumer?
2. If not a vendor of personal health records, is Xenios a related entity (offering products or services through such a vendor's site, or accessing or sending information to such a record)?
3. Is any Xenios vendor a third party service provider under the rule, handling this data on Xenios's behalf?
4. Is the information unsecured (not protected by the technical means the rule recognizes)?
5. Is Xenios outside HIPAA for this data (see XR-POL-009)? The HBNR is designed for the non-HIPAA lane; the two analyses are run together.

## 4. Application to the tracker

The tracker is the reason this analysis cannot be waved off. By design, the tracker draws member health information from multiple sources:

1. Manual entries by the member (XR-TRK-002), including optional sexual-wellness data under separate consent (XR-TRK-003).
2. The mandatory assessment and the plans built from it (Xenios 30, Xenios 90, Preliminary Blueprint).
3. Wearable connections, when that consent lane opens (XR-TRK-010).
4. Other integrations as they are added.

A member-managed electronic record of identifiable health information drawn from multiple sources is the textbook description of a personal health record. Working position, stated plainly so counsel can confirm or correct it: [COUNSEL: confirm whether the tracker as designed makes Xenios a vendor of personal health records under the HBNR. The prudent operating assumption until counsel concludes otherwise is that it does, and Xenios builds its breach posture as if the rule applies.]

Progress photos, exercise video, and voice messages tied to a member's health context, and order histories for health-adjacent products, may also constitute identifiable health information in a breach analysis. [COUNSEL: confirm scope of covered data classes.]

## 5. What counts as a breach

Under the rule as the FTC describes it, a breach is acquisition of covered information without the individual's authorization. Three consequences for Xenios:

1. Hacking is not required. An unauthorized internal access, a misdirected export, a misconfigured bucket, or a vendor's misuse can each be a breach.
2. Voluntary disclosures count. Sharing covered data with a third party without authorization, including an advertising platform, can be a breach. This is why the program's hard rule exists: no tracker or health data flows to advertising platforms, no ad pixels on member surfaces, ever. That rule is a breach-prevention control, not a style preference.
3. Authorization is specific. A member's consent to one use (for example professional sharing under XR-TRK-011) does not authorize other disclosures.

## 6. Incident classification SOP

For any incident under XR-POL-007 touching health-adjacent data:

1. Scope the data: which fields, which members, what time window, drawn from the audit trail (XR-POL-012).
2. Classify each data class: identity only, health-adjacent, or clearly health information. Record the reasoning.
3. Determine authorization: was the acquisition or disclosure authorized by the member, by contract, and by the consent records? An acquisition outside recorded consent is treated as unauthorized until shown otherwise.
4. Determine security status: was the data encrypted or otherwise secured in the way the rule recognizes? [COUNSEL: confirm what protections qualify.]
5. Hand the classification to counsel with the incident record. Counsel makes the applicability and notification call. The decision, including a decision not to notify, is documented with reasons.

## 7. Notice mechanics (prepared in advance, executed only with counsel)

If counsel concludes a notifiable HBNR breach occurred, three notice lanes exist. Templates for each are prepared before launch so nothing is drafted from scratch mid-incident:

1. Consumer notice: plain-English individual notice describing what happened, what information was involved, what Xenios is doing, and what the individual can do. Delivery method, timing, and required content: [COUNSEL: confirm from current rule text].
2. FTC notice: notification to the FTC, with timing that differs by the number of individuals affected. [COUNSEL: confirm current thresholds, timing, and filing mechanics.]
3. Media notice: required in larger breaches affecting residents of a state or jurisdiction above the rule's threshold. [COUNSEL: confirm threshold and mechanics.]

No deadline, threshold, or recipient in this section is asserted as current law. Counsel reads the rule at execution time.

## 8. Third party service provider obligations

Vendors that handle covered data for Xenios (hosting, database, media storage, email, wearable integrators, any analytics) must, by contract under XR-POL-010:

1. Notify Xenios without undue delay on discovering a breach of security, with enough detail to run sections 6 and 7. [COUNSEL: confirm the contractual notice window to require.]
2. Identify the affected individuals and records to the extent the vendor can.
3. Cooperate with evidence preservation under XR-POL-007.

Xenios in turn evaluates whether it owes a service-provider notice to any client business. Current working position: Xenios serves consumers directly and acts for no other business, so this duty is unlikely to run outbound. [COUNSEL: confirm.]

## 9. Minimization and standing rules

The cheapest breach never happens because the data was never held. Standing rules that keep HBNR exposure narrow:

1. Health-data features ship dark: flags default false, and no health-data flag opens without counsel sign-off, an updated version of this analysis, and consent capture in force.
2. No tracker or health data to advertising platforms. No ad pixels on member surfaces.
3. Telegram carries no detailed assessments, plan PDFs, raw health media, or payment data. It is never the system of record.
4. Media lives in private storage behind signed URLs with access audit (XR-POL-012).
5. Data leaves the platform only through consented, logged lanes (for example XR-TRK-011 professional sharing).
6. Never market Xenios Research as a health platform while privately assuming the HBNR does not apply. The two positions undermine each other; the FTC has noticed exactly this pattern in enforcement.

## 10. Reconciliation with the earlier analysis

An earlier analysis exists at docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md (Draft v0.1, 2026-07-18). It analyzed the pre-membership application platform, whose only data was applicant identity plus free-text goals, and reasonably concluded that platform sat at the boundary of the rule, with applicability arriving only when health-data flags opened. That boundary posture does not describe the full program this document covers: the assessment, tracker, plans, media, and wearables are core designed features, not future flags. This document supersedes the earlier file's conclusions for the program while preserving its two standing rules (never assume non-applicability during an incident; never hold health-platform marketing and a non-applicability position at the same time). Counsel should reconcile the two files and retire or re-scope the earlier one.

## Open items for counsel

- Confirm whether the tracker as designed makes Xenios a vendor of personal health records under the HBNR, and the resulting operating posture (section 4).
- Confirm which Xenios data classes count as identifiable health information in a breach analysis, including progress media and order histories (section 4).
- Confirm what technical protections render data "secured" under the rule (section 6).
- Confirm consumer, FTC, and media notice thresholds, timing, content, and mechanics from the current rule text, and approve the pre-drafted templates (section 7).
- Confirm the breach-notice window and content to require from vendors by contract, and whether Xenios owes any outbound service-provider notice (section 8).
- Confirm the minimum retention period for analyses, classifications, and notification records (metadata table).
- Reconcile this document with docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md and retire or re-scope the earlier file (section 10).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
