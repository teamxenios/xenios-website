# Source Registry

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-REG-007 |
| Title | Source Registry |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | updated when a source is added, re-verified, or replaced |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Permanent while the program operates; superseded versions archived per Document Control SOP (XR-REG-008) |
| Acceptance event | n/a (internal control document) |
| Withdrawal supported | No (internal control document) |
| Owner | Samuel Boadu, Founder |
| Dependencies | None |
| Sources | See 00-register/SOURCE_REGISTRY.md (this document is the registry) |
| Review date | 2026-07-19 |

## Purpose and rules

This registry is the single authoritative list of external sources used by the Xenios Research
document library. Documents in the library cite sources by short name or by source ID
(SRC-NNN). This registry carries the URLs, the verification status, and the verification dates.

Hard rules:

1. No URL appears anywhere in the library unless it appears in this registry.
2. Every URL in this registry comes from the master pack's official source registry
   (23_OFFICIAL_SOURCE_REGISTRY.md) or from the documented link verification of that registry.
   One substitution is recorded below (SRC-014).
3. Sources are re-verified before any document that relies on them is finalized for counsel.
4. This registry lists reference material. It does not interpret the law. Counsel pins exact
   citations before any document takes effect.

## Verification method and status values

All pack-registry URLs were checked on 2026-07-20: first by an automated HTTP check, then by
real-browser verification for every automated failure. Each source below carries one of three
statuses:

- **verified-automated (2026-07-20)**: the URL returned HTTP 200 to the automated check.
- **verified-browser (2026-07-20)**: the URL blocks automated link checkers (403 or timeout to
  scripts) but was confirmed live in a real browser, with the page title recorded.
- **interactive-tool-verify-manually**: an interactive application that cannot be verified
  page-by-page by a checker. Verify manually before relying on it in any filing or any
  customer-facing statement.

## Registered sources

### Shipping

- **SRC-001. USPS Notice 123 price list** (pack registry date: effective July 12, 2026)
  - URL: https://pe.usps.com/text/DMM300/Notice123.htm
  - Library use: shipping rate baselines for the commerce shipping documents (XR-COM-004,
    XR-COM-005, XR-COM-006) and the fulfillment SOP series (XR-FUL); input to the periodic
    review of the $12.95 standard shipping working rate.
  - Verification: verified-automated, 2026-07-20.

- **SRC-002. UPS shipping costs and 2026 rate guides**
  - URL: https://www.ups.com/us/en/support/shipping-support/shipping-costs-rates
  - Library use: carrier rate reference for XR-COM-004 and XR-COM-006 and the XR-FUL series.
  - Verification: verified-browser, 2026-07-20 (title "Shipping Costs and Rates | UPS - United
    States"). Note: blocks automated link checkers.

- **SRC-003. UPS rate calculator**
  - URL: https://wwwapps.ups.com/ctc/request/?loc=en_US
  - Library use: live rate quotes referenced by the expedited and temperature-controlled
    shipping disclosure (XR-COM-006) and fulfillment operations (XR-FUL).
  - Verification: interactive-tool-verify-manually. Interactive rate-calculator application;
    scripts time out and it was not browser-verified page-by-page. Verify manually before
    relying on it.

- **SRC-004. FedEx One Rate**
  - URL: https://www.fedex.com/en-us/shipping/one-rate.html
  - Library use: carrier service and rate reference for XR-COM-004 and the XR-FUL series.
  - Verification: verified-automated, 2026-07-20.

- **SRC-005. FedEx overnight**
  - URL: https://www.fedex.com/en-us/shipping/overnight.html
  - Library use: expedited service reference for XR-COM-006 and the XR-FUL series.
  - Verification: verified-automated, 2026-07-20.

- **SRC-006. FedEx same-day**
  - URL: https://www.fedex.com/en-us/shipping/same-day.html
  - Library use: same-day service reference for XR-COM-006 (eligible ZIPs) and the XR-FUL series.
  - Verification: verified-automated, 2026-07-20.

### Peptides and intended use

- **SRC-007. FDA warning letter, Gram Peptides** (pack registry date: March 31, 2026)
  - URL: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/gram-peptides-721806-03312026
  - Library use: enforcement posture reference for the research-product classification lane:
    the Research Material Acknowledgment Template (XR-COM-016), the Claims and Content Policy
    (XR-AFF-009), and the classification and marketing-lane review documents in the XR-POL series.
  - Verification: verified-automated, 2026-07-20.

- **SRC-008. FDA warning letter, Wholesale Peptide** (pack registry date: June 17, 2026)
  - URL: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/wholesale-peptide-729447-06172026
  - Library use: same series as SRC-007 (XR-COM-016, XR-AFF-009, XR-POL classification and
    marketing-lane review).
  - Verification: verified-automated, 2026-07-20.

### Supplements

- **SRC-009. FDA information for industry, dietary supplements**
  - URL: https://www.fda.gov/food/dietary-supplements/information-industry-dietary-supplements
  - Library use: supplement acknowledgments and product onboarding (XR-COM-014, XR-COM-015)
    and the supplement claims sections of XR-AFF-009.
  - Verification: verified-automated, 2026-07-20.

- **SRC-010. FDA guidance and regulation, food and dietary supplements**
  - URL: https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements
  - Library use: regulatory background for the supplement lane documents (XR-COM-014,
    XR-COM-015) and supplement onboarding gates.
  - Verification: verified-automated, 2026-07-20.

- **SRC-011. FDA food-facility registration**
  - URL: https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements/registration-food-facilities-and-other-submissions
  - Library use: fulfillment and supplier qualification documents (XR-FUL series) where
    facility status is relevant.
  - Verification: verified-automated, 2026-07-20.

- **SRC-012. FDA adverse-event reporting and recordkeeping for dietary supplements**
  - URL: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-questions-and-answers-regarding-adverse-event-reporting-and-recordkeeping-dietary
  - Library use: the Supplement Acknowledgment (XR-COM-015) and the adverse-event and product
    issue handling documents in the XR-POL and XR-FUL series.
  - Verification: verified-automated, 2026-07-20.

- **SRC-013. FDA structure/function claim notification for dietary supplements**
  - URL: https://www.fda.gov/food/registration-food-facilities-and-other-submissions/structurefunction-claim-notification-dietary-supplements-electronic-submissions
  - Library use: supplement claims boundaries in XR-COM-015 and XR-AFF-009.
  - Verification: verified-automated, 2026-07-20.

### Privacy and health data

- **SRC-014. HHS Covered Entities and Business Associates page** (substituted source, see note)
  - URL: https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html
  - Library use: the HIPAA applicability analysis (XR-POL-009) and the privacy notice series
    (XR-POL); background for the position that HIPAA covered-entity status is under analysis.
  - Verification: verified-browser, 2026-07-20 (title "Covered Entities and Business
    Associates | HHS.gov").
  - **Substitution note**: the pack registry listed the HHS guidance-portal covered-entity page
    (superseded URL: https://www.hhs.gov/guidance/document/are-you-covered-entity ). On
    2026-07-20 that URL returned "Access denied" even in a real browser, so it is treated as
    restricted or moved and must not be cited. The canonical HHS page above is registered in
    its place. Counsel to confirm the substitution.

- **SRC-015. HHS business associates guidance**
  - URL: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html
  - Library use: XR-POL-009 and vendor and processor documents that address business associate
    analysis (XR-POL series, XR-AFF-012).
  - Verification: verified-browser, 2026-07-20 (title "Business Associates | HHS.gov").
    Note: blocks automated link checkers.

- **SRC-016. FTC Health Breach Notification Rule guidance**
  - URL: https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0
  - Library use: the breach notification and incident documents in the XR-POL series and the
    HBNR applicability analysis; relevant to tracker health data (XR-TRK series).
  - Verification: verified-automated, 2026-07-20.

- **SRC-017. FTC Mobile Health Apps Interactive Tool**
  - URL: https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool
  - Library use: framework check for the tracker and health data documents (XR-TRK, XR-POL-009).
  - Verification: verified-automated, 2026-07-20.

- **SRC-018. Texas Data Privacy and Security Act (Texas Attorney General)**
  - URL: https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act
  - Library use: representative state consumer privacy statute for the privacy notice series
    (XR-POL) and the jurisdiction and applicability matrix.
  - Verification: verified-automated, 2026-07-20.

### Identity and cybersecurity

- **SRC-019. NIST SP 800-63-4, Digital Identity Guidelines**
  - URL: https://csrc.nist.gov/pubs/sp/800/63/4/final
  - Library use: identity verification, authentication, and MFA documents in the XR-POL series
    and the member activation flow documents (XR-MEM series).
  - Verification: verified-automated, 2026-07-20.

- **SRC-020. NIST SP 800-63A-4, Identity Proofing and Enrollment**
  - URL: https://csrc.nist.gov/pubs/sp/800/63/A/4/final
  - Library use: the identity and age verification documents (XR-MEM activation series,
    XR-POL identity proofing).
  - Verification: verified-automated, 2026-07-20.

- **SRC-021. OWASP Application Security Verification Standard (ASVS)**
  - URL: https://owasp.org/www-project-application-security-verification-standard/
  - Library use: security policy and control documents in the XR-POL series.
  - Verification: verified-automated, 2026-07-20.

- **SRC-022. OWASP Authentication Cheat Sheet**
  - URL: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - Library use: password, MFA, and session control documents (XR-POL series, XR-MEM
    activation flow).
  - Verification: verified-automated, 2026-07-20.

- **SRC-023. OWASP Forgot Password Cheat Sheet**
  - URL: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
  - Library use: account recovery and reset documents (XR-POL series, XR-MEM account documents).
  - Verification: verified-automated, 2026-07-20.

### Marketing, affiliates, and recurring payments

- **SRC-024. FTC Health Products Compliance Guidance**
  - URL: https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance
  - Library use: claims substantiation boundaries across the partner conduct series
    (XR-AFF-009, XR-AFF-010, XR-AFF-013, XR-AFF-014) and product acknowledgment series
    (XR-COM-014, XR-COM-015).
  - Verification: verified-automated, 2026-07-20.

- **SRC-025. FTC endorsements, influencers, and reviews**
  - URL: https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews
  - Library use: the FTC Disclosure Policy (XR-AFF-008) and every partner document that cites
    the FTC Endorsement Guides (XR-AFF series, XR-MEM-026).
  - Verification: verified-automated, 2026-07-20.

- **SRC-026. FTC Disclosures 101 for Social Media Influencers**
  - URL: https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
  - Library use: XR-AFF-008 and the Social Media Policy (XR-AFF-010); partner certification
    training material.
  - Verification: verified-automated, 2026-07-20.

- **SRC-027. FTC Negative Option Rule page**
  - URL: https://www.ftc.gov/legal-library/browse/rules/negative-option-rule
  - Library use: the membership and product subscription documents (XR-MEM recurring payment
    authorization, XR-COM-002, XR-COM-003) and cancellation flow documents.
  - Verification: verified-automated, 2026-07-20.

- **SRC-028. FTC CAN-SPAM Act compliance guide**
  - URL: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
  - Library use: email and outreach conduct documents (XR-AFF-002, XR-AFF-003, XR-AFF-011)
    and member communication policies (XR-POL series).
  - Verification: verified-automated, 2026-07-20.

- **SRC-029. FTC Telemarketing Sales Rule compliance guide**
  - URL: https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule
  - Library use: partner outreach and lead handling documents (XR-AFF-011, XR-AFF-013) and
    related conduct policies.
  - Verification: verified-automated, 2026-07-20.

### Supplement brands

- **SRC-030. Momentous collections**
  - URL: https://www.livemomentous.com/collections
  - Library use: internal business context for supplement candidate selection and reseller
    authorization gating (supplement onboarding documents in the XR-COM and XR-FUL series).
    Not a legal authority.
  - Verification: verified-automated, 2026-07-20.

- **SRC-031. Momentous shop all**
  - URL: https://www.livemomentous.com/collections/shop-all
  - Library use: same as SRC-030. Not a legal authority.
  - Verification: verified-automated, 2026-07-20.

- **SRC-032. Momentous best sellers**
  - URL: https://www.livemomentous.com/collections/best-sellers
  - Library use: same as SRC-030. Not a legal authority.
  - Verification: verified-automated, 2026-07-20.

- **SRC-033. Pure Encapsulations best sellers**
  - URL: https://www.pureencapsulationspro.com/our-products/best-sellers.html
  - Library use: same as SRC-030. Not a legal authority.
  - Verification: verified-browser, 2026-07-20 (title "Best Sellers"). Note: blocks automated
    link checkers.

- **SRC-034. Pure Encapsulations Pure Select 10**
  - URL: https://www.pureencapsulationspro.com/pure-select-10.html
  - Library use: same as SRC-030. Not a legal authority.
  - Verification: not individually verified. The page returns HTTP 403 to automated link
    checkers. The domain and its best-sellers page (SRC-033) were verified in a real browser
    on 2026-07-20; verify this specific page manually before relying on it.

## Authorities cited by name in the library

The documents below the register also cite the following laws, rules, and statute families by
name only. This registry deliberately carries no URL for them unless a registered source above
already covers the authority, in which case the source ID is cross-referenced. Counsel pins
the exact citations (statute sections, CFR parts, and controlling state provisions) before any
document takes effect.

| Authority | Registered source coverage |
| --- | --- |
| CAN-SPAM Act | SRC-028 (FTC compliance guide) |
| Telephone Consumer Protection Act (TCPA) | None registered; counsel to pin citation |
| FTC Negative Option Rule | SRC-027 (FTC rule page) |
| Restore Online Shoppers' Confidence Act (ROSCA) | None registered; counsel to pin citation |
| E-SIGN Act | None registered; counsel to pin citation |
| Uniform Electronic Transactions Act (UETA) | None registered; counsel to pin citation |
| HIPAA | SRC-014, SRC-015 (HHS covered entity and business associate pages) |
| FTC Health Breach Notification Rule | SRC-016 (FTC guidance) |
| Dietary Supplement Health and Education Act (DSHEA) | Topic covered by SRC-009 through SRC-013; counsel to pin citation |
| FTC Endorsement Guides | SRC-025, SRC-026 (FTC guidance pages) |
| State consumer privacy statute family | SRC-018 (Texas DPSA only); other states none registered; counsel to pin per state |
| State consumer health data statute family | None registered; counsel to pin per state |
| State biometric statute family | None registered; counsel to pin per state |
| State auto-renewal statute family | None registered; counsel to pin per state |

## Change control

Adding, re-verifying, or replacing a source follows the Document Control SOP (XR-REG-008):
record the source name, URL, intended library use, verification method, verification date, and
(for replacements) the superseded URL and the reason. A source that fails re-verification is
marked accordingly, and every document citing it is flagged for review before its next release.

## Open items for counsel

- Confirm the SRC-014 substitution: the pack registry's HHS guidance-portal covered-entity URL
  returned "Access denied" even in a real browser on 2026-07-20, so the canonical HHS Covered
  Entities and Business Associates page was registered in its place.
- Pin exact citations (statute sections, CFR parts, controlling state provisions) for every
  authority listed in "Authorities cited by name in the library", including TCPA, ROSCA,
  E-SIGN, UETA, DSHEA, and the state statute families.
- SRC-003 (UPS rate calculator) is an interactive tool and was not verified page-by-page;
  confirm it is acceptable as an operational reference and that no document treats it as a
  citable authority.
- Confirm whether the commercial brand pages (SRC-030 through SRC-034) should remain in this
  registry as internal business context or be moved to a separate operational reference list.
- Select the controlling state statutes per state for the privacy, consumer health data,
  biometric, and auto-renewal families in the jurisdiction and applicability matrix; SRC-018
  covers Texas only.
- Earlier drafts in this worktree under docs/compliance/, docs/privacy/, docs/security/, and
  docs/risk/ may cite sources inline; reconcile those citations with this registry so that no
  URL exists in the library outside this document.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
