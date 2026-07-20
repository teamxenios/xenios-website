# Member Referral Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-AFF-001 |
| Title | Member Referral Terms |
| Audience | member |
| Required member state | active member |
| Trigger | governs the member referral program from launch; referenced from XR-MEM-026 wherever a referral code or link is issued |
| Route | /research/member/referrals (program-level reference document) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (program-level terms; member acceptance is captured against XR-MEM-026 as checkbox + timestamp + document version + member reference, recorded server-side) |
| Withdrawal supported | No. These are program terms. A member may stop participating at any time; credits already issued are governed by these terms and applicable law. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-026, XR-AFF-002, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Endorsement Guides |
| Review date | 2026-07-19 |

## 1. Purpose and scope

These terms define the Xenios Research member referral program at the program level: who may participate, what the reward is, how attribution and holds work, what voids a reward, and how the program is administered. The member-facing presentation of these rules is XR-MEM-026 (Member Referral and Store Credit Terms). The two documents intentionally coexist in draft. Where they differ, counsel will reconcile them; until then, the stricter reading controls.

The referral program is a personal-recommendation program for active members. It is not the affiliate program, not the Research Rep program, and not a sales role. Those programs have their own agreements (XR-AFF-002 and following).

## 2. The reward

```text
$15 store credit to the existing member
$10 store credit to the new member
14-day hold before issuance
```

Rewards are store credit only. They are never cash, never convertible to cash, and never payable outside the member's Xenios account. Reward amounts and the hold length are launch settings, admin-configurable, and any change applies prospectively with notice. A change never reduces a credit already issued.

## 3. Who may participate

1. Only active members may refer. A member whose access has ended (by cancellation or termination) has no active referral codes and earns no new credits.
2. The referred person goes through the full standard path: application, Samuel's personal review, identity and age verification (21+ only), agreements, the $50 activation payment, the $25 recurring monthly membership authorization, password, and mandatory MFA. A referral changes nothing about the standard of approval and creates no entitlement to approval.
3. Participation requires acceptance of the member-facing terms (XR-MEM-026) before the first referral code or link is issued.

## 4. Attribution

1. Each participating member receives a personal referral code or link.
2. Attribution is recorded by the system when the referred person applies at the private entrance using that code or link. The system of record is the server-side attribution ledger, not any statement by the referrer or the applicant.
3. One application carries at most one referral attribution. Conflicts (for example, two codes presented) resolve by [CONFIG: attribution conflict rule, first-touch by default].

## 5. The 14-day hold

A reward enters a 14-day hold when the referred person completes activation. The hold exists so credits are only issued for genuine, durable memberships. During the hold the reward is pending, not issued. The reward is voided if, during the hold, the referred member cancels, the activation payment is reversed or charged back, or a fraud condition in section 6 is found. After a clean hold, the credits are issued: $15 to the referring member and $10 to the new member.

Reward ledger states are: pending, held, approved (issued), reversed, and disputed. Xenios may extend a hold for a specific reward while an investigation under section 6 is open.

## 6. Fraud voids rewards

The program screens for, at minimum:

- self-referrals (referring yourself, an alternate identity, or an account you control),
- duplicate or fabricated identities,
- circular orders and refund farming (activations or purchases made to harvest credits and then unwound),
- code stuffing and prohibited placements [CONFIG: prohibited-placement list, for example coupon sites and paid search on Xenios terms],
- misleading paid search,
- fake leads or applications submitted by anyone other than the genuine applicant, and
- accounts created by the referrer on another person's behalf.

A fraud finding voids pending rewards and may reverse issued credits connected to the fraud. Deliberate referral fraud is grounds for suspension or termination of membership under the membership agreement. [COUNSEL: confirm the reversal and termination cross-references to the Founding Membership Agreement]

## 7. Applicant privacy is absolute

The referrer is never shown: whether a specific person applied, any application content, the reason an application was approved or not approved, or any applicant's or member's health, identity, or payment information. The referrals area shows the referrer only their own aggregate numbers: credits earned and credits pending. Rejection reasons are never exposed to anyone other than Xenios and, where Xenios chooses, the applicant.

## 8. Store credit

Store credit issued under this program follows the store credit rules in XR-MEM-026, including: redemption at checkout on eligible purchases, no cash value, no transfer or sale, launch-phase non-expiration, and forfeiture of unused credit at cancellation to the extent applicable law allows. [COUNSEL: state gift-card, stored-value, and unclaimed-property review is flagged in XR-MEM-026 and applies equally here]

## 9. The boundary with the affiliate and rep programs

The referral program pays nothing for recruiting, has no downline, has no rank, and requires no purchase. It rewards a personal recommendation with store credit, once, after a hold. Anyone who wants to promote Xenios publicly, at scale, or for monetary compensation must apply to the affiliate program (XR-AFF-002) or the Research Rep program (XR-AFF-003), which carry training, approved-content, and FTC disclosure obligations. A member who is also an approved affiliate or rep must keep the lanes separate: a given conversion is attributed to one program, never both. [CONFIG: cross-program attribution rule]

Members referring under this program must speak plainly and honestly, must not make health claims or outcome promises, and must not describe any product as approved, proven, or safe for everyone.

## 10. Administration

Samuel Boadu (samuel@xeniostechnology.com), as founder and server-enforced super administrator, may: configure reward amounts and hold length prospectively, review attribution, investigate suspected fraud, hold or release rewards, void or reverse rewards for cause under these terms, and suspend or close the program prospectively with notice. Referral, attribution, and credit-ledger records are retained under the Retention and Deletion Schedule (XR-POL-005) and survive membership cancellation to the extent required for audit, fraud, tax, and dispute purposes.

## 11. What these terms are not

These terms do not waive rights that cannot be waived under applicable law, and they do not relieve Xenios of duties imposed by law. Nothing here guarantees approval of any applicant, issuance of any credit outside the conditions above, or continuation of the program.

## Open items for counsel

- [COUNSEL: reconcile and, if appropriate, consolidate this program-level document with XR-MEM-026 (Member Referral and Store Credit Terms). The pair intentionally coexists in draft: XR-MEM-026 is presented to members, XR-AFF-001 governs the program. Decide whether they merge or remain a pair with one controlling]
- [COUNSEL: confirm the reversal and termination cross-references to the Founding Membership Agreement for referral fraud]
- [COUNSEL: state gift-card, stored-value, and unclaimed-property (escheat) review for store credit, as flagged in XR-MEM-026]
- [COUNSEL: confirm whether store-credit referral rewards trigger FTC endorsement-disclosure duties for members, and where the line sits between a rewarded referral and a compensated endorsement]
- [COUNSEL: confirm the retention period for referral, attribution, and credit-ledger records under XR-POL-005]
- [CONFIG: attribution conflict rule (first-touch default)]
- [CONFIG: prohibited-placement list for referral codes (coupon sites, paid search, and similar)]
- [CONFIG: cross-program attribution rule for members who are also approved affiliates or reps]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
