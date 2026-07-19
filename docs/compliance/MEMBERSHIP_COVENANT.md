# xenios research membership covenant

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: counsel edits; any change to membership terms, commerce activation, or termination policy; any new member-facing capability.

Version: v0.1 (this version string is what gets written to research_covenant_acceptances.covenant_version).
Storage: acceptances are recorded per supabase/research-consent-covenant.sql (append-only, versioned, presented-text hash) and mirrored as the membership_covenant consent kind in the consent registry.
Gating: capture ships only behind RESEARCH_MEMBER_COVENANT_ENABLED, which defaults false. No acceptance flow exists in the product today; until the flag opens, application acknowledgement booleans remain the current record.
Nothing below is offered to members until counsel approves the text.

## 1. Purpose of this document

Sections 3 through 9 are the draft covenant text itself, written in the voice members will read. Everything outside those sections is internal context. The covenant is deliberately calm and fair: it protects the community's materials and honesty without gag clauses, without waiving rights members cannot or should not waive, and without pretending xenios provides medical care.

## 2. Presentation requirements (internal)

- Shown in full before acceptance; no pre-checked boxes; scroll-through or equivalent.
- The exact rendered text is hashed into presented_text_hash at acceptance.
- A member who declines simply does not become an active member; declining is never punished beyond that.
- Re-acceptance is required when the version changes materially.

## 3. Covenant: what you are joining

xenios research is a private membership community for education about research peptides. It is not a store, a clinic, or a medical service. Membership gives you access to research documentation and community materials. It does not give you medical advice, treatment, or products for human use. Nothing you read here is a substitute for a qualified professional's advice.

## 4. Truthfulness

You confirm that the information in your application was true and complete when you gave it, and you agree to keep your account information accurate. Membership decisions are made by humans relying on what you told us. If something material changes, tell us.

## 5. Confidentiality of member materials

Materials inside the membership (research documentation, guides, community discussions, and anything else marked for members) are shared with you for your own use as a member. You agree not to redistribute them: no reposting, reselling, mass-sharing, or publishing member materials outside the membership. Discussing ideas in your own words is fine. Copying our documentation out to the public internet is not.

## 6. No medical claims on behalf of xenios

You agree not to present xenios research as endorsing any medical treatment, outcome, or use of any compound, and not to speak on behalf of xenios. Our materials are educational. If you describe them to others, describe them as that.

## 7. Your rights, preserved

Nothing in this covenant restricts you from: reporting suspected wrongdoing to any regulator or law-enforcement agency; complying with a subpoena, court order, or other legal duty; consulting your own lawyer or doctor about anything, including our materials; or making truthful statements about your own experience as a member. This covenant is not a gag clause, and we will never ask you to treat it as one.

## 8. Termination

We may end a membership for material breach of this covenant (untruthful application, redistribution of member materials, medical claims made in our name) or where the law requires. Where the breach is fixable, we will normally tell you what is wrong and give you a chance to respond before terminating. On termination, your access ends and your confidentiality commitments about materials you already received continue. Any activation fee is handled per the refund terms in effect when you paid; termination is never a fine.

## 9. Changes and acceptance

This is version v0.1 of the covenant. If we change it materially, we will show you the new version and ask you to accept it; continued membership under a superseded version is governed by the version you last accepted. Your acceptance is recorded with the version, the exact text you saw, and the time.

## 10. Covenant: what we owe you

This covenant runs both ways. We commit to: telling you plainly what xenios research is and is not (section 3 is that statement); handling your personal information as described in our privacy materials; never selling your personal data; and giving you a straight answer, through team@xeniostechnology.com, about what information we hold on you.

## 11. Open items for counsel (internal)

1. Governing law and dispute-resolution clause: deliberately omitted from v0.1; counsel to draft.
2. Refund terms reference in section 8: commerce is currently disabled (no Stripe, all products non-live); the referenced refund terms do not exist yet and must be drafted before activation.
3. Confirm section 7 preserves everything law requires (whistleblower protections, testimony rights) in the operative jurisdictions.
4. Confirm section 5's scope is enforceable and not overbroad for community discussions.
5. Age and eligibility statement: age verification is not built (RESEARCH_AGE_VERIFICATION_ENABLED false); counsel to advise what v0.1 may honestly require of applicants meanwhile.
