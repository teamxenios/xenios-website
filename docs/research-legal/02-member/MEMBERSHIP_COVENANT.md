# Membership Covenant

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-005 |
| Title | Membership Covenant |
| Audience | member |
| Required member state | approved, pre-payment (accepted before the $50 activation payment); in force for the life of the membership |
| Trigger | agreements step of the activation flow, after identity and age verification and before payment |
| Route | activation flow under /research (agreements step) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | partial; a member may end the covenant prospectively by canceling the membership (XR-MEM-004), but the acceptance record is retained and obligations about materials already received continue under XR-MEM-006 |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-001, XR-MEM-004, XR-MEM-006, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What this covenant is

This covenant states how members of Xenios Research agree to conduct themselves. It is part of the Founding Membership Agreement (XR-MEM-001). It is written in the voice you will read it in: "you" is the member, "we" is [ENTITY], operating as Xenios.

Xenios Research is a small, private, approved-member community. Every member was reviewed and admitted individually, and the Founder personally reviews plans during the founding phase. The covenant exists to keep that environment honest, safe, and worth belonging to.

## 2. Truthfulness

You confirm that the information in your application and identity verification was true and complete when you gave it, and you agree to keep your account information accurate. Admission decisions and plan decisions are made by a human relying on what you told us. If something material changes, tell us.

## 3. Respect

You agree to treat the Founder, staff, fulfillment partners, and any other member you interact with through the Program with basic respect. No harassment, threats, abuse, or discriminatory conduct in any Program channel, including Telegram support and any future community space.

## 4. Your account is yours alone

Membership is personal and non-transferable.

- Do not share your password, MFA codes, or recovery codes with anyone. Xenios staff will never ask for your password.
- Do not let anyone else log in as you, and do not log in as anyone else.
- Do not create an account for another person or on another person's behalf. Each member applies, is verified as 21 or older, and is admitted individually.

## 5. No resale, no redistribution

Member access and member materials are for your own use as a member.

- Do not resell, rent, or share access to the membership, the catalog, or member pricing.
- Do not resell products purchased through the Program. Purchases are for your own use; quantities inconsistent with ordinary individual use trigger manual review and may be declined.
- Do not republish or mass-share member materials (Guides, plans, Blueprint documents, PDFs). The details, and the carve-outs that protect your own speech, are in the Private Membership Confidentiality Covenant (XR-MEM-006).

## 6. Lawful use

You agree to use the Program and anything you obtain through it only in ways that are lawful where you are. Product availability may differ by state, and server-side controls enforce this; do not attempt to evade them, misstate your location, or use the Program to obtain something for a person or place where it is not permitted.

## 7. No speaking for Xenios

You agree not to present yourself as speaking for Xenios and not to attribute to Xenios any claim it does not make. In particular, do not describe any product as approved, endorsed, or proven by Xenios for any human outcome. Peptide products are research products whose classification and permitted marketing lane are under formal review, and no one, including members, may market them otherwise on our behalf. If you are a Research Rep or affiliate, your separate agreement and its disclosure rules also apply.

## 8. Support channel conduct

Telegram support is available 24/7 for text and short voice questions, with a normal response target of approximately 12 hours. You agree to use it as designed:

- no passwords, reset tokens, identity documents, plan PDFs, raw health media, or payment data over Telegram, in either direction,
- no misuse of emergency language to seek priority; genuine emergency language routes you to emergency services (911 in the US), because support is not an emergency service.

## 9. What happens on breach

Material breach of this covenant (for example untruthful application information, account sharing, resale of access or materials, unlawful use, or claims made in our name) can lead to suspension or termination under XR-MEM-001 section 16. Where a breach is fixable and does not involve safety, security, or legal risk, we will normally describe the problem and give you a chance to respond first. Termination is never a fine, and the consequences for paid time follow XR-MEM-004, subject to applicable law.

## 10. What we owe you

The covenant runs both ways. We commit to:

- telling you plainly what the Program is and is not (XR-MEM-001 sections 9 and 10),
- handling your personal information as the member privacy notice describes, and never sending tracker or health data to advertising platforms,
- keeping a named accountable human, the Founder, behind every consequential decision about your membership, and
- giving you a straight answer, through research@xeniostechnology.com, about what information we hold on you.

## 11. Rights preserved

Nothing in this covenant restricts you from reporting suspected wrongdoing to any regulator or law-enforcement agency, complying with legal process, consulting your own lawyer or doctor about anything, or making truthful statements about your own experience as a member. This covenant does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law.

## Open items for counsel

- Reconciliation with the earlier draft at docs/compliance/MEMBERSHIP_COVENANT.md: that draft (v0.1, 2026-07-18) combines conduct, confidentiality, and mutual commitments in one document, describes the program as education-only ("not a store"), which conflicts with the canonical spec where active members purchase products directly, and cites team@xeniostechnology.com rather than research@xeniostechnology.com. Counsel to reconcile and designate this document plus XR-MEM-006 as superseding, or merge the texts; engineering to migrate the acceptance-versioning scheme (research_covenant_acceptances) to the surviving document keys.
- Section 5: confirm the no-resale restriction on purchased products is enforceable as a membership term and how it interacts with first-sale doctrine for lawful goods.
- Section 9: confirm the cure-before-termination practice should remain discretionary rather than contractual.
- Section 11: confirm the preserved-rights list covers all legally protected speech and whistleblower protections in the operative jurisdictions.
- [ENTITY]: confirm the legal entity name.
- Retention metadata: confirm the minimum retention period for acceptance records under XR-POL-005.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
